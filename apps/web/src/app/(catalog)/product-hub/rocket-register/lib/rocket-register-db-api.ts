/**
 * 쿠팡 로켓 등록 — DB 연동 API.
 * WING 옵션ID를 백엔드에서 셀피아 재고 이름과 매칭해 CoupangProductListing 에 저장(검토구조).
 * 매칭·저장은 서버(coupang-catalog)에서 하고, 프론트는 결과를 읽고 승인/무시만 한다.
 */
import { apiClient } from '@/lib/api-client';

export type CoupangListingSource = 'wing' | 'purchase_order' | 'vendor_search';
export type MatchStatus = 'unmatched' | 'suggested' | 'fuzzy' | 'linked' | 'bundled' | 'ignored';

/** 매칭된 우리 재고 옵션. */
export interface MatchedOption {
  id: string;
  name: string;
  barcode: string | null;
  availableStock: number;
  costPrice: number | null; // 공급가(원가)
}

/** 저장된 쿠팡 상품 카탈로그 한 행(매칭 상태 포함). */
export interface CoupangListing {
  id: string;
  skuId: string;
  source: CoupangListingSource;
  vendorItemId: string | null;
  barcode: string | null;
  productName: string;
  packQty: number | null;
  salePrice: number | null; // WING(쿠팡) 판매가
  matchStatus: MatchStatus;
  matchedOptionId: string | null;
  bundleOptionId: string | null;
  matchedOption: MatchedOption | null;
}

export interface WingSyncResult {
  total: number;
  matched: number;
  suggested: number;
  fuzzy: number;
  unmatched: number;
}

/** WING 수집 상품(옵션ID+상품명+쿠팡가)을 백엔드에 저장 + 셀피아 재고 이름매칭. */
export async function syncWingToDb(
  products: { vendorItemId: string; productName: string; salePrice?: number | null }[],
): Promise<WingSyncResult> {
  return apiClient.post<WingSyncResult>('/api/orders/rocket/coupang-products/wing-sync', {
    products,
  });
}

/** 저장된 WING 카탈로그 목록(매칭 재고 조인). */
export async function listWingCatalog(): Promise<CoupangListing[]> {
  return apiClient.get<CoupangListing[]>('/api/orders/rocket/coupang-products?source=wing');
}

/** 로켓 등록 현황 한 행(마스터 단위, 실제 상품). */
export interface RocketStatusRow {
  masterId: string;
  masterName: string;
  masterCode: string;
  thumbnailUrl: string | null;
  registered: boolean; // 쿠팡 로켓 등록 여부
  optionCount: number;
  costPrice: number | null; // 공급가
  wingPrice: number | null; // 쿠팡 WING 판매가(3P, 기본단위)
  rocketPrice: number | null; // 쿠팡 로켓 단가(발주 매입가, 1P)
  margin: number | null; // WING가 − 공급가
}

export interface RocketStatusResult {
  items: RocketStatusRow[];
  total: number; // 실제 상품 수
  registered: number; // 로켓 등록
  unregistered: number; // 로켓 미등록
}

/** 쿠팡 로켓 등록/미등록 현황 (로켓 카탈로그 기준, 실제 상품 유니버스). */
export async function listRocketStatus(): Promise<RocketStatusResult> {
  return apiClient.get<RocketStatusResult>('/api/orders/rocket/coupang-products/rocket-status');
}

/** 검토 결과 반영: 승인(linked) · 무시(ignored) · 매칭 재고 변경. */
export async function patchWingListing(
  id: string,
  patch: { matchStatus?: MatchStatus; matchedOptionId?: string | null },
): Promise<void> {
  await apiClient.patch(`/api/orders/rocket/coupang-products/${id}`, patch);
}

/** 재고 옵션 검색 결과(키워드 수동매칭용). */
export interface InventoryOption {
  id: string;
  optionName: string;
  barcode: string | null;
  isBundle: boolean;
}

/** 재고(ProductOption)를 키워드로 검색 — 미매칭 상품을 사람이 찾아 연결할 때. */
export async function searchInventoryOptions(keyword: string): Promise<InventoryOption[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const res = await apiClient.get<{ items?: InventoryOption[] } | InventoryOption[]>(
    `/api/products/options?limit=12&search=${encodeURIComponent(kw)}`,
  );
  const items = Array.isArray(res) ? res : (res.items ?? []);
  return items.map((o) => ({
    id: o.id,
    optionName: o.optionName ?? '',
    barcode: o.barcode ?? null,
    isBundle: Boolean(o.isBundle),
  }));
}

/** 상품명에서 검색 기본 키워드 추출(가격접두·괄호 제거 후 앞 글자). 사용자가 수정 가능. */
export function defaultSearchKeyword(productName: string): string {
  const core = productName
    .replace(/^\s*\d{2,6}\s*/, '') // 가격 접두
    .replace(/\([^)]*\)/g, ' ') // 괄호 내용
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
    .trim();
  return core.slice(0, 4);
}
