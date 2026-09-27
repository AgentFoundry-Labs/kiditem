import {
  AdReportAdSchema,
  AdReportCampaignSchema,
  AdReportKeywordRowSchema,
  AdReportPeriodSchema,
  AdReportProductRowSchema,
  AdReportSettlementRowSchema,
} from '@kiditem/shared/advertising-operations';
import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import {
  CAMPAIGN_LIST_DATA,
  KEYWORD_NDJSON,
  PRODUCT_NDJSON,
  PRODUCT_REPORT_ROWS,
  REPORT_LIST_SEQUENCE,
  REQUEST_REPORT_DATA,
  SETTLEMENT_DATA,
  TETRIS_ADS_BODIES,
  TETRIS_CAMPAIGNS_BODY,
} from './__fixtures__/ad-center';
import { adReportCollector, type AdReportSite } from './index';

const ACCOUNT = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const PLAN = {
  channelAccountId: ACCOUNT,
  vendorId: 'A00057379',
  startDate: '2026-09-10',
  endDate: '2026-09-11',
  settlementDomains: ['SELLER', 'RETAIL'],
  startedAt: '2026-09-12T00:00:00.000Z',
};

function ndjson(text: string): Record<string, unknown>[] {
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

type Calls = {
  requests: Array<{ startDate: string; endDate: string; campaignIds: string[]; granularity: string }>;
  downloads: Array<{ id: string; isLargeReport: boolean }>;
  listReports: number;
  pauses: number[];
  settlements: Array<{ domain: string; campaignIds: number[] | null }>;
  ads: Array<{ adGroupId: string; page: number }>;
  vendorReads: number;
};

/** 가짜 광고센터: fixture 모양 그대로(GraphQL data·NDJSON·tetris 본문)를 사이트 핸들의 답으로 돌려준다. */
function fakeAdCenter(options: {
  vendorId?: string;
  campaignList?: typeof CAMPAIGN_LIST_DATA.getCampaignList;
  reportList?: typeof REPORT_LIST_SEQUENCE;
  productRows?: Record<string, unknown>[];
  keywordRows?: Record<string, unknown>[];
  adsBodies?: Record<string, unknown>;
  settlementRejectsCampaignIds?: boolean;
} = {}) {
  const calls: Calls = { requests: [], downloads: [], listReports: 0, pauses: [], settlements: [], ads: [], vendorReads: 0 };
  const reportList = options.reportList ?? REPORT_LIST_SEQUENCE;
  const adsBodies = options.adsBodies ?? TETRIS_ADS_BODIES;
  const site: AdReportSite = {
    async readVendorId() {
      calls.vendorReads += 1;
      return options.vendorId ?? 'A00057379';
    },
    async listReportCampaigns() {
      return options.campaignList ?? CAMPAIGN_LIST_DATA.getCampaignList;
    },
    async requestReport(input) {
      calls.requests.push(input);
      const { id, isLargeReport } = REQUEST_REPORT_DATA[input.granularity].requestReport;
      return { id, isLargeReport };
    },
    async listReports() {
      const step = reportList[Math.min(calls.listReports, reportList.length - 1)]!;
      calls.listReports += 1;
      return step.reportList.reports;
    },
    async downloadReport(input) {
      calls.downloads.push(input);
      return input.id === REQUEST_REPORT_DATA.vendorItem.requestReport.id
        ? options.productRows ?? ndjson(PRODUCT_NDJSON)
        : options.keywordRows ?? ndjson(KEYWORD_NDJSON);
    },
    async listCampaigns(page) {
      return page === 0 ? TETRIS_CAMPAIGNS_BODY.data.campaigns : [];
    },
    async listAds(input) {
      calls.ads.push(input);
      const data = (adsBodies[input.adGroupId] as { data: { ads?: unknown[]; content?: unknown[]; totalCount: number; pages?: unknown[][] } }).data;
      const list = data.pages ? data.pages[input.page] ?? [] : input.page === 0 ? data.ads ?? data.content ?? [] : [];
      return { ads: list, totalCount: data.totalCount };
    },
    async readSettlement(input) {
      calls.settlements.push({ domain: input.domain, campaignIds: input.campaignIds });
      if (options.settlementRejectsCampaignIds && input.campaignIds !== null) {
        throw new RuntimeError('SITE_REQUEST_FAILED', '쿠팡 광고센터 조회가 거절됐습니다: Variable "$campaignIds" got invalid value', { reason: 'graphql_error' });
      }
      return SETTLEMENT_DATA[input.domain].getDailySettlementByCampaigns.items;
    },
    async pause(ms) {
      calls.pauses.push(ms);
    },
  };
  return { site, calls };
}

async function collectAll(plan: unknown, site: AdReportSite | null) {
  const chunks: CollectedChunk[] = [];
  const reports: Array<Record<string, unknown>> = [];
  const signal = new AbortController().signal;
  for await (const chunk of adReportCollector.collect(plan as never, site as never, { signal, tabId: 9, report: async (progress) => { reports.push(progress); } })) {
    chunks.push(chunk);
  }
  return { chunks, reports };
}

function payloadOf(chunks: CollectedChunk[], kind: string): Record<string, unknown>[] {
  return chunks.filter((chunk) => chunk.chunkKind === kind).flatMap((chunk) => chunk.payload) as Record<string, unknown>[];
}

describe('collectors/advertising.ad_report — 광고센터 보고서 2개 + 캠페인·광고 상태 + 정산(KID-371)', () => {
  it('kind 이름으로 등록되고 ad-center 사이트를 쓴다(잠금 키 resource:ad-center:<id>의 둘째 마디)', () => {
    expect(collectorFor('advertising.ad_report')).toBe(adReportCollector);
    expect(adReportCollector.site).toBe('ad-center');
  });

  it('보고서 두 개를 만들어 기다렸다 받고, 캠페인·광고·정산을 읽어 스키마를 통과하는 청크를 순서대로 낸다', async () => {
    const { site, calls } = fakeAdCenter();
    const { chunks, reports } = await collectAll(PLAN, site);

    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual([
      'ad_product_rows', 'ad_keyword_rows', 'ad_campaigns', 'ad_ads', 'ad_settlement_rows', 'ad_settlement_rows', 'ad_period',
    ]);
    // 보고서는 보고서용 캠페인 목록 전체(삭제 캠페인 포함)로 만든다.
    expect(calls.requests).toEqual([
      { startDate: '2026-09-10', endDate: '2026-09-11', campaignIds: ['101', '102', '103'], granularity: 'vendorItem' },
      { startDate: '2026-09-10', endDate: '2026-09-11', campaignIds: ['101', '102', '103'], granularity: 'keyword' },
    ]);
    // 5초마다 목록을 보고, 기다리는 동안 progress로 임대를 연장한다.
    expect(calls.listReports).toBe(3);
    expect(calls.pauses).toEqual([5000, 5000]);
    expect(reports.filter((progress) => progress.phase === 'waiting_reports')).toHaveLength(2);
    expect(calls.downloads).toEqual([{ id: '15116068', isLargeReport: false }, { id: '15116069', isLargeReport: false }]);

    const products = payloadOf(chunks, 'ad_product_rows');
    expect(products).toHaveLength(12);
    for (const row of products) AdReportProductRowSchema.parse(row);
    expect(products[0]).toEqual({
      date: '2026-09-10',
      campaignId: '101',
      campaignName: '상시 캠페인',
      adGroupId: '201',
      adGroupName: '그룹 A',
      advertisedVendorItemId: '9001',
      vendorItemId: '9001',
      placementGroup: '검색 영역',
      impressions: 1000,
      clicks: 20,
      spend: 3000,
      // 14일 direct + halo.
      orders: 3,
      units: 4,
      revenue: 39000,
    });
    // halo 행: 광고한 옵션과 팔린 옵션이 다르다.
    expect(products[5]).toMatchObject({ advertisedVendorItemId: '9001', vendorItemId: '9003', orders: 1, units: 2, revenue: 15000, spend: 0 });

    const keywords = payloadOf(chunks, 'ad_keyword_rows');
    for (const row of keywords) AdReportKeywordRowSchema.parse(row);
    // 그룹 ID는 상품 보고서의 (캠페인, 그룹 이름)으로 채우고, 없으면 null.
    expect(keywords.map((row) => [row.keyword, row.adGroupId])).toEqual([['유아 식판', '201'], ['', '201'], ['아기 수저', '202'], ['빨대컵', null]]);
    expect(keywords[0]).toEqual({
      date: '2026-09-10', campaignId: '101', adGroupId: '201', adGroupName: '그룹 A', advertisedVendorItemId: '9001', vendorItemId: '9001',
      keyword: '유아 식판', impressions: 480, clicks: 12, spend: 1800, orders: 1, units: 1, revenue: 10000,
    });

    const campaigns = payloadOf(chunks, 'ad_campaigns');
    for (const row of campaigns) AdReportCampaignSchema.parse(row);
    expect(campaigns).toEqual([
      {
        campaignId: '101', name: '상시 캠페인', isActive: true, status: 'ACTIVE', servingStatus: 'SERVING', budget: 50000, budgetType: 'DAILY',
        roasTarget: 350, adSelectionType: 'MANUAL', adGroups: [{ adGroupId: '201', name: '그룹 A' }], totalAdCount: 2,
      },
      {
        campaignId: '102', name: 'AI스마트광고', isActive: false, status: 'PAUSED', servingStatus: null, budget: null, budgetType: null,
        roasTarget: null, adSelectionType: 'AUTO', adGroups: [{ adGroupId: '202', name: '새 광고 그룹' }], totalAdCount: 3,
      },
    ]);

    const settlements = payloadOf(chunks, 'ad_settlement_rows');
    for (const row of settlements) AdReportSettlementRowSchema.parse(row);
    expect(calls.settlements).toEqual([{ domain: 'SELLER', campaignIds: [101, 102, 103] }, { domain: 'RETAIL', campaignIds: [101, 102, 103] }]);
    expect(settlements).toEqual([
      { date: '2026-09-10', settlementDomain: 'SELLER', campaignId: '101', campaignName: '상시 캠페인', deliveredSpend: 3950, billedSpend: 3950, promotionAdjustment: 0, billableAdjustment: 0 },
      { date: '2026-09-11', settlementDomain: 'SELLER', campaignId: '101', campaignName: '상시 캠페인', deliveredSpend: 3950, billedSpend: 3500, promotionAdjustment: 0, billableAdjustment: -450 },
      // 캠페인 없는 계정 조정 행.
      { date: '2026-09-11', settlementDomain: 'SELLER', campaignId: null, campaignName: null, deliveredSpend: 0, billedSpend: -3000, promotionAdjustment: -3000, billableAdjustment: 0 },
      { date: '2026-09-10', settlementDomain: 'RETAIL', campaignId: '102', campaignName: 'AI스마트광고', deliveredSpend: 2700, billedSpend: 2700, promotionAdjustment: 0, billableAdjustment: 0 },
    ]);

    const [period] = payloadOf(chunks, 'ad_period');
    AdReportPeriodSchema.parse(period);
    expect(period).toMatchObject({
      startDate: '2026-09-10',
      endDate: '2026-09-11',
      vendorId: 'A00057379',
      reports: [
        { granularity: 'vendorItem', reportId: '15116068', rowCount: 12, isLargeReport: false },
        { granularity: 'keyword', reportId: '15116069', rowCount: 4, isLargeReport: false },
      ],
      campaignCount: 2,
      adCount: 5,
    });
  });

  it('/ads 매퍼는 광고 필드 후보(id·adId, vendorItemId·vendorItem.vendorItemId, isActive·active, status·adStatus)를 모두 읽는다 — 실측 전 가정', async () => {
    const { site, calls } = fakeAdCenter();
    const { chunks } = await collectAll(PLAN, site);
    const ads = payloadOf(chunks, 'ad_ads');
    for (const row of ads) AdReportAdSchema.parse(row);
    expect(calls.ads).toEqual([{ adGroupId: '201', page: 0 }, { adGroupId: '202', page: 0 }]);
    expect(ads).toEqual([
      { adId: '5001', campaignId: '101', adGroupId: '201', vendorItemId: '9001', isActive: true, status: 'ON' },
      { adId: '5002', campaignId: '101', adGroupId: '201', vendorItemId: '9002', isActive: false, status: 'OFF' },
      { adId: '5101', campaignId: '102', adGroupId: '202', vendorItemId: '9101', isActive: false, status: 'PAUSED' },
      { adId: '5102', campaignId: '102', adGroupId: '202', vendorItemId: null, isActive: null, status: null },
      { adId: '5103', campaignId: '102', adGroupId: '202', vendorItemId: '9103', isActive: null, status: null },
    ]);
  });

  it('광고 목록은 hasNextPage를 믿지 않고 totalCount까지 쪽을 넘긴다', async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ adId: 6000 + index, vendorItemId: 7000 + index, isActive: true, status: 'ON' }));
    const { site, calls } = fakeAdCenter({
      adsBodies: { '201': { data: { pages: [first, [{ adId: 6500, vendorItemId: 7500 }]], totalCount: 501, hasNextPage: false } }, '202': TETRIS_ADS_BODIES['202'] },
    });
    const { chunks } = await collectAll(PLAN, site);
    expect(calls.ads.filter((call) => call.adGroupId === '201')).toEqual([{ adGroupId: '201', page: 0 }, { adGroupId: '201', page: 1 }]);
    expect(payloadOf(chunks, 'ad_ads')).toHaveLength(504);
  });

  it('행 청크는 1,500행씩 나눈다', async () => {
    const template = PRODUCT_REPORT_ROWS[0]!;
    const many = Array.from({ length: 3001 }, (_, index) => ({ ...template, advertised_vendor_item_id: 100000 + index, vendor_item_id: 100000 + index }));
    const { site } = fakeAdCenter({ productRows: many });
    const { chunks } = await collectAll(PLAN, site);
    expect(chunks.filter((chunk) => chunk.chunkKind === 'ad_product_rows').map((chunk) => chunk.payload.length)).toEqual([1500, 1500, 1]);
  });

  it('큰 보고서(isLargeReport)는 excel-report로 받고, 광고그룹 ID가 없으면 캠페인 목록의 그룹으로 채운다', async () => {
    const large = REPORT_LIST_SEQUENCE.map((step) => ({ reportList: { reports: step.reportList.reports.map((report) => ({ ...report, isLargeReport: report.id === '15116068' })) } }));
    const withoutGroup = ndjson(PRODUCT_NDJSON).map(({ ad_group_id: _group, ...rest }) => rest);
    const { site, calls } = fakeAdCenter({ reportList: large, productRows: withoutGroup });
    const { chunks } = await collectAll(PLAN, site);
    expect(calls.downloads).toEqual([{ id: '15116068', isLargeReport: true }, { id: '15116069', isLargeReport: false }]);
    const products = payloadOf(chunks, 'ad_product_rows');
    expect(products.map((row) => row.adGroupId)).toEqual(['201', '201', '201', '202', '202', '201', '201', '201', '201', '202', '202', '201']);
    expect(payloadOf(chunks, 'ad_period')[0]).toMatchObject({ reports: [{ granularity: 'vendorItem', isLargeReport: true }, { granularity: 'keyword', isLargeReport: false }] });
  });

  it('보고서가 5분 안에 끝나지 않으면 SITE_REQUEST_FAILED(report_timeout)', async () => {
    const pending = [{ reportList: { reports: [{ id: '15116068', status: 'inprogress', isLargeReport: false }, { id: '15116069', status: 'inprogress', isLargeReport: false }] } }];
    const { site, calls } = fakeAdCenter({ reportList: pending });
    await expect(collectAll(PLAN, site)).rejects.toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'report_timeout' } });
    expect(calls.pauses.reduce((sum, ms) => sum + ms, 0)).toBe(300_000);
    expect(calls.downloads).toEqual([]);
  });

  it('보고서가 error면 받지 않고 멈춘다', async () => {
    const failed = [{ reportList: { reports: [{ id: '15116068', status: 'error', isLargeReport: false }, { id: '15116069', status: 'completed', isLargeReport: false }] } }];
    const { site, calls } = fakeAdCenter({ reportList: failed });
    await expect(collectAll(PLAN, site)).rejects.toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'report_failed', reportId: '15116068' } });
    expect(calls.downloads).toEqual([]);
  });

  it('광고센터 업체코드가 계획과 다르면 아무것도 만들지 않고 멈춘다(ADVERTISER_IDENTITY_MISMATCH)', async () => {
    const { site, calls } = fakeAdCenter({ vendorId: 'A99999999' });
    await expect(collectAll(PLAN, site)).rejects.toMatchObject({
      code: 'ADVERTISER_IDENTITY_MISMATCH',
      details: { plannedVendorId: 'A00057379', observedVendorId: 'A99999999' },
    });
    expect(calls.requests).toEqual([]);
  });

  it('계획에 업체코드가 없으면 대조하지 않는다', async () => {
    const { site, calls } = fakeAdCenter();
    const { chunks } = await collectAll({ ...PLAN, vendorId: null }, site);
    expect(calls.vendorReads).toBe(0);
    expect(payloadOf(chunks, 'ad_period')[0]).toMatchObject({ vendorId: null });
  });

  it('보고서용 캠페인이 없으면 SITE_REQUEST_FAILED("보고서를 만들 캠페인이 없습니다")', async () => {
    const { site, calls } = fakeAdCenter({ campaignList: [] });
    await expect(collectAll(PLAN, site)).rejects.toMatchObject({ code: 'SITE_REQUEST_FAILED', message: '보고서를 만들 캠페인이 없습니다.' });
    expect(calls.requests).toEqual([]);
  });

  it('정산이 campaignIds를 거절하면(GraphQL 오류) 계정 전체 정산으로 대신 읽는다', async () => {
    const { site, calls } = fakeAdCenter({ settlementRejectsCampaignIds: true });
    const { chunks } = await collectAll(PLAN, site);
    expect(calls.settlements).toEqual([
      { domain: 'SELLER', campaignIds: [101, 102, 103] },
      { domain: 'SELLER', campaignIds: null },
      { domain: 'RETAIL', campaignIds: [101, 102, 103] },
      { domain: 'RETAIL', campaignIds: null },
    ]);
    expect(payloadOf(chunks, 'ad_settlement_rows')).toHaveLength(4);
  });

  it('계획이 올바르지 않거나 사이트가 없으면 RUNTIME_PLAN_INVALID', async () => {
    const { site } = fakeAdCenter();
    await expect(collectAll({ ...PLAN, settlementDomains: [] }, site)).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    await expect(collectAll(PLAN, null)).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
  });
});
