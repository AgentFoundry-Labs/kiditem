import { KiditemConflictError, KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  AD_REPORT_ADS_CHUNK_KIND,
  AD_REPORT_CAMPAIGNS_CHUNK_KIND,
  AD_REPORT_DEFAULT_WINDOW_DAYS,
  AD_REPORT_KEYWORD_ROWS_CHUNK_KIND,
  AD_REPORT_MAX_WINDOW_DAYS,
  AD_REPORT_PERIOD_CHUNK_KIND,
  AD_REPORT_PRODUCT_ROWS_CHUNK_KIND,
  AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND,
  AdReportAdSchema,
  AdReportCampaignSchema,
  AdReportKeywordRowSchema,
  AdReportPeriodSchema,
  AdReportProductRowSchema,
  AdReportSettlementRowSchema,
  type AdReportAd,
  type AdReportCampaign,
  type AdReportPeriod,
  type AdReportPlan,
  type AdReportReconciliationWarning,
  type AdReportScope,
} from '@kiditem/shared/advertising-operations';
import { inclusiveDayCount, parseBusinessDate, shiftBusinessDateKey } from '@kiditem/shared/common';
import type { z } from 'zod';
import { confirmedAdReportEnd } from './ad-report-confirmation';
import { settleAdReport, type AdReportBilling } from './ad-report-billing';

const KNOWN_CHUNK_KINDS = new Set<string>([
  AD_REPORT_CAMPAIGNS_CHUNK_KIND,
  AD_REPORT_ADS_CHUNK_KIND,
  AD_REPORT_PRODUCT_ROWS_CHUNK_KIND,
  AD_REPORT_KEYWORD_ROWS_CHUNK_KIND,
  AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND,
  AD_REPORT_PERIOD_CHUNK_KIND,
]);

/** 보고서가 광고그룹 id를 주지 않았고 캠페인 목록·상품 보고서로도 풀지 못한 행의 키 값(상품·키워드 표 공통). */
export const UNKNOWN_AD_GROUP_ID = '';

type Metrics = { impressions: number; clicks: number; spend: number; orders: number; units: number; revenue: number };
const METRICS = ['impressions', 'clicks', 'spend', 'orders', 'units', 'revenue'] as const;

/** 광고 옵션×광고그룹×일 사실(검색/비검색·halo 행을 더한 것). `listingId`는 저장소가 Channels 카탈로그로 맞춘다. */
export type AdReportProductFact = Metrics & {
  date: string;
  campaignId: string;
  adGroupId: string;
  vendorItemId: string;
  billedSpend: number;
};

export type AdReportKeywordFact = Metrics & {
  date: string;
  campaignId: string;
  adGroupId: string;
  vendorItemId: string;
  keyword: string;
};

/** 보고서 행에만 있는 캠페인(삭제됨). 이름은 보고서 행에서. */
export type AdReportDeletedCampaign = { campaignId: string; name: string };

export type AdReportCompletion = {
  period: AdReportPeriod;
  confirmedEnd: string;
  products: AdReportProductFact[];
  keywords: AdReportKeywordFact[];
  billings: AdReportBilling[];
  campaigns: AdReportCampaign[];
  deletedCampaigns: AdReportDeletedCampaign[];
  ads: AdReportAd[];
  settlementRowCount: number;
  unsettledCampaignDays: number;
  accountAdjustmentRows: number;
  warnings: AdReportReconciliationWarning[];
};

/**
 * 시작 scope의 창. 비우면 [마감일−14, 마감일](15일), 한쪽만 주면 다른 쪽을 채운다. 마감일(KST 어제)을 넘거나
 * 31일(정산 조회 상한)을 넘으면 거절한다.
 */
export function adReportPlanWindow(scope: AdReportScope, closedDay: string): { startDate: string; endDate: string } {
  const endDate = scope.endDate ?? closedDay;
  const startDate = scope.startDate ?? shiftBusinessDateKey(endDate, -(AD_REPORT_DEFAULT_WINDOW_DAYS - 1));
  if (endDate > closedDay) {
    throw invalid('window_after_closed_day', { endDate, closedDay }, '광고 보고서는 어제까지만 수집할 수 있습니다. 종료일을 바꿔 주세요.');
  }
  if (startDate > endDate) {
    throw invalid('window_reversed', { startDate, endDate }, '시작일이 종료일보다 늦습니다. 기간을 바꿔 주세요.');
  }
  const days = inclusiveDayCount(parseBusinessDate(startDate)!, parseBusinessDate(endDate)!);
  if (days > AD_REPORT_MAX_WINDOW_DAYS) {
    throw invalid('window_too_long', { startDate, endDate, days, maxDays: AD_REPORT_MAX_WINDOW_DAYS }, '광고 보고서 기간은 31일까지입니다. 기간을 줄여 주세요.');
  }
  return { startDate, endDate };
}

