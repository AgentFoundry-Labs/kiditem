import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import type { TabPage } from '../tab-page';
import { SELLPIA_ORIGIN, SELLPIA_PAGE_GUARD } from './tracking';

/** 주문서수집(파일 업로드) 화면 — 전송·등록·스냅샷 대기목록(옛 `SELLPIA_ORDER_UPLOAD_URL`). */
export const SELLPIA_ORDER_UPLOAD_URL = `${SELLPIA_ORIGIN}/order_collect.html?ctype=OM_FILE`;
/** 재고매칭 화면 — 자동합포·자동재고매칭, 스냅샷·확인의 두 번째 화면. */
export const SELLPIA_STOCKMATCH_URL = `${SELLPIA_ORIGIN}/order_stockmatch.html`;
/** 송장채번 화면. */
export const SELLPIA_INVOICE_URL = `${SELLPIA_ORIGIN}/order_delivery_link.html`;
/** 운영자 셀피아 탭 무늬(옛 `SELLPIA_TAB_MATCHES`). */
export const SELLPIA_TAB_MATCH = 'https://*.sellpia.com/*';
export const SELLPIA_ORDER_ACTIONS_FILE = 'content/orders/sellpia-order-actions.js';
export const SELLPIA_SCREEN_UNREADABLE = 'SELLPIA_SCREEN_UNREADABLE' as const;

const LOGIN_MESSAGE = '셀피아 로그인이 필요합니다. 열려 있는 셀피아 탭에서 로그인한 뒤 다시 실행해 주세요.';

/** 처리기 답의 공통 칸(`content/orders/sellpia-order-actions.js`). */
export interface SellpiaPageAnswer {
  success?: boolean;
  loginRequired?: boolean;
  unreadable?: boolean;
  error?: string;
}

export type SellpiaOrderStep = 'verify' | 'orderSnapshot' | 'register' | 'stockmatch' | 'invoice';

/** 셀피아 화면의 단계 하나(`sellpia.orderStep`). 시간 제한은 옛 단계별 값이다. */
export function orderStep<T extends SellpiaPageAnswer>(page: TabPage, step: SellpiaOrderStep, targetOrderNumbers: readonly string[], timeoutMs: number): Promise<T> {
  return callPage<T>(page, 'sellpia.orderStep', { step, targetOrderNumbers }, {
    timeoutMs,
    guard: SELLPIA_PAGE_GUARD,
    main: [SELLPIA_ORDER_ACTIONS_FILE],
    displayName: '셀피아',
  });
}

/** 파일 주입(`sellpia.injectOrderFile`). */
export function injectOrderFile<T extends SellpiaPageAnswer>(page: TabPage, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
  return callPage<T>(page, 'sellpia.injectOrderFile', args, {
    timeoutMs,
    guard: SELLPIA_PAGE_GUARD,
    main: [SELLPIA_ORDER_ACTIONS_FILE],
    displayName: '셀피아',
  });
}

/**
 * 성공하지 못한 처리기 답 → 오류. 로그인 화면은 `SITE_LOGIN_REQUIRED`(탭을 운영자에게 남긴다), 그리드·버튼을 못 찾은 것은
 * `SELLPIA_SCREEN_UNREADABLE`, 그 밖(셀피아가 거절·확인창 없음)은 `SITE_REQUEST_FAILED`(`mall_refused`) — 문장은 셀피아의 말.
 */
export function sellpiaStepFailure(answer: SellpiaPageAnswer | null | undefined, url: string): RuntimeError {
  if (answer?.loginRequired) return new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url });
  const message = answer?.error?.trim() || '셀피아 화면에서 결과를 읽지 못했습니다.';
  if (answer?.unreadable || !answer) return new RuntimeError(SELLPIA_SCREEN_UNREADABLE, message, { url });
  return new RuntimeError(SITE_REQUEST_FAILED, message, { status: null, reason: 'mall_refused', url });
}

/** 셀피아 페이지 호출의 답이 끊겼다(시간 초과·처리기 오류) — 누른 뒤일 수 있다. 로그인 문턱 같은 누르기 전 실패는 아니다. */
export function answerLost(error: unknown): boolean {
  return isRuntimeError(error) && error.code === SITE_REQUEST_FAILED
    && (error.details?.reason === 'timeout' || error.details?.reason === 'page_error');
}
