import {
  SELLPIA_ORDER_TRANSFER_CHUNK_KIND,
  SELLPIA_ORDER_TRANSFER_KIND,
  SellpiaOrderTransferPlanSchema,
  type SellpiaOrderTransferEvidence,
  type SellpiaOrderTransferPlan,
  type SellpiaOrderTransferResult,
} from '@kiditem/shared/orders-action-operations';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 전송 한 번의 결과(`sites/sellpia` `transfer.ts`와 같은 모양). 판정은 이 수집기가 한다. */
export interface SellpiaTransferAttempt {
  outcome: 'submitted' | 'not_submitted' | 'unknown';
  acceptedOrderNumbers: string[];
  baselineRows: number | null;
  afterRows: number | null;
  mallMessage: string | null;
  /** 결과를 몰라 두 화면(대기목록·재고매칭)으로 다시 확인한 것. `screensRead` 0이면 확인도 못 했다. */
  verification: { found: string[]; missing: string[]; screensRead: number } | null;
}

/** 이 수집기가 셀피아에서 쓰는 것(`sites/sellpia`가 구현). 운영자 셀피아 탭에서 파일을 넣고 [주문접수]를 누른다. */
export interface SellpiaTransferSite {
  transferOrderFile(input: { shopName: string; fileName: string; fileBase64: string; targetOrderNumbers: readonly string[] }): Promise<SellpiaTransferAttempt>;
}

type TransferResult = SellpiaOrderTransferResult & Record<string, unknown>;

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const SELLPIA_TRANSFER_NOT_SUBMITTED = 'SELLPIA_TRANSFER_NOT_SUBMITTED' as const;
/** 두 확인 화면(대기목록·재고매칭). 둘 다 읽고 하나도 없을 때만 "접수 안 됨"이다. */
const VERIFY_SCREENS = 2;
const NOT_FOUND_MESSAGE = '셀피아에서 이 파일의 주문을 찾지 못했습니다. 접수되지 않았으므로 다시 전송해도 됩니다.';

/** 바이트 → base64(큰 파일도 호출 스택을 넘지 않게 나눠 붙인다). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * `orders.sellpia_order_transfer`(KID-366 wave8b, 옛 워커의 셀피아 전송 액션): owner가 plan에서 원천 실행으로 다시 만든 변환
 * 파일(`GET /api/orders/action-operations/:id/source`, runner가 받아 준다)을 운영자 셀피아 탭의 주문서수집 화면에 넣고 [주문접수]를
 * 누른다. 판정(옛 규칙): 행이 늘면 `submitted`. 결과를 모르면 두 화면에서 대상 번호를 찾아 — 전부 찾으면 `submitted`, 두 화면을
 * 다 읽고 0건이면 `not_submitted`(`SELLPIA_TRANSFER_NOT_SUBMITTED` 실패, 재전송 허용), 그 밖(일부만·확인 못 함)은 재전송하면
 * 중복될 수 있어 `reconciling`(운영자가 셀피아에서 확인해 confirm/close). `transfer_evidence` 청크는 실행당 하나다.
 */
export const sellpiaOrderTransferCollector: Collector<SellpiaOrderTransferPlan, TransferResult, SellpiaTransferSite> = {
  kind: SELLPIA_ORDER_TRANSFER_KIND,
  site: 'sellpia',
  sourcePath: (operationId) => `/api/orders/action-operations/${encodeURIComponent(operationId)}/source`,
  async *collect(rawPlan, site, { readSource }): AsyncGenerator<CollectedChunk, CollectFinish<TransferResult>, undefined> {
    const parsed = SellpiaOrderTransferPlanSchema.safeParse(rawPlan);
    if (!parsed.success || !site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 전송 계획이 올바르지 않습니다.', { kind: SELLPIA_ORDER_TRANSFER_KIND });
    const plan = parsed.data;
    const file = readSource ? await readSource() : null;
    if (!file || file.byteLength === 0) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아로 보낼 파일을 받지 못했습니다.', { kind: SELLPIA_ORDER_TRANSFER_KIND });
    }
    const attempt = await site.transferOrderFile({
      shopName: plan.shopName,
      fileName: plan.fileName,
      fileBase64: toBase64(file),
      targetOrderNumbers: plan.targetOrderNumbers,
    });

    const verification = attempt.verification;
    let outcome: SellpiaOrderTransferEvidence['outcome'] = attempt.outcome;
    let accepted = attempt.acceptedOrderNumbers;
    let failureMessage = attempt.mallMessage ?? '셀피아가 주문 파일을 받지 않았습니다.';
    if (attempt.outcome === 'unknown' && verification) {
      accepted = verification.found;
      if (verification.found.length > 0 && verification.missing.length === 0) outcome = 'submitted';
      else if (verification.found.length === 0 && verification.screensRead >= VERIFY_SCREENS) {
        outcome = 'not_submitted';
        failureMessage = NOT_FOUND_MESSAGE;
      }
    }
    const evidence: SellpiaOrderTransferEvidence = {
      outcome,
      acceptedOrderNumbers: [...new Set(accepted)],
      baselineRows: attempt.baselineRows ?? 0,
      afterRows: attempt.afterRows ?? 0,
      mallMessage: attempt.mallMessage?.slice(0, 500) ?? null,
    };
    yield { chunkKind: SELLPIA_ORDER_TRANSFER_CHUNK_KIND, payload: [evidence], progress: { outcome } };
    if (outcome === 'not_submitted') {
      throw new RuntimeError(SELLPIA_TRANSFER_NOT_SUBMITTED, failureMessage, { kind: SELLPIA_ORDER_TRANSFER_KIND });
    }
    const result: TransferResult = {
      outcome: 'submitted',
      acceptedOrderNumbers: evidence.acceptedOrderNumbers,
      targetOrderCount: plan.targetOrderNumbers.length,
    };
    // 일부만 확인했거나 확인하지 못했다 — 운영자가 셀피아에서 확인해 닫는다(재전송하면 중복될 수 있다).
    return outcome === 'submitted' ? { result } : { outcome: 'reconciling', result };
  },
};

registerCollector(sellpiaOrderTransferCollector);
