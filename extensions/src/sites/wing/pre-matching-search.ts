import type { SourcingWingCatalogObservation } from '@kiditem/shared/sourcing';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED, type SiteCaller } from '../../core/site-caller';
import type { SiteDefinition } from '../site';

const ORIGIN = 'https://wing.coupang.com';
const SEARCH_URL = `${ORIGIN}/tenants/seller-web/pre-matching/search`;
/** 429·5xx면 다시 묻는다(옛 수집기: 4번, 429는 4초·5xx는 1초에서 두 배씩). */
const RETRY_ATTEMPTS = 4;
/** 요청 하나의 상한(옛 수집기와 같은 20초). 넘으면 연결 끊김처럼 다시 묻는다. */
const REQUEST_TIMEOUT_MS = 20_000;

export const WING_SEARCH_PAYLOAD_INVALID = 'WING_SEARCH_PAYLOAD_INVALID' as const;

/**
 * 쿠팡 윙 상품등록 검색(pre-matching search, KID-360). 탭은 `account:<channelAccountId>` 잠금이 잡는 윙 탭이고,
 * 요청은 `XSRF-TOKEN` 쿠키를 `X-XSRF-TOKEN` 헤더로 싣는다. 페이지 사이 2.2초(옛 수집기 값). 모양은 F(KID-354)의
 * `sites/wing`과 같고, 공통 SiteDefinition은 F 머지 뒤 한 파일로 합친다.
 */