/**
 * `advertising.ad_report` 완결 판정과 원장 행 만들기(KID-371). 기간 증거 `ad_period`가 정확히 하나이고 plan 창·업체코드와
 * 맞아야 한다(없으면 "보고서 행이 없습니다"). 증거가 있으면 행 0개도 측정한 0이다(KID-45) — 창의 옛 행을 지우고 성공한다. 창 끝은 전날 보류 규칙으로 정하고
 * (`confirmedAdReportEnd`), 확정 창 밖 행은 버린다. 상품 행은 (날짜, 캠페인, 광고그룹, 광고 옵션)으로, 키워드 행은
 * 거기에 키워드를 더해 합한다. 빈 광고그룹은 캠페인 목록과 상품 보고서의 (캠페인, 그룹 이름)으로 채우고, 그래도 없으면
 * 상품·키워드 행 모두 `''`로 둔다(unique 키가 NULL로 새지 않게).
 */
export function completeAdReport(
  chunks: readonly OperationStagedChunk[],
  plan: AdReportPlan,
  closedDay: string,
): AdReportCompletion {
  const unknown = chunks.find((chunk) => !KNOWN_CHUNK_KINDS.has(chunk.chunkKind));
  if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
  const periods = chunkItems(chunks, AD_REPORT_PERIOD_CHUNK_KIND, AdReportPeriodSchema);
  // 기간 증거가 보고서 2개를 만들었다는 증명이다. 없으면 받은 행이 있어도 창을 측정했다고 볼 수 없다.
  if (periods.length === 0) {
    throw invalid('ad_report_rows_missing', {}, '보고서 행이 없습니다. 광고센터에서 다시 수집해 주세요.');
  }
  if (periods.length !== 1) throw invalid('ad_report_incomplete', { periods: periods.length });
  const period = periods[0]!;
  if (period.startDate !== plan.startDate || period.endDate !== plan.endDate) {
    throw invalid('period_mismatch', { planned: [plan.startDate, plan.endDate], observed: [period.startDate, period.endDate] });
  }
  // 다른 업체로 로그인한 광고센터 세션이 만든 보고서를 이 계정에 쓰지 않는다.
  if (plan.vendorId && period.vendorId && period.vendorId !== plan.vendorId) {
    throw new KiditemConflictError('ADVERTISING_IDENTITY_MISMATCH', { details: { plannedVendorId: plan.vendorId, observedVendorId: period.vendorId } });
  }
  const productRows = chunkItems(chunks, AD_REPORT_PRODUCT_ROWS_CHUNK_KIND, AdReportProductRowSchema);
  const keywordRows = chunkItems(chunks, AD_REPORT_KEYWORD_ROWS_CHUNK_KIND, AdReportKeywordRowSchema);
  const settlementRows = chunkItems(chunks, AD_REPORT_SETTLEMENT_ROWS_CHUNK_KIND, AdReportSettlementRowSchema);
  const campaigns = uniqueBy(chunkItems(chunks, AD_REPORT_CAMPAIGNS_CHUNK_KIND, AdReportCampaignSchema), (campaign) => campaign.campaignId);
  const ads = uniqueBy(chunkItems(chunks, AD_REPORT_ADS_CHUNK_KIND, AdReportAdSchema), (ad) => ad.adId);

  const inPlan = (date: string) => date >= plan.startDate && date <= plan.endDate;
  const daySpend = new Map<string, number>();
  for (const row of productRows) {
    if (inPlan(row.date)) daySpend.set(row.date, (daySpend.get(row.date) ?? 0) + row.spend);
  }
  // 보고서는 창의 모든 날을 보므로 행이 없는 창 안 날은 0으로 관측한 날이다.
  const confirmedEnd = confirmedAdReportEnd({
    requestedEnd: plan.endDate,
    closedDay,
    daySpend: (date) => (inPlan(date) ? daySpend.get(date) ?? 0 : undefined),
  });
  // 창이 보류된 하루뿐이면(하루짜리 창의 마감일 광고비가 아직 0) 확정할 날이 없다. 뒤집힌 창을 쓰지 않고 다시 수집하게 한다.
  if (confirmedEnd < plan.startDate) {
    throw new KiditemConflictError('ADVERTISING_AD_REPORT_DAY_NOT_READY', { details: { startDate: plan.startDate, endDate: plan.endDate } });
  }
  const inWindow = (date: string) => date >= plan.startDate && date <= confirmedEnd;

  const adGroupIdByName = adGroupIdsByName(campaigns, productRows);
  const resolveAdGroupId = (row: { campaignId: string; adGroupId: string | null; adGroupName: string }) =>
    row.adGroupId ?? adGroupIdByName.get(`${row.campaignId}:${row.adGroupName}`) ?? null;
  const products = new Map<string, Omit<AdReportProductFact, 'billedSpend'>>();
  for (const row of productRows) {
    if (!inWindow(row.date)) continue;
    // 풀지 못한 광고그룹(큰 보고서의 삭제 캠페인)은 '' 한 칸으로 모아 키를 지킨다.
    const adGroupId = resolveAdGroupId(row) ?? UNKNOWN_AD_GROUP_ID;
    const key = [row.date, row.campaignId, adGroupId, row.advertisedVendorItemId].join(':');
    const current = products.get(key);
    if (current) addMetrics(current, row);
    else products.set(key, { date: row.date, campaignId: row.campaignId, adGroupId, vendorItemId: row.advertisedVendorItemId, ...metricsOf(row) });
  }
  const productFacts = [...products.values()];
  const windowSettlements = settlementRows.filter((row) => inWindow(row.date));
  const settled = settleAdReport({ products: productFacts, settlements: windowSettlements });

  const keywords = new Map<string, AdReportKeywordFact>();
  for (const row of keywordRows) {
    if (!inWindow(row.date)) continue;
    const adGroupId = resolveAdGroupId(row) ?? UNKNOWN_AD_GROUP_ID;
    const key = [row.date, row.campaignId, adGroupId, row.advertisedVendorItemId, row.keyword].join(':');
    const current = keywords.get(key);
    if (current) addMetrics(current, row);
    else keywords.set(key, { date: row.date, campaignId: row.campaignId, adGroupId, vendorItemId: row.advertisedVendorItemId, keyword: row.keyword, ...metricsOf(row) });
  }

  const listed = new Set(campaigns.map((campaign) => campaign.campaignId));
  const deletedCampaigns = new Map<string, AdReportDeletedCampaign>();
  for (const row of productRows) {
    if (!listed.has(row.campaignId) && !deletedCampaigns.has(row.campaignId)) {
      deletedCampaigns.set(row.campaignId, { campaignId: row.campaignId, name: row.campaignName });
    }
  }

  return {
    period,
    confirmedEnd,
    products: productFacts.map((fact, index) => ({ ...fact, billedSpend: settled.billedSpend[index]! })),
    keywords: [...keywords.values()],
    billings: settled.billings,
    campaigns,
    deletedCampaigns: [...deletedCampaigns.values()],
    ads,
    settlementRowCount: windowSettlements.length,
    unsettledCampaignDays: settled.unsettledCampaignDays,
    accountAdjustmentRows: settled.accountAdjustmentRows,
    warnings: settled.warnings,
  };
}

