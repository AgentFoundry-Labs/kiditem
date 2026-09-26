import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { withFreshTab } from '../fresh-tab';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

export const SELLPIA_ORIGIN = 'https://kiditem.sellpia.com';
/** 송장 재출력 화면. 조회 요청(`delivery_link.action.html`)은 이 화면의 상대 주소다. */
export const SELLPIA_REPRINT_URL = `${SELLPIA_ORIGIN}/order_delivery_reprint.html`;
export const SELLPIA_SHIPMENT_TRACKING_FILE = 'content/orders/sellpia-shipment-tracking.js';
/** 옛 수집기의 주입 제한 시간과 같다. */
const QUERY_TIMEOUT_MS = 60_000;
const LOGIN_MESSAGE = '셀피아 로그인이 필요합니다. 열려 있는 셀피아 탭에서 로그인한 뒤 다시 조회해 주세요.';

export const SELLPIA_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['sellpia.com']),
  isLogin: (url) => hostWithin(url, ['sellpia.com']) && /login/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

export interface SellpiaTrackingRow {
  ordNo: string;
  itemNo: string;
  invNo: string;
  courier: string;
  provider: string;
  receiver?: string;
  post?: string;
  addr?: string;
}

type TrackingAnswer =
  | { status: 'ok'; rows: SellpiaTrackingRow[]; total: number }
  | { status: 'login_required' }
  | { status: 'http_error'; httpStatus: number }
  | { status: 'unexpected_response' };

/**
 * 셀피아 송장 재출력 화면 읽기(KID-359 H3). 운영자 탭은 건드리지 않고 매번 백그라운드 탭을 새로 열어 송장 재출력
 * 화면에서 페이지 호출(MAIN world 파일)로 조회하고 닫는다 — 옛 수집기와 같다. 로그인 화면이면 탭을 남긴다.
 * 탭 잠금은 서버 lockKey `resource:sellpia:login`이 하고, 이 사이트는 브라우저 자원에 origin을 두지 않는다(탭을 스스로 연다).
 */
export function createSellpiaTracking(tabs: TabPages) {
  return {
    /** 기간(송장번호채번일자) 안 전 몰 송장. 행은 주문번호·송장번호가 있는 것만, `total`은 셀피아가 준 목록 수. */
    shipmentTracking(input: { startDate: string; endDate: string }): Promise<{ rows: SellpiaTrackingRow[]; total: number }> {
      return withFreshTab(tabs, SELLPIA_REPRINT_URL, async (page) => {
        const answer = await callPage<TrackingAnswer>(page, 'sellpia.shipmentTracking', { startDate: input.startDate, endDate: input.endDate }, {
          timeoutMs: QUERY_TIMEOUT_MS,
          guard: SELLPIA_PAGE_GUARD,
          main: [SELLPIA_SHIPMENT_TRACKING_FILE],
          displayName: '셀피아',
        });
        switch (answer?.status) {
          case 'ok':
            return { rows: answer.rows, total: answer.total };
          case 'login_required':
            throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: SELLPIA_REPRINT_URL });
          case 'http_error':
            throw new RuntimeError(SITE_REQUEST_FAILED, `셀피아 송장 조회가 실패했습니다(HTTP ${answer.httpStatus}).`, {
              status: answer.httpStatus,
              url: SELLPIA_REPRINT_URL,
              reason: 'http',
              bodyHead: null,
            });
          default:
            throw new RuntimeError(SITE_REQUEST_FAILED, '셀피아 송장 응답 형식이 예상과 다릅니다.', {
              status: null,
              url: SELLPIA_REPRINT_URL,
              reason: 'not_json',
              bodyHead: null,
            });
        }
      });
    },
  };
}