export const WING_SEARCH_SITE: SiteDefinition = {
  name: 'wing',
  origin: ORIGIN,
  caller: {
    minIntervalMs: 2_200,
    displayName: '쿠팡 윙',
    xsrf: { cookieUrl: ORIGIN, cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
  },
};

/** 검색 결과 한 페이지. `nextSearchPage`가 null이면 마지막 페이지다. */
export interface WingSearchPage {
  rows: WingSearchRow[];
  nextSearchPage: number | null;
}

/** Wing 검색 상품 행(옛 `normalizeProduct`). 관측으로 바꾸는 것은 `toSourcingWingCatalogObservation`. */
export interface WingSearchRow {
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  itemName: string | null;
  brandName: string | null;
  manufacture: string | null;
  categoryHierarchy: string | null;
  imagePath: string | null;
  salePrice: number | null;
  rating: number | null;
  ratingCount: number | null;
  pvLast28Day: number | null;
  salesLast28d: number | null;
  estimatedRevenue28d: number | null;
  conversionRate28d: number | null;
  deliveryInfo: string | null;
}

export interface WingSearchDeps {
  sleep(ms: number): Promise<void>;
}

export function createWingPreMatchingSearch(caller: SiteCaller, deps: WingSearchDeps) {
  return {
    /** 키워드 한 페이지. 429·5xx·연결 끊김은 네 번까지 다시 묻는다. */
    async searchPage(keyword: string, searchPage: number): Promise<WingSearchPage> {
      const body = JSON.stringify({ keyword, excludedProductIds: [], searchPage, searchOrder: 'DEFAULT', sortType: 'DEFAULT' });
      for (let attempt = 1; ; attempt += 1) {
        let response: unknown;
        try {
          response = await caller.json(SEARCH_URL, {
            requireXsrf: true,
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*' },
            body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (error) {
          // 첫 쪽이 200인데 JSON이 아니면 Wing이 로그인 페이지를 준 것이다(옛 수집기 규칙).
          if (searchPage === 0 && isRuntimeError(error) && error.code === SITE_REQUEST_FAILED
            && error.details?.status === 200 && error.details?.reason === 'non_json') {
            throw new RuntimeError(SITE_LOGIN_REQUIRED, `${WING_SEARCH_SITE.caller.displayName} 로그인이 필요합니다.`, { reason: 'non_json_first_page' }, error);
          }
          const status = isRuntimeError(error) && error.code === SITE_REQUEST_FAILED ? error.details?.status : undefined;
          const retryable = status === null || status === 429 || (typeof status === 'number' && status >= 500);
          if (!retryable || attempt >= RETRY_ATTEMPTS) throw error;
          await deps.sleep((status === 429 ? 4_000 : 1_000) * 2 ** (attempt - 1));
          continue;
        }
        return parseWingSearchPage(response);
      }
    },
  };
}

export type WingPreMatchingSearch = ReturnType<typeof createWingPreMatchingSearch>;

/** 수집기(`sourcing.wing_catalog`)에 넘기는 모양: 검색 + 행 식별 + 관측 변환. */
export function createWingCatalogSearchSite(caller: SiteCaller, deps: WingSearchDeps) {
  const search = createWingPreMatchingSearch(caller, deps);
  return {
    searchPage: search.searchPage,
    identity: (row: WingSearchRow) => `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`,
    toObservation: (row: WingSearchRow, keyword: string, capturedAt: string) =>
      row.productName.trim() ? toSourcingWingCatalogObservation(row, keyword, capturedAt) : null,
  };
}

/** Wing 검색 응답 → 행과 다음 페이지. `result`가 배열이 아니면 모양이 바뀐 것이다. */
export function parseWingSearchPage(body: unknown): WingSearchPage {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.result)) {
    throw new RuntimeError(WING_SEARCH_PAYLOAD_INVALID, 'Wing 검색 응답의 모양이 올바르지 않습니다.');
  }
  const next = record.nextSearchPage;
  return {
    rows: record.result.map(normalizeWingSearchProduct).filter((row): row is WingSearchRow => row !== null),
    nextSearchPage: typeof next === 'number' && Number.isInteger(next) ? next : null,
  };
}

export function normalizeWingSearchProduct(raw: unknown): WingSearchRow | null {
  const product = asRecord(raw);
  if (!product || product.productId == null) return null;
  const productId = String(product.productId);
  if (!productId) return null;
  const salePrice = nullableNumber(product.salePrice);
  const salesLast28d = nullableNumber(product.salesLast28d);
  const pvLast28Day = nullableNumber(product.pvLast28Day);
  const category = Array.isArray(product.displayCategoryInfo) ? asRecord(product.displayCategoryInfo[0])?.categoryHierarchy : null;
  return {
    productId,
    itemId: product.itemId == null ? null : String(product.itemId),
    vendorItemId: product.vendorItemId == null ? null : String(product.vendorItemId),
    productName: String(product.productName || ''),
    itemName: product.itemName ? String(product.itemName) : null,
    brandName: product.brandName ? String(product.brandName) : null,
    manufacture: product.manufacture ? String(product.manufacture) : null,
    categoryHierarchy: typeof category === 'string' && category ? category : null,
    imagePath: product.imagePath ? String(product.imagePath) : null,
    salePrice,
    rating: nullableNumber(product.rating),
    ratingCount: nullableNumber(product.ratingCount),
    pvLast28Day,
    salesLast28d,
    estimatedRevenue28d: salePrice != null && salesLast28d != null ? Math.round(salePrice * salesLast28d) : null,
    conversionRate28d: pvLast28Day != null && pvLast28Day > 0 && salesLast28d != null ? salesLast28d / pvLast28Day : null,
    deliveryInfo: product.deliveryInfo ? String(product.deliveryInfo) : null,
  };
}

/** 검색 행 → 서버 관측(`SourcingWingCatalogObservation`). 글자 길이·수치 범위는 옛 워커 경계와 같다. */
export function toSourcingWingCatalogObservation(row: WingSearchRow, sourceKeyword: string, capturedAt: string): SourcingWingCatalogObservation {
  return {
    productId: row.productId,
    itemId: row.itemId,
    vendorItemId: row.vendorItemId,
    productName: row.productName.slice(0, 500),
    itemName: row.itemName?.slice(0, 500) ?? null,
    brandName: row.brandName?.slice(0, 500) ?? null,
    manufacture: row.manufacture?.slice(0, 500) ?? null,
    categoryHierarchy: row.categoryHierarchy?.slice(0, 1_000) ?? null,
    imagePath: row.imagePath?.slice(0, 2_000) ?? null,
    salePriceKrw: boundedInteger(row.salePrice),
    ratingAverage: boundedNumber(row.rating, 0, 5),
    ratingCount: boundedInteger(row.ratingCount),
    viewsLast28d: boundedInteger(row.pvLast28Day),
    salesLast28d: boundedInteger(row.salesLast28d),
    estimatedRevenue28d: boundedNumber(row.estimatedRevenue28d, 0, 2_147_483_647),
    conversionRate28d: boundedNumber(row.conversionRate28d, 0, 1),
    deliveryInfo: row.deliveryInfo?.slice(0, 1_000) ?? null,
    sourceKeyword,
    capturedAt,
  };
}

function nullableNumber(value: unknown): number | null {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function boundedInteger(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

function boundedNumber(value: number | null, minimum: number, maximum: number): number | null {
  return value !== null && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
