import {
  AD_REPORT_ADS_CHUNK_KIND,
  AD_REPORT_CAMPAIGNS_CHUNK_KIND,
  AD_REPORT_KEYWORD_ROWS_CHUNK_KIND,
  AD_REPORT_KIND,
  AD_REPORT_PERIOD_CHUNK_KIND,
  AD_REPORT_PRODUCT_ROWS_CHUNK_KIND,
  AD_REPORT_ROWS_PER_CHUNK,
  AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND,
  AdReportPlanSchema,
  type AdReportAd,
  type AdReportCampaign,
  type AdReportKeywordRow,
  type AdReportPeriod,
  type AdReportPlan,
  type AdReportProductRow,
  type AdReportSettlementRow,
  type AdSettlementDomain,
} from '@kiditem/shared/advertising-operations';
import type { OperationChunkKind } from '@kiditem/shared/operation';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

export type AdReportGranularity = 'vendorItem' | 'keyword';

/**
 * 이 수집기가 광고센터에서 쓰는 것(`sites/ad-center`가 구현, 입구가 넘긴다). 날짜는 KST `YYYY-MM-DD`이고 몰의 형식
 * (YYYYMMDD 정수, GraphQL 오류, NDJSON·TSV)은 사이트가 푼다. 행·캠페인·광고는 원문 레코드 그대로 넘기고 스키마 모양으로
 * 옮기는 것은 수집기가 한다(어느 열을 남기고 전환을 어떻게 합칠지는 수집 규칙이다).
 */
