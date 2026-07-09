import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';

/** 쿠팡 supplier 상품(SKU) 한 행 — 확장이 /qvt/v2/wims/vendorSearch 에서 수집. */
export interface CoupangProduct {
  barcode: string;
  productName: string;
  skuId: string;
  vendorItemId: string;
  state: string;
}

/** KidItem 단품(옵션) 검색 결과. */
export interface KidItemOption {
  id: string;
  optionName: string | null;
  barcode: string | null;
  legacyCode: string | null;
  sku?: string | null;
  masterName?: string | null;
}

async function detectExt(capability: string): Promise<string> {
  const exact = await detectOrderCollectionExtensionId(1200, capability);
  if (exact) return exact;
  const compatible = await detectOrderCollectionExtensionId();
  if (compatible) return compatible;
  throw new Error(
    '주문수집 확장프로그램을 찾지 못했습니다. extensions/order-collector 를 Chrome 에 로드/새로고침하고 supplier.coupang.com 로그인 후 다시 시도해주세요.',
  );
}

/** 확장으로 쿠팡 supplier 전체 상품목록을 수집. */
export async function collectCoupangProductsFromExtension(): Promise<CoupangProduct[]> {
  const extensionId = await detectExt('collectCoupangProducts');
  const res = await sendToExtension<{ success?: boolean; products?: CoupangProduct[]; error?: string }>(
    extensionId,
    { action: 'collectCoupangProducts' },
    190000,
  );
  if (!res) {
    throw new Error('주문수집 확장이 쿠팡 상품목록 액션에 응답하지 않았습니다. Chrome 확장 관리에서 새로고침해주세요.');
  }
  if (!res.success || !res.products) {
    throw new Error(res?.error ?? '쿠팡 상품목록 수집에 실패했습니다.');
  }
  return res.products;
}

/** KidItem 단품(비-번들) 옵션 검색 — 번들 구성품(단품) 매칭용. */
export async function searchSingleOptions(query: string): Promise<KidItemOption[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await apiClient.get<{ items?: KidItemOption[] } | KidItemOption[]>(
    `/api/products/options?isBundle=false&search=${encodeURIComponent(q)}&limit=20`,
  );
  const items = Array.isArray(res) ? res : (res.items ?? []);
  return items;
}

export interface CreateBundleInput {
  /** 쿠팡 묶음 바코드 (B) */
  barcode: string;
  /** 묶음 상품명 (마스터/옵션명으로 사용) */
  name: string;
  /** 매칭할 KidItem 단품 옵션 id (A) */
  componentOptionId: string;
  /** 묶음 1개 = 단품 N개 */
  qty: number;
}

export type ConnectResult =
  | { mode: 'bundled'; bundleOptionId: string }
  | { mode: 'linked'; optionId: string };

/**
 * 쿠팡 묶음 → KidItem 연결. 쿠팡 바코드가 이미 KidItem 상품에 있으면 상황이 갈린다:
 *  - 이미 일반 상품(비-번들)에 있음 → 쿠팡 묶음이 낱개와 **같은 바코드**를 재사용하는 경우.
 *    로켓 발주확정이 그 바코드로 재고를 직접 찾으므로 별도 번들이 필요 없다 → 'linked'.
 *  - 없거나 이미 번들 → master + option(isBundle) 생성/재사용 + BundleComponent(단품 × N) → 'bundled'.
 */
