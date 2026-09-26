import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { withFreshTab } from '../fresh-tab';
import type { TabPages } from '../tab-page';
import { SELLPIA_ORIGIN, SELLPIA_PAGE_GUARD } from './tracking';

/** 상품 목록 화면. 전체 목록 요청(`product_search.ajax.html`)은 이 화면의 같은 출처 주소다. */
export const SELLPIA_INVENTORY_URL = `${SELLPIA_ORIGIN}/product_list_total.html`;
export const SELLPIA_INVENTORY_FILE = 'content/orders/sellpia-inventory.js';
/** 옛 수집기와 같은 상한: 요청 하나 45초, 줄 20,000, 응답 10MiB. 페이지 호출 전체는 옛 주입 제한(45초 + 1초)과 같다. */
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ROWS = 20_000;
const MAX_BYTES = 10 * 1024 * 1024;
const CALL_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 1_000;

/** 셀피아 상품 한 줄(옛 JSON 스냅샷 `rows[]`와 같은 모양). */
export interface SellpiaInventoryRow {
  productCode: string;
  optionCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
}

type InventoryAnswer =
  | { status: 'ok'; rows: SellpiaInventoryRow[] }
  | { status: 'login_required' }
  | { status: 'http_error'; httpStatus: number }
  | { status: 'timeout' }
  | { status: 'network_error' }
  | { status: 'unexpected_response'; reason?: string };

/**
 * 셀피아 재고 목록 읽기(KID-361 J1). 운영자 탭은 건드리지 않고 매번 백그라운드 탭을 새로 열어 상품 목록 화면에서
 * 페이지 호출(MAIN world 파일)로 전체 목록을 읽고 닫는다 — 옛 수집기의 관리 탭 규칙과 같다. 로그인 화면이면 탭을 남긴다.
 */
export function createSellpiaInventory(tabs: TabPages) {
  return {
    inventory(): Promise<{ rows: SellpiaInventoryRow[] }> {
      return withFreshTab(tabs, SELLPIA_INVENTORY_URL, async (page) => {
        const answer = await callPage<InventoryAnswer>(page, 'sellpia.inventory', { timeoutMs: REQUEST_TIMEOUT_MS, maxRows: MAX_ROWS, maxBytes: MAX_BYTES }, {
          timeoutMs: CALL_TIMEOUT_MS,
          guard: SELLPIA_PAGE_GUARD,
          main: [SELLPIA_INVENTORY_FILE],
          displayName: '셀피아',
        });
        switch (answer?.status) {
          case 'ok':
            return { rows: answer.rows };
          case 'login_required':
            throw new RuntimeError(SITE_LOGIN_REQUIRED, SELLPIA_PAGE_GUARD.loginMessage, { url: SELLPIA_INVENTORY_URL });
          case 'http_error':
            throw failed(`셀피아 재고 조회가 실패했습니다(HTTP ${answer.httpStatus}).`, { status: answer.httpStatus, reason: 'http' });
          case 'timeout':
            throw failed('셀피아 재고 조회가 제때 끝나지 않았습니다.', { status: null, reason: 'timeout' });
          case 'network_error':
            throw failed('셀피아 재고 조회에 연결하지 못했습니다.', { status: null, reason: 'network' });
          case 'unexpected_response':
            throw failed('셀피아 재고 응답 형식이 예상과 다릅니다.', { status: null, reason: 'not_json', detail: answer.reason ?? null });
          default:
            throw failed('셀피아 재고 응답 형식이 예상과 다릅니다.', { status: null, reason: 'not_json' });
        }
      });
    },
  };
}

function failed(message: string, details: Record<string, unknown>): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { url: SELLPIA_INVENTORY_URL, bodyHead: null, ...details });
}