export interface AdReportSite {
  /** 광고센터 세션의 업체코드. 읽지 못하면 던진다. */
  readVendorId(): Promise<string>;
  /** 보고서용 캠페인(`getCampaignList`, 삭제 캠페인 포함). */
  listReportCampaigns(range: { startDate: string; endDate: string }): Promise<Array<{ id: string; name: string }>>;
  /** 보고서 생성(허용된 유일한 쓰기). */
  requestReport(input: { startDate: string; endDate: string; campaignIds: string[]; granularity: AdReportGranularity }): Promise<{ id: string; isLargeReport: boolean }>;
  listReports(): Promise<Array<{ id: string; status: string; isLargeReport: boolean }>>;
  /** 보고서 행(NDJSON은 줄마다, 큰 보고서 TSV는 머리 행을 열 이름으로). */
  downloadReport(input: { id: string; isLargeReport: boolean }): Promise<Record<string, unknown>[]>;
  /** `tetris-api/campaigns` 한 쪽(0부터, 500개). */
  listCampaigns(page: number): Promise<unknown[]>;
  /** `tetris-api/{groupId}/ads` 한 쪽(0부터, 500개)과 그룹 전체 광고 수. */
  listAds(input: { adGroupId: string; page: number }): Promise<{ ads: unknown[]; totalCount: number }>;
  /** 정산 캠페인×일 `items`. `campaignIds`가 null이면 계정 전체(`getDailySettlement`). */
  readSettlement(input: { startDate: string; endDate: string; domain: AdSettlementDomain; campaignIds: number[] | null }): Promise<unknown[]>;
  pause(ms: number): Promise<void>;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
/** 옛 광고 수집의 업체코드 대조 코드 그대로(`ads-report.js`·`profitability-source-owner.js`). */
export const ADVERTISER_IDENTITY_MISMATCH = 'ADVERTISER_IDENTITY_MISMATCH' as const;
/** 보고서 목록을 보는 간격과 기다리는 상한(보고서 생성은 15일 창에서 약 11~16초, 문서 §13.9). */
export const AD_REPORT_POLL_INTERVAL_MS = 5_000;
export const AD_REPORT_POLL_LIMIT_MS = 5 * 60 * 1000;
/** tetris-api 쪽 크기(목록 API가 500까지 받는다). */
export const AD_CENTER_PAGE_SIZE = 500;
/** 끝없이 돌지 않게 둔 쪽 상한(캠페인 500×20, 그룹당 광고 500×40). */
const MAX_CAMPAIGN_PAGES = 20;
const MAX_AD_PAGES = 40;

/**
 * `advertising.ad_report`(KID-371). 광고센터 [일별] 상품·키워드 보고서를 만들어 기다렸다 받고, 캠페인·광고 현재 상태와
 * 정산(SELLER·RETAIL)을 읽어 청크로 보낸다. 모두 읽기이고 보고서 생성만 허용된 쓰기다. 받지 못했을 때(조회 오류·로그인·
 * 시간 초과)만 멈추고, 보고서와 정산의 대조와 창 좁히기는 서버 finalize가 한다.
 */
export const adReportCollector: Collector<AdReportPlan, Record<string, unknown>, AdReportSite> = {
  kind: AD_REPORT_KIND,
  site: 'ad-center',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = AdReportPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '광고 보고서 수집 계획이 올바르지 않습니다.', { kind: AD_REPORT_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '광고센터 사이트를 쓸 수 없습니다.', { kind: AD_REPORT_KIND });
    const plan = parsed.data;
    const range = { startDate: plan.startDate, endDate: plan.endDate };
    if (signal.aborted) return;

    // 보고서용 캠페인 목록이 첫 광고센터 호출이다 — 로그인이 필요하면 여기서 로그인하고, 그 뒤 탭 화면에서 업체코드를 읽는다.
    const reportCampaignIds = (await site.listReportCampaigns(range)).map((campaign) => campaign.id);
    // 다른 광고센터 계정이면 보고서를 만들지 않는다(옛 업체코드 대조).
    let vendorId: string | null = null;
    if (plan.vendorId !== null) {
      vendorId = await site.readVendorId();
      if (vendorId !== plan.vendorId) {
        throw new RuntimeError(ADVERTISER_IDENTITY_MISMATCH, '광고센터 업체코드가 수집 계정과 일치하지 않습니다. 수집할 계정으로 다시 로그인한 뒤 시작해 주세요.', {
          plannedVendorId: plan.vendorId,
          observedVendorId: vendorId,
        });
      }
    }

    if (reportCampaignIds.length === 0) throw failed('no_report_campaigns', '보고서를 만들 캠페인이 없습니다.');

    // 1. 보고서 둘을 만든다(캠페인 ID 필수 — 비우면 광고센터가 거절한다).
    const requested = [];
    for (const granularity of ['vendorItem', 'keyword'] as const) {
      const requestedAt = new Date().toISOString();
      const created = await site.requestReport({ ...range, campaignIds: reportCampaignIds, granularity });
      requested.push({ granularity, reportId: created.id, requestedAt, isLargeReport: created.isLargeReport, completedAt: null as string | null });
    }

    // 2. 둘 다 completed까지 5초마다 본다(최대 5분). 기다리는 동안 progress로 임대를 연장한다.
    for (let waited = 0; ; waited += AD_REPORT_POLL_INTERVAL_MS) {
      if (signal.aborted) return;
      const listed = new Map((await site.listReports()).map((entry) => [entry.id, entry]));
      for (const entry of requested) {
        const current = listed.get(entry.reportId);
        if (!current || entry.completedAt) continue;
        if (current.status === 'error') throw failed('report_failed', '광고센터가 보고서를 만들지 못했습니다.', { reportId: entry.reportId });
        if (current.status === 'completed') {
          entry.completedAt = new Date().toISOString();
          entry.isLargeReport = current.isLargeReport;
        }
      }
      if (requested.every((entry) => entry.completedAt)) break;
      if (waited >= AD_REPORT_POLL_LIMIT_MS) {
        throw failed('report_timeout', '광고센터 보고서가 5분 안에 만들어지지 않았습니다. 잠시 뒤 다시 수집해 주세요.', {
          pending: requested.filter((entry) => !entry.completedAt).map((entry) => entry.reportId),
        });
      }
      await report?.({ phase: 'waiting_reports', waitedMs: waited + AD_REPORT_POLL_INTERVAL_MS, completed: requested.filter((entry) => entry.completedAt).length });
      await site.pause(AD_REPORT_POLL_INTERVAL_MS);
    }
    const [productReport, keywordReport] = requested as [typeof requested[number], typeof requested[number]];

    // 캠페인 현재 상태를 먼저 읽는다 — 큰 보고서(TSV)에는 광고그룹 ID가 없어 캠페인의 그룹으로 채운다.
    const campaigns = await readCampaigns(site);
    const campaignGroups = new Map<string, string>();
    for (const campaign of campaigns) for (const group of campaign.adGroups) campaignGroups.set(groupKey(campaign.campaignId, group.name), group.adGroupId);

    // 3. 상품 보고서.
    if (signal.aborted) return;
    const productRecords = await site.downloadReport({ id: productReport.reportId, isLargeReport: productReport.isLargeReport });
    const productRows: AdReportProductRow[] = [];
    const reportGroups = new Map<string, string>();
    for (const [index, record] of productRecords.entries()) {
      const row = productRow(record, index, campaignGroups);
      if (!row) continue;
      productRows.push(row);
      reportGroups.set(groupKey(row.campaignId, row.adGroupName), row.adGroupId);
    }
    yield* chunked(AD_REPORT_PRODUCT_ROWS_CHUNK_KIND, productRows, '상품 보고서 행', { phase: 'product_rows' });

    // 4. 키워드 보고서 — 광고그룹 ID는 상품 보고서의 (캠페인, 그룹 이름)으로 채운다.
    if (signal.aborted) return;
    const keywordRecords = await site.downloadReport({ id: keywordReport.reportId, isLargeReport: keywordReport.isLargeReport });
    const keywordRows = keywordRecords.flatMap((record, index) => keywordRow(record, index, reportGroups) ?? []);
    yield* chunked(AD_REPORT_KEYWORD_ROWS_CHUNK_KIND, keywordRows, '키워드 보고서 행', { phase: 'keyword_rows' });

    // 5. 캠페인·광고 현재 상태.
    yield* chunked(AD_REPORT_CAMPAIGNS_CHUNK_KIND, campaigns, '캠페인', { phase: 'campaigns' });
    const ads: AdReportAd[] = [];
    for (const campaign of campaigns) {
      for (const group of campaign.adGroups) {
        if (signal.aborted) return;
        ads.push(...await readAds(site, campaign.campaignId, group.adGroupId));
      }
    }
    yield* chunked(AD_REPORT_ADS_CHUNK_KIND, ads, '광고', { phase: 'ads' });

    // 6. 정산 — 영역마다 한 번. campaignIds 형식을 거절하면 계정 전체로 대신한다.
    const settlementCampaignIds = reportCampaignIds.map(Number);
    for (const domain of plan.settlementDomains) {
      if (signal.aborted) return;
      let items: unknown[];
      try {
        items = await site.readSettlement({ ...range, domain, campaignIds: settlementCampaignIds });
      } catch (error) {
        if (!(isRuntimeError(error) && error.code === SITE_REQUEST_FAILED && error.details?.reason === 'graphql_error')) throw error;
        items = await site.readSettlement({ ...range, domain, campaignIds: null });
      }
      const rows = items.map((item, index) => settlementRow(item, domain, index));
      yield* chunked(AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND, rows, '정산 행', { phase: 'settlement', domain });
    }

    // 7. 창 전체의 증거.
    if (signal.aborted) return;
    const period: AdReportPeriod = {
      ...range,
      capturedAt: new Date().toISOString(),
      vendorId,
      reports: [
        { granularity: 'vendorItem', reportId: productReport.reportId, requestedAt: productReport.requestedAt, completedAt: productReport.completedAt!, rowCount: productRows.length, isLargeReport: productReport.isLargeReport },
        { granularity: 'keyword', reportId: keywordReport.reportId, requestedAt: keywordReport.requestedAt, completedAt: keywordReport.completedAt!, rowCount: keywordRows.length, isLargeReport: keywordReport.isLargeReport },
      ],
      campaignCount: campaigns.length,
      adCount: ads.length,
    };
    yield { chunkKind: AD_REPORT_PERIOD_CHUNK_KIND, payload: [period], progress: { phase: 'done', productRows: productRows.length, keywordRows: keywordRows.length } };
  },
};