export async function connectCoupangListing(input: CreateBundleInput): Promise<ConnectResult> {
  const existing = await apiClient
    .get<{ id?: string; isBundle?: boolean } | null>(
      `/api/products/options/by-barcode/${encodeURIComponent(input.barcode)}`,
    )
    .catch(() => null);

  if (existing?.id && !existing.isBundle) {
    // 바코드가 이미 일반 상품 = 로켓이 그 바코드로 직접 재고를 찾음. 번들 불필요, 이미 연결.
    return { mode: 'linked', optionId: existing.id };
  }

  let bundleOptionId = existing?.id ?? null; // 이미 같은 바코드의 번들이면 재사용
  if (!bundleOptionId) {
    const master = await apiClient.post<{ id: string }>('/api/products/masters', {
      name: input.name.slice(0, 300),
    });
    const option = await apiClient.post<{ id: string }>('/api/products/options', {
      masterId: master.id,
      optionName: input.name.slice(0, 200),
      barcode: input.barcode,
      isBundle: true,
    });
    bundleOptionId = option.id;
  }

  // 구성품 연결 (번들 ← 단품 × N) — 백엔드가 availableStock 재계산.
  // 이미 같은 구성품이 연결돼 있으면(중복) = 이미 만들어진 번들 → 이미 연결된 것으로 간주(재연결 허용).
  try {
    await apiClient.post('/api/products/bundle-components', {
      bundleOptionId,
      componentOptionId: input.componentOptionId,
      qty: input.qty,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e as { status?: number } | null)?.status;
    if (status !== 409 && !/duplicate|이미|conflict|unique/i.test(msg)) throw e;
  }

  return { mode: 'bundled', bundleOptionId };
}

/** 백엔드에 저장된 쿠팡 상품 카탈로그 한 행 (매칭 상태 포함). */
export interface CoupangListing {
  id: string;
  skuId: string;
  barcode: string | null;
  productName: string;
  packQty: number | null;
  matchStatus: 'unmatched' | 'suggested' | 'fuzzy' | 'linked' | 'bundled' | 'ignored';
  matchedOptionId: string | null;
  bundleOptionId: string | null;
  matchedOption: { id: string; name: string; barcode: string | null; availableStock: number } | null;
}

/** 확장으로 쿠팡 상품 수집 → 백엔드에 저장 + 셀피아 이름매칭. added=발주 바코드에서 보충된 수. */
export async function syncCoupangCatalog(): Promise<{
  total: number;
  matched: number;
  bundleCandidates: number;
  added: number;
}> {
  const products = await collectCoupangProductsFromExtension();
  const payload = products.map((p) => ({
    skuId: p.skuId,
    barcode: p.barcode,
    vendorItemId: p.vendorItemId,
    productName: p.productName,
    state: p.state,
  }));
  return apiClient.post('/api/orders/rocket/coupang-products/sync', { products: payload });
}

/** 발주 바코드 보충 + 저장된 카탈로그 재매칭 (쿠팡 재수집 없음·봇탐지 위험 없음). added=발주에서 보충된 수. */
export async function rematchCoupangCatalog(): Promise<{ total: number; matched: number; added: number }> {
  return apiClient.post('/api/orders/rocket/coupang-products/rematch', {});
}

/** 저장된 쿠팡 카탈로그 목록 (매칭 단품 조인). */
export async function listCoupangCatalog(
  opts: { onlyBundles?: boolean; onlyUnconnected?: boolean } = {},
): Promise<CoupangListing[]> {
  const qs = new URLSearchParams();
  if (opts.onlyBundles) qs.set('onlyBundles', 'true');
  if (opts.onlyUnconnected) qs.set('onlyUnconnected', 'true');
  const q = qs.toString();
  return apiClient.get<CoupangListing[]>(
    `/api/orders/rocket/coupang-products${q ? `?${q}` : ''}`,
  );
}

/** 매칭 단품 수정 / 연결완료 상태 반영. */
export async function patchCoupangListing(
  id: string,
  patch: { matchedOptionId?: string | null; matchStatus?: string; bundleOptionId?: string | null },
): Promise<void> {
  await apiClient.patch(`/api/orders/rocket/coupang-products/${id}`, patch);
}

/** 상품명에서 입수량(N개입 / N개) 파싱. 묶음(2개 이상)만 반환, 아니면 null. */
export function parsePackQty(name: string): number | null {
  const match = name.match(/(\d+)\s*개입/) ?? name.match(/(\d+)\s*개(?!월)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 2 && n <= 999 ? n : null;
}

/** 단품 검색용 기본어 — 묶음 상품명에서 수량/괄호/브랜드 접두 등을 걷어낸 핵심 키워드. */
export function suggestSearchTerm(name: string): string {
  return name
    .replace(/\d+\s*개입?/g, ' ')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/랜덤발송|혼합색상|랜덤|외\s*\d+종/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}