/**
 * (캠페인, 그룹 이름) → 광고그룹 id. 캠페인 목록의 그룹과 id가 있는 상품 행에서 모은다. 같은 이름이 다른 id 둘을
 * 가리키면 맞추지 않는다.
 */
function adGroupIdsByName(
  campaigns: readonly AdReportCampaign[],
  rows: ReadonlyArray<{ campaignId: string; adGroupName: string; adGroupId: string | null }>,
): Map<string, string> {
  const ids = new Map<string, string | null>();
  const add = (campaignId: string, name: string, adGroupId: string) => {
    const key = `${campaignId}:${name}`;
    const current = ids.get(key);
    if (current === undefined) ids.set(key, adGroupId);
    else if (current !== adGroupId) ids.set(key, null);
  };
  for (const campaign of campaigns) {
    for (const group of campaign.adGroups) add(campaign.campaignId, group.name, group.adGroupId);
  }
  for (const row of rows) {
    if (row.adGroupId !== null) add(row.campaignId, row.adGroupName, row.adGroupId);
  }
  return new Map([...ids].filter((entry): entry is [string, string] => entry[1] !== null));
}

function metricsOf(row: Metrics): Metrics {
  return { impressions: row.impressions, clicks: row.clicks, spend: row.spend, orders: row.orders, units: row.units, revenue: row.revenue };
}

function addMetrics(target: Metrics, row: Metrics): void {
  for (const metric of METRICS) target[metric] += row[metric];
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function chunkItems<S extends z.ZodTypeAny>(chunks: readonly OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  const items: Array<z.output<S>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== chunkKind) continue;
    for (const raw of chunk.payload) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw invalid('invalid_chunk_item', {
          chunkKind,
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      items.push(parsed.data);
    }
  }
  return items;
}

function invalid(reason: string, details: Record<string, unknown>, message?: string): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details }, ...(message ? { message } : {}) });
}
