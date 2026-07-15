import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';

export type WingCatalogSortKey = 'sales' | 'revenue' | 'views' | 'conversion' | 'reviews';

export interface WingCatalogProduct {
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

export interface WingCatalogSearchResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  opened?: boolean;
  tabId?: number;
  keyword?: string;
  rows?: WingCatalogProduct[];
  total?: number;
  collectedCount?: number;
  upstreamTotal?: number | null;
  pageCount?: number;
  maxPages?: number;
  stopReason?: string;
  warnings?: string[];
  endpoint?: string;
  dateWindow?: 'last28d';
  startedAt?: number;
  endedAt?: number;
}

export interface WingCatalogSummary {
  totalProducts: number;
  totalSalesLast28d: number;
  totalRevenueLast28d: number;
  totalViewsLast28d: number;
  averageConversionRate28d: number | null;
}

interface KidItemExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: {
    wingCatalogSearch?: boolean;
    browserCollectionSessions?: boolean;
  };
}

export const WING_CATALOG_EXTENSION_MIN_VERSION = '1.2.33';
export const WING_CATALOG_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.';
export const WING_CATALOG_CHROME_REQUIRED =
  '쿠팡 크롤링은 Chrome 확장프로그램으로 실행됩니다. Codex 인앱 브라우저에서는 실행할 수 없어서 Chrome에서 이 페이지를 열어주세요.';
export const WING_CATALOG_EXTENSION_RELOAD_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. chrome://extensions 에서 KIDITEM 확장프로그램을 새로고침한 뒤 다시 실행하세요.';
export const WING_CATALOG_SEARCH_TIMEOUT_MS = 90_000;

export async function searchWingCatalogProducts(input: {
  keyword: string;
  maxPages: number;
}): Promise<WingCatalogSearchResponse> {
  const keyword = input.keyword.trim();
  if (!keyword) throw new Error('검색 키워드를 입력하세요.');
  if (!isChromeExtensionRuntimeAvailable()) throw new Error(WING_CATALOG_CHROME_REQUIRED);

  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(WING_CATALOG_EXTENSION_REQUIRED);

  const ping = await sendToExtension<KidItemExtensionPingResponse>(extensionId, { action: 'ping' });
  if (
    !ping?.capabilities?.wingCatalogSearch ||
    !ping.capabilities.browserCollectionSessions ||
    !isExtensionVersionAtLeast(ping.version, WING_CATALOG_EXTENSION_MIN_VERSION)
  ) {
    throw new Error(WING_CATALOG_EXTENSION_RELOAD_REQUIRED);
  }

  const response = await sendToExtension<WingCatalogSearchResponse>(extensionId, {
    action: 'searchWingCatalogProducts',
    keyword,
    maxPages: input.maxPages,
  }, WING_CATALOG_SEARCH_TIMEOUT_MS);

  if (!response?.success) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '쿠팡 Wing 로그인 필요 — 열린 Wing 상품등록 탭에서 로그인 후 다시 실행하세요.'
          : 'Wing 카탈로그 검색 실패'),
    );
  }

  return {
    ...response,
    rows: Array.isArray(response.rows) ? response.rows : [],
  };
}

function isExtensionVersionAtLeast(
  current: string | undefined,
  minimum: string,
): boolean {
  if (!current) return false;
  const currentParts = current
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < size; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}

export function buildWingCatalogSummary(rows: WingCatalogProduct[]): WingCatalogSummary {
  let totalSalesLast28d = 0;
  let totalRevenueLast28d = 0;
  let totalViewsLast28d = 0;
  let conversionSum = 0;
  let conversionCount = 0;

  for (const row of rows) {
    totalSalesLast28d += row.salesLast28d ?? 0;
    totalRevenueLast28d += row.estimatedRevenue28d ?? 0;
    totalViewsLast28d += row.pvLast28Day ?? 0;
    if (row.conversionRate28d != null) {
      conversionSum += row.conversionRate28d;
      conversionCount += 1;
    }
  }

  return {
    totalProducts: rows.length,
    totalSalesLast28d,
    totalRevenueLast28d,
    totalViewsLast28d,
    averageConversionRate28d: conversionCount > 0 ? conversionSum / conversionCount : null,
  };
}

export function sortWingCatalogRows(
  rows: WingCatalogProduct[],
  sortKey: WingCatalogSortKey,
): WingCatalogProduct[] {
  const valueOf = (row: WingCatalogProduct): number => {
    if (sortKey === 'sales') return row.salesLast28d ?? -1;
    if (sortKey === 'revenue') return row.estimatedRevenue28d ?? -1;
    if (sortKey === 'views') return row.pvLast28Day ?? -1;
    if (sortKey === 'conversion') return row.conversionRate28d ?? -1;
    return row.ratingCount ?? -1;
  };

  return [...rows].sort((a, b) => valueOf(b) - valueOf(a));
}

export function resolveCoupangCatalogImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const normalized = imagePath.replace(/^\/+/, '');
  return `https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/${normalized}`;
}

export function formatWingCatalogRate(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}
