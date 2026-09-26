import type { AdTrafficAccountSummary } from '@kiditem/shared/advertising-operations';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED, createSiteCaller, type SiteCaller, type SiteCallerOptions } from '../../core/site-caller';
import { registerSite } from '../registry';

/**
 * Wing 매출분석(business-insight) 읽기 API — 읽기 전용 조회다. 옛 content script `wing-read-api.js`의 일별 v2 수집을
 * 서비스워커로 옮겼다(KID-362): 쿠키로 부르고 `XSRF-TOKEN` 쿠키를 `X-XSRF-TOKEN` 헤더로 싣는다(없으면 보내지 않는다),
 * 리다이렉트를 따라가지 않고 30초에 끊는다. 쪽은 100개씩이다.
 */
export const WING_ORIGIN = 'https://wing.coupang.com';
export const WING_TRAFFIC_DETAIL_URL = `${WING_ORIGIN}/tenants/rfm-ss/api/business-insight/vi-detail-search`;
export const WING_TRAFFIC_SUMMARY_URL = `${WING_ORIGIN}/tenants/rfm-ss/api/business-insight/vendor-summary`;
export const WING_TRAFFIC_METADATA_URL = `${WING_ORIGIN}/tenants/rfm-ss/api/metadata/business-insights`;
export const WING_TRAFFIC_PAGE_SIZE = 100;
const REGISTRATION_TYPES = ['NORMAL', 'RFM'] as const;
export const WING_TRAFFIC_CALLER: SiteCallerOptions = {
  minIntervalMs: 300,
  timeoutMs: 30_000,
  displayName: '쿠팡 윙',
  xsrf: { cookieUrl: WING_ORIGIN, cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
};

/** 쿠팡이 공개한 최신 날(KST)과 볼 수 있는 기간. */
export interface WingTrafficFreshness {
  salesLatest: string;
  trafficLatest: string;
  viewableStart: string;
  viewableEnd: string;
}

/** 옵션 하나의 그날 값. */
export interface WingTrafficOptionRow {
  vendorItemId: string;
  productId: string;
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
}

export interface WingTrafficDetailPage {
  rows: WingTrafficOptionRow[];
  totalResults: number;
  totalPages: number;
  pageSize: number;
  pageNumber: number;
}

const JSON_HEADERS = { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' };

export async function readWingTrafficFreshness(caller: SiteCaller, now: Date): Promise<WingTrafficFreshness> {
  const body = await caller.json<unknown>(`${WING_TRAFFIC_METADATA_URL}?platform=WING&date=${encodeURIComponent(now.toISOString())}`, {
    requireXsrf: true,
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  const metrics = record(record(record(body)?.dataFreshness)?.metrics);
  const viewable = record(record(record(body)?.viewablePeriods)?.sa);
  const freshness = {
    salesLatest: koreaDate(record(metrics?.SALES_DAILY)?.latestDataDate),
    trafficLatest: koreaDate(record(metrics?.TRAFFIC_DAILY)?.latestDataDate),
    viewableStart: koreaDate(viewable?.startDate),
    viewableEnd: koreaDate(viewable?.endDate),
  };
  if (!freshness.salesLatest || !freshness.trafficLatest || !freshness.viewableStart || !freshness.viewableEnd) {
    throw failed('wing_traffic_metadata_invalid', 'Wing 매출분석 공개 기간 응답이 올바르지 않습니다.');
  }
  return freshness as WingTrafficFreshness;
}

/** 하루(`businessDate`)의 `pageNumber`쪽(0부터). 다른 판매자 행이 섞이면 멈춘다. */
export async function readWingTrafficDetailPage(
  caller: SiteCaller,
  input: { businessDate: string; pageNumber: number; vendorId: string },
): Promise<WingTrafficDetailPage> {
  const body = record(await caller.json<unknown>(WING_TRAFFIC_DETAIL_URL, {
    method: 'POST',
    requireXsrf: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      startDate: input.businessDate,
      endDate: input.businessDate,
      registrationTypes: [...REGISTRATION_TYPES],
      pageNumber: input.pageNumber,
      pageSize: WING_TRAFFIC_PAGE_SIZE,
      sortBy: 'GMV',
      sortOrder: 'DESC',
      includeSoldVICount: true,
    }),
  }));
  const pagination = record(body?.paginationDetails);
  const items = body?.vendorItems;
  const totalResults = integer(pagination?.totalResults);
  const totalPages = integer(pagination?.totalPages);
  const pageSize = integer(pagination?.pageSize);
  const pageNumber = integer(pagination?.pageNumber);
  if (!Array.isArray(items) || totalResults === null || totalPages === null || pageSize === null || pageNumber === null) {
    throw failed('wing_traffic_response_invalid', 'Wing 트래픽 쪽 응답 형식이 올바르지 않습니다.', { businessDate: input.businessDate, pageNumber: input.pageNumber });
  }
  return { rows: items.map((item) => normalizeRow(item, input.vendorId)), totalResults, totalPages, pageSize, pageNumber };
}

/** 기간(`startDate`~`endDate`)의 계정 요약. */
export async function readWingTrafficSummary(
  caller: SiteCaller,
  input: { startDate: string; endDate: string },
): Promise<AdTrafficAccountSummary> {
  const body = record(await caller.json<unknown>(WING_TRAFFIC_SUMMARY_URL, {
    method: 'POST',
    requireXsrf: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({ startDate: input.startDate, endDate: input.endDate, registrationTypes: [...REGISTRATION_TYPES], searchIds: [] }),
  }));
  const metrics = record(body?.summaryMetrics);
  const summary = {
    visitors: integer(metrics?.totalUniqueVisitor),
    views: integer(metrics?.totalPageViews),
    cartAdds: integer(metrics?.totalAddToCart),
    orders: integer(metrics?.totalOrders),
    salesQty: integer(metrics?.totalUnitsSold),
    revenue: integer(metrics?.totalGmv),
  };
  if (Object.values(summary).some((value) => value === null)) {
    throw failed('wing_traffic_summary_invalid', 'Wing 트래픽 요약 응답이 올바르지 않습니다.', input);
  }
  const ratio = metrics?.pvToOrder;
  const providerConversionRate = ratio === null || ratio === undefined ? null : number(ratio);
  if (ratio !== null && ratio !== undefined && providerConversionRate === null) {
    throw failed('wing_traffic_summary_invalid', 'Wing 트래픽 요약 응답이 올바르지 않습니다.', input);
  }
  return { ...(summary as Omit<AdTrafficAccountSummary, 'providerConversionRate'>), providerConversionRate: providerConversionRate === null ? null : providerConversionRate * 100 };
}

function normalizeRow(value: unknown, vendorId: string): WingTrafficOptionRow {
  const row = record(value);
  const details = record(row?.vendorItemDetails);
  const metrics = record(row?.businessInsightsMetricsResponse);
  const vendorItemId = positiveId(details?.vendorItemId);
  const productId = positiveId(details?.inventoryId);
  if (!details || !metrics || !vendorItemId || !productId) throw rowInvalid('vendorItemDetails');
  const rowVendorId = details.vendorId === null || details.vendorId === undefined ? '' : String(details.vendorId).trim();
  if (rowVendorId !== vendorId) {
    throw failed('advertiser_identity_mismatch', 'Wing 계정 식별자가 수집 계획과 다릅니다. 다른 Wing 계정으로 로그인했는지 확인해 주세요.', { vendorItemId });
  }
  const values = {
    visitors: integer(metrics.totalUniqueVisitor),
    views: integer(metrics.totalPageViews),
    cartAdds: integer(metrics.totalAddToCart),
    orders: integer(metrics.totalOrders),
    salesQty: integer(metrics.totalUnitsSold),
    revenue: integer(metrics.totalGmv),
  };
  for (const [field, metric] of Object.entries(values)) if (metric === null) throw rowInvalid(field);
  return { vendorItemId, productId, ...(values as Omit<WingTrafficOptionRow, 'vendorItemId' | 'productId'>) };
}

/** Wing 날짜 값(`YYYY-MM-DD` 또는 UTC 시각)을 KST 달력 날짜로. */
function koreaDate(value: unknown): string | null {
  const timestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T00:00:00Z`)
    : typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function positiveId(value: unknown): string | null {
  const text = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '';
  return /^[1-9]\d*$/.test(text) ? text : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function rowInvalid(field: string): RuntimeError {
  return failed('wing_traffic_row_invalid', 'Wing 트래픽 행에 필요한 값이 없습니다.', { field });
}

function failed(reason: string, message: string, details: Record<string, unknown> = {}): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { reason, ...details });
}

/** 트래픽 수집기(`collectors/advertising.wing_traffic`)에 넘길 핸들. */
export function createWingTrafficSite(caller: SiteCaller) {
  return {
    readFreshness: (now: Date) => readWingTrafficFreshness(caller, now),
    readDetailPage: (input: { businessDate: string; pageNumber: number; vendorId: string }) => readWingTrafficDetailPage(caller, input),
    readSummary: (input: { startDate: string; endDate: string }) => readWingTrafficSummary(caller, input),
  };
}

// 서비스워커에서 Wing 쿠키로 부른다(KID-362). `account:` 잠금은 윙 탭을 열어 로그인을 유지한다.
registerSite({
  name: 'wing-traffic',
  origin: WING_ORIGIN,
  create: (deps) => createWingTrafficSite(createSiteCaller(WING_TRAFFIC_CALLER, deps)),
});
