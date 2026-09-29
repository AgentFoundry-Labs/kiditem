import { RuntimeError } from '../../core/errors';
import { openOperatorTab } from '../operator-tab';
import type { TabPage, TabPages } from '../tab-page';
import {
  answerLost,
  injectOrderFile,
  orderStep,
  sellpiaStepFailure,
  SELLPIA_ORDER_UPLOAD_URL,
  SELLPIA_SCREEN_UNREADABLE,
  SELLPIA_STOCKMATCH_URL,
  SELLPIA_TAB_MATCH,
  type SellpiaPageAnswer,
} from './order-page';

/** 옛 주입 제한 시간(45초)·확인 단계(90초). */
const INJECT_TIMEOUT_MS = 45_000;
const VERIFY_TIMEOUT_MS = 90_000;

export interface SellpiaTransferInput {
  shopName: string;
  fileName: string;
  fileBase64: string;
  targetOrderNumbers: readonly string[];
}

/**
 * 전송 한 번의 결과(판정은 수집기가 한다). `verification`은 접수 결과를 몰라(`unknown`) 대기목록·재고매칭 두 화면으로 다시
 * 확인한 것 — 찾은 번호, 못 찾은 번호, 읽은 화면 수(0이면 확인도 못 했다).
 */
export interface SellpiaTransferAttempt {
  outcome: 'submitted' | 'not_submitted' | 'unknown';
  acceptedOrderNumbers: string[];
  baselineRows: number | null;
  afterRows: number | null;
  mallMessage: string | null;
  verification: { found: string[]; missing: string[]; screensRead: number } | null;
}

interface InjectAnswer extends SellpiaPageAnswer {
  outcome?: 'submitted' | 'not_submitted' | 'unknown';
  pendingRowsBefore?: number;
  pendingRows?: number;
  acceptedTargetOrderNumbers?: string[];
}

interface VerifyAnswer extends SellpiaPageAnswer {
  found?: Array<{ orderNo: string }>;
}

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null);

/**
 * 셀피아 주문 파일 전송(KID-366 wave8b, 옛 `sendOrderFileToSellpia`). 셀피아에 쓰는 단계라 운영자 셀피아 탭(주문서수집 화면이
 * 먼저)을 쓰고 앞으로 가져온다. 판매처를 고르고 파일을 넣어 [주문접수]를 누른다(처리기 `sellpia.injectOrderFile`). 접수 결과를
 * 모르면(누른 뒤 행 증가를 못 봤거나 답이 끊김) 같은 탭에서 대기목록 → 재고매칭 화면 순으로 대상 번호를 찾고 처음 찾은
 * 화면에서 멈춘다(옛 `verifySellpiaOrderReceipt`). 탭은 끝나도 운영자에게 둔다.
 */
export function createSellpiaTransfer(tabs: TabPages) {
  return {
    async transferOrderFile(input: SellpiaTransferInput): Promise<SellpiaTransferAttempt> {
      const { page } = await openOperatorTab(tabs, {
        matches: ['https://*.sellpia.com/order_collect.html*', SELLPIA_TAB_MATCH],
        url: SELLPIA_ORDER_UPLOAD_URL,
        stay: (current) => current.includes('order_collect.html'),
      });
      try {
        let answer: InjectAnswer;
        try {
          answer = await injectOrderFile<InjectAnswer>(page, {
            shopName: input.shopName,
            fileName: input.fileName,
            fileBase64: input.fileBase64,
            targetOrderNumbers: [...input.targetOrderNumbers],
          }, INJECT_TIMEOUT_MS);
        } catch (error) {
          // 응답 유실·시간 초과는 눌렀는지 모른다 — 아래 셀피아 조회로 확인한다. 로그인 문턱(누르기 전)은 그대로 던진다.
          if (!answerLost(error)) throw error;
          answer = { outcome: 'unknown', error: (error as RuntimeError).message };
        }
        if (answer.loginRequired) throw sellpiaStepFailure(answer, SELLPIA_ORDER_UPLOAD_URL);
        const attempt: SellpiaTransferAttempt = {
          outcome: answer.outcome === 'submitted' || answer.outcome === 'not_submitted' ? answer.outcome : 'unknown',
          acceptedOrderNumbers: answer.outcome === 'submitted' ? [...new Set(answer.acceptedTargetOrderNumbers ?? [])] : [],
          baselineRows: count(answer.pendingRowsBefore),
          afterRows: count(answer.pendingRows),
          mallMessage: answer.outcome === 'submitted' ? null : (answer.error?.slice(0, 500) ?? null),
          verification: null,
        };
        if (attempt.outcome === 'not_submitted' && answer.unreadable) {
          throw new RuntimeError(SELLPIA_SCREEN_UNREADABLE, answer.error ?? '셀피아 주문접수 화면을 읽지 못했습니다.', { url: SELLPIA_ORDER_UPLOAD_URL });
        }
        if (attempt.outcome === 'unknown') attempt.verification = await verify(page, input.targetOrderNumbers);
        return attempt;
      } finally {
        await page.leave();
      }
    },
  };
}

/** 두 화면(대기목록 → 재고매칭)에서 대상 번호를 찾는다. 한 화면에서라도 찾으면 거기서 멈춘다. 확인 중 오류는 못 읽은 화면이다. */
async function verify(page: TabPage, targets: readonly string[]): Promise<SellpiaTransferAttempt['verification']> {
  let screensRead = 0;
  for (const [index, url] of [SELLPIA_ORDER_UPLOAD_URL, SELLPIA_STOCKMATCH_URL].entries()) {
    try {
      if (index > 0) await page.navigate(url, { timeoutMs: 30_000 });
      const answer = await orderStep<VerifyAnswer>(page, 'verify', targets, VERIFY_TIMEOUT_MS);
      if (!answer?.success) continue;
      screensRead += 1;
      const found = [...new Set((answer.found ?? []).map((row) => row.orderNo))];
      if (found.length > 0) return { found, missing: targets.filter((target) => !found.includes(target)), screensRead };
    } catch {
      // 누른 뒤의 확인이다 — 로그인 화면·시간 초과도 실패로 끝내지 않고 못 읽은 화면으로 센다(결과는 확인 대기).
    }
  }
  return { found: [], missing: [...targets], screensRead };
}