/** 1,500행·1MiB씩(`ChunkBuffer`). */
function* chunked<T>(chunkKind: OperationChunkKind, items: readonly T[], label: string, progress: Record<string, unknown>): Generator<CollectedChunk> {
  const buffer = new ChunkBuffer<T>({ maxItems: AD_REPORT_ROWS_PER_CHUNK, label });
  for (const item of items) {
    const full = buffer.push(item);
    if (full) yield { chunkKind, payload: full, progress };
  }
  const rest = buffer.flush();
  if (rest) yield { chunkKind, payload: rest, progress };
}

async function readCampaigns(site: AdReportSite): Promise<AdReportCampaign[]> {
  const campaigns: AdReportCampaign[] = [];
  for (let page = 0; ; page += 1) {
    if (page >= MAX_CAMPAIGN_PAGES) throw failed('campaign_page_limit', '광고센터 캠페인 목록이 너무 깁니다.', { page });
    const list = await site.listCampaigns(page);
    campaigns.push(...list.map((value, index) => campaignOf(value, page * AD_CENTER_PAGE_SIZE + index)));
    if (list.length < AD_CENTER_PAGE_SIZE) return campaigns;
  }
}

/** 그룹의 광고 전부. 광고센터는 `hasNextPage`를 늘 false로 주므로 `totalCount`까지 쪽을 넘긴다. */
async function readAds(site: AdReportSite, campaignId: string, adGroupId: string): Promise<AdReportAd[]> {
  const ads: AdReportAd[] = [];
  for (let page = 0; ; page += 1) {
    if (page >= MAX_AD_PAGES) throw failed('ads_page_limit', '광고센터 광고 목록이 너무 깁니다.', { adGroupId });
    const { ads: list, totalCount } = await site.listAds({ adGroupId, page });
    ads.push(...list.map((value) => adOf(value, campaignId, adGroupId)));
    if (ads.length >= totalCount) return ads;
    if (list.length === 0) throw failed('ads_incomplete', '광고센터 광고 목록이 전체 수보다 적게 왔습니다.', { adGroupId, totalCount, received: ads.length });
  }
}

