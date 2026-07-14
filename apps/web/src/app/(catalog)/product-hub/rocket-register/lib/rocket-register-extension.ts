/**
 * 쿠팡 로켓 등록 — 확장 브릿지 헬퍼.
 *
 * 두 확장을 조합한다(각자 자기 오리진 세션으로 same-origin fetch):
 *  - coupang-ads-scraper (wing.coupang.com): `collectWingOptionIds` — WING 상품 목록 +
 *    각 상품 옵션ID(vendorItemId) 매칭.
 *  - order-collector (supplier.coupang.com): `testRocketSourcing` — 옵션ID를
 *    `/sr/sourcing/api/3p-product/{id}` 로 조회해 "등록된 상품 불러오기" 가능여부 테스트.
 *
 * ⚠️ 로켓 등록 검색은 옵션ID(vendorItemId)만 받는다. 등록상품ID(vendorInventoryId)는 500 이므로,
 *    WING 목록에서 옵션ID까지 뽑아야 검색이 된다.
 */
import {
  detectExtensionId,
  detectOrderCollectionExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';

export type WingSalesMethod = 'rocket' | 'seller' | 'unknown';
export type WingSaleStatus = 'selling' | 'stopped';

export interface WingOption {
  vendorItemId: string | null;
  itemName: string;
  sku: string;
  barcode: string;
  salePrice: number | null;
}

export interface WingProduct {
  vendorInventoryId: string;
  name: string;
  method: WingSalesMethod;
  status: WingSaleStatus;
  options: WingOption[];
}

export interface CollectWingOptionsResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  products?: WingProduct[];
  productCount?: number;
  optionCount?: number;
  pageCount?: number;
}

export interface RocketSourcingResult {
  vendorItemId: string;
  ok: boolean;
  status: number;
  productName?: string | null;
  productId?: string | null;
  reason?: string;
  loginRequired?: boolean;
}

export interface RegisteredRocketProduct {
  productName: string;
  barcode: string;
  skuId: string;
  vendorItemId: string;
  state: string; // 'INSPECTION_COMPLETE'(검수완료) | 'REJECTION'(반려) 등
}

export interface CollectRegisteredRocketResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  products?: RegisteredRocketProduct[];
}

export interface TestRocketSourcingResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  results?: RocketSourcingResult[];
  okCount?: number;
  failCount?: number;
}

interface CoupangExtensionPingResponse {
  success?: boolean;
  capabilities?: {
    collectWingOptionIds?: boolean;
  };
}

export const ROCKET_REGISTER_CHROME_REQUIRED =
  '쿠팡 크롤링은 Chrome 확장프로그램으로 실행됩니다. Chrome에서 이 페이지를 열어주세요.';
export const WING_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 셀러 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.';
export const WING_EXTENSION_RELOAD_REQUIRED =
  'KIDITEM 쿠팡 셀러 확장프로그램이 예전 버전입니다. chrome://extensions 에서 새로고침한 뒤 다시 실행하세요.';
export const SUPPLIER_EXTENSION_REQUIRED =
  'KIDITEM 주문수집 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.';

const COLLECT_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 240_000;

/** wing.coupang.com 상품 목록 + 옵션ID(vendorItemId) 수집. */
export async function collectWingOptions(input: {
  maxPages: number;
}): Promise<CollectWingOptionsResponse> {
  if (!isChromeExtensionRuntimeAvailable()) throw new Error(ROCKET_REGISTER_CHROME_REQUIRED);

  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(WING_EXTENSION_REQUIRED);

  const ping = await sendToExtension<CoupangExtensionPingResponse>(extensionId, { action: 'ping' });
  if (!ping?.capabilities?.collectWingOptionIds) {
    throw new Error(WING_EXTENSION_RELOAD_REQUIRED);
  }

  const response = await sendToExtension<CollectWingOptionsResponse>(
    extensionId,
    { action: 'collectWingOptionIds', maxPages: input.maxPages },
    COLLECT_TIMEOUT_MS,
  );

  if (!response?.success) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '쿠팡 Wing 로그인 필요 — 열린 Wing 창에서 로그인 후 다시 실행하세요.'
          : 'Wing 상품/옵션ID 수집 실패'),
    );
  }

  return {
    ...response,
    products: Array.isArray(response.products) ? response.products : [],
  };
}

/** supplier.coupang.com 에서 옵션ID들의 로켓 "불러오기" 가능여부 테스트. */
export async function testRocketSourcing(
  vendorItemIds: string[],
): Promise<TestRocketSourcingResponse> {
  const ids = vendorItemIds.map((v) => String(v || '').trim()).filter(Boolean);
  if (ids.length === 0) return { success: true, results: [], okCount: 0, failCount: 0 };
  if (!isChromeExtensionRuntimeAvailable()) throw new Error(ROCKET_REGISTER_CHROME_REQUIRED);

  const extensionId = await detectOrderCollectionExtensionId(1200, 'testRocketSourcing');
  if (!extensionId) throw new Error(SUPPLIER_EXTENSION_REQUIRED);

  const response = await sendToExtension<TestRocketSourcingResponse>(
    extensionId,
    { action: 'testRocketSourcing', vendorItemIds: ids },
    TEST_TIMEOUT_MS,
  );

  if (!response?.success) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '쿠팡 supplier 로그인 필요 — supplier.coupang.com 로그인 후 다시 실행하세요.'
          : '로켓 불러오기 테스트 실패'),
    );
  }

  return {
    ...response,
    results: Array.isArray(response.results) ? response.results : [],
  };
}

/**
 * supplier.coupang.com 공급사 등록상품 목록(로켓 등록된 상품) 수집.
 * order-collector 의 기존 `collectCoupangProducts`(vendorSearch) 재사용.
 * WING 상품을 이 목록과 이름매칭해 로켓 등록 여부를 분류한다.
 */
export async function collectRegisteredRocketProducts(): Promise<CollectRegisteredRocketResponse> {
  if (!isChromeExtensionRuntimeAvailable()) throw new Error(ROCKET_REGISTER_CHROME_REQUIRED);

  const extensionId = await detectOrderCollectionExtensionId(1200, 'collectCoupangProducts');
  if (!extensionId) throw new Error(SUPPLIER_EXTENSION_REQUIRED);

  const response = await sendToExtension<CollectRegisteredRocketResponse>(
    extensionId,
    { action: 'collectCoupangProducts' },
    COLLECT_TIMEOUT_MS,
  );

  if (!response?.success) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '쿠팡 supplier 로그인 필요 — supplier.coupang.com 로그인 후 다시 실행하세요.'
          : '로켓 등록목록 수집 실패'),
    );
  }

  return {
    ...response,
    products: Array.isArray(response.products) ? response.products : [],
  };
}
