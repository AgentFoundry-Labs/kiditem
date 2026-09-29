import { openOperatorTab } from '../operator-tab';
import type { TabPages } from '../tab-page';
import {
  orderStep,
  sellpiaStepFailure,
  SELLPIA_ORDER_UPLOAD_URL,
  SELLPIA_STOCKMATCH_URL,
  SELLPIA_TAB_MATCH,
  type SellpiaPageAnswer,
} from './order-page';

/** 옛 단계 제한 시간(등록 70초, 자동합포·재고매칭 200초). */
const REGISTER_TIMEOUT_MS = 70_000;
const STOCKMATCH_TIMEOUT_MS = 200_000;
/** 계약 상한(`SellpiaPostTransferStepSchema.unmatchedOrderNumbers`). */
const UNMATCHED_MAX = 2_000;

interface RegisterAnswer extends SellpiaPageAnswer {
  registered?: number | null;
  message?: string;
}

interface StockmatchAnswer extends SellpiaPageAnswer {
  matched?: number;
  unmatched?: Array<{ groupNo?: string }>;
  message?: string;
}

/** 후처리 한 번의 운영자 탭. 단계마다 부르고 끝나면 `done`(탭은 운영자에게 둔다). */
export interface SellpiaPostTransferSession {
  register(): Promise<{ registered: number | null; message: string | null }>;
  stockmatch(): Promise<{ matched: number; unmatchedOrderNumbers: string[]; message: string | null }>;
  done(): Promise<void>;
}

/**
 * 셀피아 전송 뒤 후처리(KID-366 wave8b, 옛 `runSellpiaPostTransfer`): 주문서수집 화면의 [등록] → 재고매칭 화면으로 옮겨
 * [조회] → 자동합포 → 자동재고매칭 → 미매칭 보고. 대상 제한 없이 화면 전체다(옛 규칙). 셀피아에 쓰는 단계라 운영자 셀피아 탭을
 * 쓰고 앞으로 가져온다. 단계 실패는 던진다(로그인 `SITE_LOGIN_REQUIRED`, 화면 미판독 `SELLPIA_SCREEN_UNREADABLE`, 셀피아가
 * 거절 `SITE_REQUEST_FAILED`).
 */
export function createSellpiaPostTransfer(tabs: TabPages) {
  return {
    async openPostTransfer(): Promise<SellpiaPostTransferSession> {
      const { page } = await openOperatorTab(tabs, {
        matches: ['https://*.sellpia.com/order_collect.html*', SELLPIA_TAB_MATCH],
        url: SELLPIA_ORDER_UPLOAD_URL,
        stay: (current) => current.includes('order_collect.html'),
      });
      return {
        async register() {
          const answer = await orderStep<RegisterAnswer>(page, 'register', [], REGISTER_TIMEOUT_MS);
          if (!answer?.success) throw sellpiaStepFailure(answer, SELLPIA_ORDER_UPLOAD_URL);
          return { registered: typeof answer.registered === 'number' ? answer.registered : null, message: answer.message ?? null };
        },
        async stockmatch() {
          await page.navigate(SELLPIA_STOCKMATCH_URL, { timeoutMs: 30_000 });
          const answer = await orderStep<StockmatchAnswer>(page, 'stockmatch', [], STOCKMATCH_TIMEOUT_MS);
          if (!answer?.success) throw sellpiaStepFailure(answer, SELLPIA_STOCKMATCH_URL);
          const unmatched = [...new Set((answer.unmatched ?? []).map((row) => String(row.groupNo ?? '').trim()).filter(Boolean))];
          return { matched: typeof answer.matched === 'number' ? answer.matched : 0, unmatchedOrderNumbers: unmatched.slice(0, UNMATCHED_MAX), message: answer.message ?? null };
        },
        done: () => page.leave(),
      };
    },
  };
}