/** 상품 보고서 행. 광고 옵션이 없는 행(캠페인·그룹 합계 행)은 상품 사실이 아니므로 뺀다. */
function productRow(record: Record<string, unknown>, index: number, campaignGroups: Map<string, string>): AdReportProductRow | null {
  const advertisedVendorItemId = id(record.advertised_vendor_item_id);
  if (advertisedVendorItemId === null && blank(record.advertised_vendor_item_id)) return null;
  const campaignId = id(record.campaign_id);
  const adGroupName = text(record.ad_group_name);
  const adGroupId = id(record.ad_group_id) ?? (campaignId && adGroupName !== null ? campaignGroups.get(groupKey(campaignId, adGroupName)) ?? null : null);
  const date = reportDate(record.dt);
  const vendorItemId = id(record.vendor_item_id) ?? advertisedVendorItemId;
  const campaignName = text(record.campaign_name);
  const placementGroup = text(record.placement_group);
  if (!date || !campaignId || !advertisedVendorItemId || !vendorItemId || campaignName === null || adGroupName === null || placementGroup === null) {
    throw rowInvalid('product', index);
  }
  if (!adGroupId) {
    throw failed('ad_group_unresolved', '광고센터 보고서 행의 광고그룹을 찾지 못했습니다.', { campaignId, adGroupName, row: index + 1 });
  }
  return { date, campaignId, campaignName, adGroupId, adGroupName, advertisedVendorItemId, vendorItemId, placementGroup, ...metrics(record, 'product', index) };
}

function keywordRow(record: Record<string, unknown>, index: number, reportGroups: Map<string, string>): AdReportKeywordRow | null {
  const advertisedVendorItemId = id(record.advertised_vendor_item_id);
  if (advertisedVendorItemId === null && blank(record.advertised_vendor_item_id)) return null;
  const date = reportDate(record.dt);
  const campaignId = id(record.campaign_id);
  const adGroupName = text(record.ad_group_name);
  const vendorItemId = id(record.vendor_item_id) ?? advertisedVendorItemId;
  // 비검색 영역 행은 키워드가 비어 있다.
  const keyword = blank(record.keywords) ? '' : text(record.keywords);
  if (!date || !campaignId || !advertisedVendorItemId || !vendorItemId || adGroupName === null || keyword === null) throw rowInvalid('keyword', index);
  const adGroupId = id(record.ad_group_id) ?? reportGroups.get(groupKey(campaignId, adGroupName)) ?? null;
  return { date, campaignId, adGroupId, adGroupName, advertisedVendorItemId, vendorItemId, keyword, ...metrics(record, 'keyword', index) };
}

/** 노출·클릭·광고비와 14일 direct+halo 전환. 광고비는 원 단위로 반올림한다. */
function metrics(record: Record<string, unknown>, report: string, index: number) {
  const value = (field: string) => {
    const parsed = number(record[field]);
    if (parsed === null) throw rowInvalid(report, index, field);
    return Math.round(parsed);
  };
  const sum = (kind: 'order_14_days_by_cli_count' | 'unit_14_days_by_cli_count' | 'sale_14_days_by_cli_price') => value(`direct_${kind}`) + value(`halo_${kind}`);
  return {
    impressions: value('impressions_count'),
    clicks: value('clicks_count'),
    spend: value('ad_cost_sum'),
    orders: sum('order_14_days_by_cli_count'),
    units: sum('unit_14_days_by_cli_count'),
    revenue: sum('sale_14_days_by_cli_price'),
  };
}

