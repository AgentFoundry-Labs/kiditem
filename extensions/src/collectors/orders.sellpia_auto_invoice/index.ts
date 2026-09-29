import {
  SELLPIA_AUTO_INVOICE_CHUNK_KIND,
  SELLPIA_AUTO_INVOICE_KIND,
  SellpiaAutoInvoicePlanSchema,
  type SellpiaAutoInvoicePlan,
  type SellpiaAutoInvoiceResult,
  type SellpiaInvoiceRow,
} from '@kiditem/shared/orders-action-operations';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 채번 한 번(`sites/sellpia` `invoice.ts`와 같은 모양). */
export interface SellpiaInvoiceAttempt {
  state: 'not_pressed' | 'pressed' | 'unknown';
  selectedOrderNumbers: string[];
  issued: SellpiaInvoiceRow[];
  message: string | null;
}

export interface SellpiaAutoInvoiceSite {
  issueInvoices(targetOrderNumbers: readonly string[]): Promise<SellpiaInvoiceAttempt>;
}

type AutoInvoiceResult = SellpiaAutoInvoiceResult & Record<string, unknown>;

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const CHUNK_ROWS = 2_000;

/**
 * `orders.sellpia_auto_invoice`(KID-366 wave8b, 옛 `sellpiaAutoInvoice`). ⚠️비가역 — 셀피아가 실제 송장번호를 발급한다. owner
 * plan의 `targetOrderNumbers`만 운영자 셀피아 탭의 송장채번 그리드에서 골라(접두어 `_:|/ -` 허용) [송장번호채번]을 누른다.
 * - 일치 행이 0이면 누르지 않고 발급 없이 성공(리더 결정 — 대기 행 전체 채번 금지).
 * - 눌렀고 고른 번호마다 발급 행을 읽으면 `invoice_rows`와 성공. 하나라도 못 읽었거나 눌렀는지 모르면 `reconciling`.
 * begin 실행은 `maxAttempts 1`이라 임대 만료 뒤 다시 claim되지 않는다(이중 채번 방지는 계약).
 */
export const sellpiaAutoInvoiceCollector: Collector<SellpiaAutoInvoicePlan, AutoInvoiceResult, SellpiaAutoInvoiceSite> = {
  kind: SELLPIA_AUTO_INVOICE_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site): AsyncGenerator<CollectedChunk, CollectFinish<AutoInvoiceResult>, undefined> {
    const parsed = SellpiaAutoInvoicePlanSchema.safeParse(rawPlan);
    if (!parsed.success || !site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 자동송장 계획이 올바르지 않습니다.', { kind: SELLPIA_AUTO_INVOICE_KIND });
    const targets = parsed.data.targetOrderNumbers;
    const attempt = await site.issueInvoices(targets);
    const selected = new Set(attempt.selectedOrderNumbers);
    const issued = attempt.issued.filter((row, index, rows) => rows.findIndex((other) => other.orderNo === row.orderNo) === index);
    const progress = { issued: issued.length };
    const buffer = new ChunkBuffer<SellpiaInvoiceRow>({ maxItems: CHUNK_ROWS, label: '셀피아 송장 한 줄' });
    for (const row of issued) {
      const full = buffer.push(row);
      if (full) yield { chunkKind: SELLPIA_AUTO_INVOICE_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: SELLPIA_AUTO_INVOICE_CHUNK_KIND, payload: rest, progress };

    const result: AutoInvoiceResult = {
      issued,
      selectedOrderNumbers: [...selected],
      // 눌렀는지 모르면 무엇이 그리드에 없었는지도 단정하지 않는다.
      notFoundOrderNumbers: attempt.state === 'unknown' ? [] : targets.filter((target) => !selected.has(target)),
    };
    if (attempt.state === 'not_pressed') return { result };
    const issuedNumbers = new Set(issued.map((row) => row.orderNo));
    const allRead = attempt.state === 'pressed' && selected.size > 0 && [...selected].every((orderNo) => issuedNumbers.has(orderNo));
    return allRead ? { result } : { outcome: 'reconciling', result };
  },
};

registerCollector(sellpiaAutoInvoiceCollector);
