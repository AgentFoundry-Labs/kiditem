import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { withFreshTab } from '../fresh-tab';
import type { TabPages } from '../tab-page';
import { SELLPIA_ORIGIN, SELLPIA_PAGE_GUARD } from './tracking';

/** 판매현황 화면(옛 plan의 `sourcePath`). 조회 요청(`order_search.ajax.html`)은 이 화면의 상대 주소다. */
export const SELLPIA_SALES_URL = `${SELLPIA_ORIGIN}/sale_summary.html?mode=main_link`;
export const SELLPIA_SALES_FILE = 'content/orders/sellpia-sales.js';
/** 옛 수집기의 주입 제한 시간과 같다. */
const QUERY_TIMEOUT_MS = 60_000;

/** 판매처 하나의 하루(셀피아가 준 금액·수량 그대로). */
export interface SellpiaSalesRow {
  sellerId: string;
  sellerName: string;
  date: string;
  price: number;
  amount: number;
  buyPrice: number;
}

type SalesAnswer =
  | { status: 'ok'; rows: SellpiaSalesRow[]; sellers: number }
  | { status: 'login_required' }
  | { status: 'http_error'; httpStatus: number }
  | { status: 'unexpected_response'; reason?: string };

/**
 * 셀피아 판매현황 읽기(KID-361 J2). 운영자 탭은 건드리지 않고 매번 백그라운드 탭을 새로 열어 판매현황 화면에서 페이지
 * 호출(MAIN world 파일)로 기간 전체를 한 번 읽고 닫는다 — 옛 수집기와 같다. 로그인 화면이면 탭을 남긴다.
 */
export function createSellpiaSales(tabs: TabPages) {
  return {
    sales(input: { startDate: string; endDate: string }): Promise<{ rows: SellpiaSalesRow[]; sellers: number }> {
      return withFreshTab(tabs, SELLPIA_SALES_URL, async (page) => {
        const answer = await callPage<SalesAnswer>(page, 'sellpia.sales', { startDate: input.startDate, endDate: input.endDate }, {
          timeoutMs: QUERY_TIMEOUT_MS,
          guard: SELLPIA_PAGE_GUARD,
          main: [SELLPIA_SALES_FILE],
          displayName: '셀피아',
        });
        switch (answer?.status) {
          case 'ok':
            return { rows: answer.rows, sellers: answer.sellers };
          case 'login_required':
            throw new RuntimeError(SITE_LOGIN_REQUIRED, SELLPIA_PAGE_GUARD.loginMessage, { url: SELLPIA_SALES_URL });
          case 'http_error':
            throw failed(`셀피아 판매현황 조회가 실패했습니다(HTTP ${answer.httpStatus}).`, { status: answer.httpStatus, reason: 'http' });
          case 'unexpected_response':
            throw failed('셀피아 판매현황 응답 형식이 예상과 다릅니다.', { status: null, reason: 'not_json', detail: answer.reason ?? null });
          default:
            throw failed('셀피아 판매현황 응답 형식이 예상과 다릅니다.', { status: null, reason: 'not_json' });
        }
      });
    },
  };
}

function failed(message: string, details: Record<string, unknown>): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { url: SELLPIA_SALES_URL, bodyHead: null, ...details });
}