function campaignOf(value: unknown, index: number): AdReportCampaign {
  const campaign = record(value);
  const campaignId = id(campaign?.id ?? campaign?.campaignId);
  if (!campaign || !campaignId) throw failed('campaign_invalid', '광고센터 캠페인 응답이 올바르지 않습니다.', { index });
  const groups = Array.isArray(campaign.groupList) ? campaign.groupList : [];
  return {
    campaignId,
    name: text(campaign.name) ?? '',
    isActive: campaign.isActive === true,
    status: text(campaign.status),
    servingStatus: text(campaign.servingStatus),
    budget: integerOrNull(campaign.budget),
    budgetType: text(campaign.capType ?? campaign.budgetType),
    roasTarget: number(campaign.roasTarget),
    adSelectionType: text(campaign.adSelectionType ?? campaign.objective),
    adGroups: groups.flatMap((group) => {
      const entry = record(group);
      const adGroupId = id(entry?.id ?? entry?.adGroupId);
      return adGroupId ? [{ adGroupId, name: text(entry?.name) ?? '' }] : [];
    }),
    totalAdCount: count(campaign.totalAdCount),
  };
}

/**
 * 광고 하나. `/ads` 응답의 광고 필드 이름은 실측이 없다(문서 "실측 미기록") — 후보를 모두 읽는다(가정, 첫 QA에서 fixture 녹화):
 * 광고 ID `adId`·`id`, 옵션 `vendorItemId`·`vendorItem.vendorItemId`·`vendorItem.id`, 켜짐 `isActive`·`active`, 상태 `status`·`adStatus`.
 */
export function adOf(value: unknown, campaignId: string, adGroupId: string): AdReportAd {
  const ad = record(value);
  const adId = id(ad?.adId ?? ad?.id);
  if (!ad || !adId) throw failed('ad_invalid', '광고센터 광고 응답에 광고 ID가 없습니다.', { adGroupId });
  const vendorItem = record(ad.vendorItem);
  const active = typeof ad.isActive === 'boolean' ? ad.isActive : typeof ad.active === 'boolean' ? ad.active : null;
  return {
    adId,
    campaignId,
    adGroupId,
    vendorItemId: id(ad.vendorItemId ?? vendorItem?.vendorItemId ?? vendorItem?.id),
    isActive: active,
    status: text(ad.status ?? ad.adStatus),
  };
}

function settlementRow(value: unknown, domain: AdSettlementDomain, index: number): AdReportSettlementRow {
  const item = record(value);
  const date = settlementDate(item?.date);
  const money = (field: string) => {
    const parsed = number(item?.[field]);
    if (parsed === null) throw rowInvalid('settlement', index, field);
    return Math.round(parsed);
  };
  if (!item || !date) throw rowInvalid('settlement', index, 'date');
  const campaignId = blank(item.campaignId) ? null : id(item.campaignId);
  if (!blank(item.campaignId) && campaignId === null) throw rowInvalid('settlement', index, 'campaignId');
  return {
    date,
    settlementDomain: domain,
    campaignId,
    campaignName: text(item.campaignName),
    deliveredSpend: money('deliveredAdcost'),
    billedSpend: money('billableAmount'),
    promotionAdjustment: money('promotionAdjustment'),
    billableAdjustment: money('billableAdjustment'),
  };
}

function groupKey(campaignId: string, adGroupName: string): string {
  return JSON.stringify([campaignId, adGroupName]);
}

/** 보고서 `dt`(YYYYMMDD 문자열·정수) → YYYY-MM-DD. */
function reportDate(value: unknown): string | null {
  const digits = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(digits);
  return match ? calendarDate(`${match[1]}-${match[2]}-${match[3]}`) : null;
}

/** 정산 `date`: YYYY-MM-DD·YYYYMMDD 모두 받는다(형식 실측 없음). */
function settlementDate(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return calendarDate(value.trim());
  return reportDate(value);
}

function calendarDate(value: string): string | null {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function id(value: unknown): string | null {
  const textValue = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '';
  return /^[1-9]\d*$/.test(textValue) ? textValue : null;
}

function blank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value.replace(/,/g, '')) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: unknown): number | null {
  const parsed = number(value);
  return parsed === null ? null : Math.round(parsed);
}

function count(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function rowInvalid(report: string, index: number, field?: string): RuntimeError {
  return failed('report_row_invalid', '광고센터 보고서 행 형식이 올바르지 않습니다.', { report, row: index + 1, ...(field ? { field } : {}) });
}

function failed(reason: string, message: string, details: Record<string, unknown> = {}): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { reason, ...details });
}

registerCollector(adReportCollector);
