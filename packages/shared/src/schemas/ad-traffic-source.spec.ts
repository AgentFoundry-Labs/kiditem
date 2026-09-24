import { describe, expect, it } from 'vitest';
import {
  AdTrafficSourceBeginSchema,
  AdTrafficSourceDailyPublishedSchema,
  AdTrafficSourceDailyPlanSchema,
  AdTrafficSourcePeriodReceiptInputSchema,
  AdTrafficSourcePlanSchema,
  AdTrafficSourceReceiptInputSchema,
  AdTrafficSourceReceiptSchema,
  WING_TRAFFIC_MAX_COLLECTION_DAYS,
  adTrafficReconciliationStatus,
  dailyTrafficFactSource,
} from './ad-traffic-source';

describe('Wing traffic collection start', () => {
  it('admits a collection of up to 92 days and refuses a longer one', () => {
    expect(WING_TRAFFIC_MAX_COLLECTION_DAYS).toBe(92);
    expect(AdTrafficSourceBeginSchema.safeParse({
      startDate: '2026-06-01',
      endDate: '2026-08-31',
    }).success).toBe(true);
    expect(AdTrafficSourceBeginSchema.safeParse({
      startDate: '2026-05-31',
      endDate: '2026-08-31',
    }).success).toBe(false);
  });

  it('keeps reading a longer plan an earlier release admitted', () => {
    const expectedDates = Array.from({ length: 93 }, (_, index) =>
      new Date(Date.UTC(2026, 4, 31 + index)).toISOString().slice(0, 10));
    expect(AdTrafficSourceDailyPlanSchema.safeParse({
      sourceType: 'coupang_wing_traffic',
      parserVersion: 'wing-traffic-daily-v2',
      channelAccountId: '00000000-0000-4000-8000-000000000001',
      expectedAdvertiserId: 'A',
      providerVendorId: 'A',
      startDate: '2026-05-31',
      endDate: '2026-08-31',
      businessDate: '2026-08-31',
      periodDays: 93,
      expectedDates,
      filterScope: 'ALL_NORMAL_RFM',
      targetUrl: null,
    }).success).toBe(true);
  });
});

describe('adTrafficReconciliationStatus', () => {
  it('derives the word from the two measured totals only', () => {
    expect(adTrafficReconciliationStatus({ dailySum: 20, periodValue: 20 })).toBe('MATCHED');
    expect(adTrafficReconciliationStatus({ dailySum: 0, periodValue: 1 })).toBe('MISMATCH');
    expect(adTrafficReconciliationStatus({ dailySum: 0, periodValue: null })).toBe('UNVERIFIED');
    expect(adTrafficReconciliationStatus({ dailySum: null, periodValue: 0 })).toBe('UNVERIFIED');
  });
});

const accountSummary = {
  visitors: 1065,
  views: 1391,
  cartAdds: 170,
  orders: 58,
  salesQty: 173,
  revenue: 363200,
  providerConversionRate: 4.17,
};

const rawSummary = {
  visitors: 1065,
  views: 1391,
  cartAdds: 170,
  orders: 58,
  salesQty: 173,
  revenue: 363200,
  conversionRate: 4.17,
};

const plan = {
  sourceType: 'coupang_wing_traffic' as const,
  parserVersion: 'wing-traffic-daily-v2' as const,
  channelAccountId: '00000000-0000-4000-8000-000000000001',
  expectedAdvertiserId: 'A',
  providerVendorId: 'A',
  startDate: '2026-09-01',
  endDate: '2026-09-03',
  businessDate: '2026-09-03',
  periodDays: 3,
  expectedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
  filterScope: 'ALL_NORMAL_RFM' as const,
  targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
};

