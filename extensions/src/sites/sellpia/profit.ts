import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { withFreshTab } from '../fresh-tab';
import type { TabPage, TabPages } from '../tab-page';
import { SELLPIA_ORIGIN, SELLPIA_PAGE_GUARD } from './tracking';

/** 상품별 이익현황 화면. 조회 요청(`stat_action.ajax.html`)은 이 화면의 상대 주소다. */
export const SELLPIA_PROFIT_URL = `${SELLPIA_ORIGIN}/stat_prd_profit.html#none`;
export const SELLPIA_PROFIT_FILE = 'content/orders/sellpia-profit.js';
/** 옛 수집기의 주입 제한 시간(90초)을 조회 한 번마다 쓴다. */
const QUERY_TIMEOUT_MS = 90_000;

/** 한 번 조회한 상품 한 줄(판매 그래프의 월 값과 셀피아 상단 합계). */
export interface SellpiaProfitRowProduct {
  productCode: string;
  optionCode: string;
  productName: string;
  optionName?: string;
  providerName?: string;
  salePrice: number;
  buyPrice: number;
  barcode?: string;
  months: Array<{ yearMonth: string; inAmount: number; orderAmount: number; orderQty: number }>;
  totalOrderAmount: number;
  totalOrderQty: number;
  totalInAmount: number;
  totalInQty: number;
}

export interface SellpiaProfitRows {
  products: SellpiaProfitRowProduct[];
  skippedAdjustmentCount: number;
}

type ProfitAnswer =
  | ({ status: 'ok' } & SellpiaProfitRows)
  | { status: 'login_required' }
  | { status: 'http_error'; httpStatus: number }
  | { status: 'unexpected_response'; reason?: string };

/**
 * 셀피아 상품별 이익현황 읽기(KID-361 J3). 운영자 탭은 건드리지 않고 백그라운드 탭 하나를 새로 열어, 판매 창 전체를
 * 한 번 읽고(구매기간 = 판매 창) 달마다 구매기간만 바꿔 한 번씩 더 읽는다 — 옛 수집기와 같은 요청들이다. 달 하나를
 * 읽을 때마다 `onProgress`로 알리고, 다음 달을 읽기 전에 `signal` 중단을 확인한다(중단이면 AbortError, 탭은 닫는다).
 * 대조·조립은 수집기가 한다. 로그인 화면이면 탭을 남긴다.
 */
export function createSellpiaProfit(tabs: TabPages) {
  return {
    productProfit(
      input: { start: string; end: string; periods: ReadonlyArray<{ yearMonth: string; from: string; to: string }>; signal?: AbortSignal },
      onProgress?: (done: number, total: number) => Promise<void>,
    ): Promise<{ baseline: SellpiaProfitRows; periods: Array<{ yearMonth: string; rows: SellpiaProfitRows }> }> {
      return withFreshTab(tabs, SELLPIA_PROFIT_URL, async (page) => {
        const baseline = await readRows(page, { start: input.start, end: input.end, purchaseStart: input.start, purchaseEnd: input.end });
        const periods: Array<{ yearMonth: string; rows: SellpiaProfitRows }> = [];
        for (const period of input.periods) {
          input.signal?.throwIfAborted();
          periods.push({
            yearMonth: period.yearMonth,
            rows: await readRows(page, { start: input.start, end: input.end, purchaseStart: period.from, purchaseEnd: period.to }),
          });
          await onProgress?.(periods.length, input.periods.length);
        }
        return { baseline, periods };
      });
    },
  };
}

async function readRows(page: TabPage, args: { start: string; end: string; purchaseStart: string; purchaseEnd: string }): Promise<SellpiaProfitRows> {
  const answer = await callPage<ProfitAnswer>(page, 'sellpia.profitRows', args, {
    timeoutMs: QUERY_TIMEOUT_MS,
    guard: SELLPIA_PAGE_GUARD,
    main: [SELLPIA_PROFIT_FILE],
    displayName: '셀피아',
  });
  switch (answer?.status) {
    case 'ok':
      return { products: answer.products, skippedAdjustmentCount: answer.skippedAdjustmentCount };
    case 'login_required':
      throw new RuntimeError(SITE_LOGIN_REQUIRED, SELLPIA_PAGE_GUARD.loginMessage, { url: SELLPIA_PROFIT_URL });
    case 'http_error':
      throw failed(`셀피아 상품별 이익현황 조회가 실패했습니다(HTTP ${answer.httpStatus}).`, { status: answer.httpStatus, reason: 'http' });
    case 'unexpected_response':
      throw failed('셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다.', { status: null, reason: 'not_json', detail: answer.reason ?? null });
    default:
      throw failed('셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다.', { status: null, reason: 'not_json' });
  }
}

function failed(message: string, details: Record<string, unknown>): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { url: SELLPIA_PROFIT_URL, bodyHead: null, ...details });
}