describe('Wing traffic daily v2 wire', () => {
  it('freezes an inclusive sorted date vector and compatibility businessDate', () => {
    expect(AdTrafficSourceDailyPlanSchema.parse(plan)).toMatchObject({
      expectedDates: plan.expectedDates,
      businessDate: plan.endDate,
    });
    expect(AdTrafficSourceDailyPlanSchema.safeParse({
      ...plan,
      expectedDates: ['2026-09-03', '2026-09-02', '2026-09-01'],
    }).success).toBe(false);
    expect(AdTrafficSourceDailyPlanSchema.safeParse({
      ...plan,
      businessDate: plan.startDate,
    }).success).toBe(false);
  });

  it('names the writer of a traffic fact from its namespace', () => {
    expect(dailyTrafficFactSource({ 'wing.traffic': { grain: 'listing_option_sum' } })).toBe('wing');
    expect(dailyTrafficFactSource({ source: 'wing.traffic', data: { periodDays: 7 } })).toBe('wing');
    expect(dailyTrafficFactSource(null)).toBeNull();
    expect(dailyTrafficFactSource({})).toBeNull();
  });

  it('uses the explicit active writer marker', () => {
    expect(dailyTrafficFactSource({
      'traffic.currentSource': 'wing.traffic', 'wing.traffic': { grain: 'listing_option_sum' },
    })).toBe('wing');
    expect(dailyTrafficFactSource({ 'traffic.currentSource': 'unknown' })).toBeNull();
  });

  /** 트래픽 CSV 업로드 lane 은 없다(KID-110, 결정 c) — Wing 이 리스팅-일 트래픽의 유일한 작성자다. */
  it('names Wing as the only writer and reads any other marker as no known writer', () => {
    expect(dailyTrafficFactSource({ 'traffic.currentSource': 'traffic.future_source' })).toBeNull();
    expect(dailyTrafficFactSource({ 'traffic.future_source': { data: {} } })).toBeNull();
    expect(dailyTrafficFactSource({
      'wing.traffic': { grain: 'listing_option_sum' },
      'traffic.future_source': { data: {} },
    })).toBe('wing');
  });

  it('requires account summary evidence on the first daily page', () => {
    const base = {
      kind: 'daily_page' as const,
      key: 'daily:2026-09-01:1',
      capturedAt: '2026-09-08T01:00:00.000Z',
      url: plan.targetUrl,
      providerVendorId: 'A',
      filterScope: 'ALL_NORMAL_RFM' as const,
      businessDate: '2026-09-01',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      period: 1 as const,
      pageIndex: 1,
      proof: {
        expectedPages: 1,
        visitedPages: [1],
        terminalPageObserved: true,
        verified: true,
        complete: true,
      },
      data: [],
    };
    expect(AdTrafficSourceReceiptInputSchema.safeParse(base).success).toBe(false);
    expect(AdTrafficSourceReceiptInputSchema.parse({
      ...base,
      accountSummary,
      accountSummaryRaw: rawSummary,
    })).toMatchObject({ kind: 'daily_page', businessDate: '2026-09-01' });
  });

  it('keeps v2 ACK discriminators and does not echo raw summary evidence', () => {
    const period = {
      kind: 'period_summary' as const,
      key: 'period:2026-09-01:2026-09-03',
      capturedAt: '2026-09-08T01:00:00.000Z',
      url: plan.targetUrl,
      providerVendorId: 'A',
      filterScope: 'ALL_NORMAL_RFM' as const,
      startDate: plan.startDate,
      endDate: plan.endDate,
      period: plan.periodDays,
      accountSummary,
      accountSummaryRaw: rawSummary,
    };
    expect(AdTrafficSourcePeriodReceiptInputSchema.parse(period)).toMatchObject({
      kind: 'period_summary',
      accountSummary,
    });
    const ack = AdTrafficSourceReceiptSchema.parse({
      sequence: 300,
      kind: 'period_summary',
      key: period.key,
      checksum: 'a'.repeat(64),
      providerVendorId: 'A',
      filterScope: 'ALL_NORMAL_RFM',
      capturedAt: period.capturedAt,
      startDate: period.startDate,
      endDate: period.endDate,
      period: period.period,
      rowCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      snapshotIds: [],
      url: period.url,
    });
    expect(ack).toMatchObject({ kind: 'period_summary', capturedAt: period.capturedAt });
    expect('accountSummary' in ack).toBe(false);
  });
});

describe('Wing traffic published wire (KID-119)', () => {
  it('no longer carries the legacy exact-period evidence no reader consumed', () => {
    expect(AdTrafficSourceDailyPublishedSchema.shape).not.toHaveProperty('legacyExactPeriodEvidence');
  });
});

/** v1 페이지 수집기는 운영에서 더 돌지 않는다(KID-232). v1 계획과 v1 모양 영수증은 계약이 거절한다. */
describe('Wing traffic v1 wire is retired (KID-232)', () => {
  const v1Plan = {
    sourceType: 'coupang_wing_traffic',
    parserVersion: 'wing-traffic-v1',
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    expectedAdvertiserId: 'A',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    businessDate: '2026-08-01',
    periodDays: 1,
    targetUrl: null,
  };

  it('refuses a v1 plan', () => {
    expect(AdTrafficSourcePlanSchema.safeParse(v1Plan).success).toBe(false);
  });

  it('refuses a v1 page receipt that carries no daily or period kind', () => {
    expect(AdTrafficSourceReceiptInputSchema.safeParse({
      key: 'legacy:page:1',
      capturedAt: '2026-08-01T01:00:00.000Z',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      period: 1,
      pageIndex: 1,
      proof: { expectedPages: 1, visitedPages: [1], terminalPageObserved: true, verified: true, complete: true },
      data: [],
    }).success).toBe(false);
  });
});
