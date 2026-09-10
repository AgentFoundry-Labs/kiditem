import { describe, expect, it } from 'vitest';
import {
  AdTrafficSourceDailyPlanSchema,
  AdTrafficSourcePeriodReceiptInputSchema,
  AdTrafficSourceReceiptInputSchema,
  AdTrafficSourceReceiptSchema,
  classifyDailyTrafficFact,
} from './ad-traffic-source';

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

  it('accepts only a namespaced Wing daily listing projection for product consumers', () => {
    const sourceAttemptId = '00000000-0000-4000-8000-000000000010';
    expect(classifyDailyTrafficFact({
      'wing.traffic': {
        grain: 'listing_option_sum',
        scope: 'matched_listings',
        periodDays: 1,
        sourceAttemptId,
        businessDate: '2026-09-03',
      },
    }, '2026-09-03')).toBe('wing');
    expect(classifyDailyTrafficFact({
      source: 'wing.traffic',
      data: {
        grain: 'listing_option_sum',
        scope: 'matched_listings',
        periodDays: 3,
        sourceAttemptId,
        businessDate: '2026-09-03',
      },
    }, '2026-09-03')).toBeNull();
    expect(classifyDailyTrafficFact({
      'wing.traffic': {
        periodDays: 1,
        sourceAttemptId,
        businessDate: '2026-09-03',
      },
    }, '2026-09-03')).toBeNull();
  });

  it('keeps explicit CSV uploads independent from Wing account UV', () => {
    expect(classifyDailyTrafficFact({
      'traffic.csv_upload': {
        source: 'traffic_csv_upload',
        data: { fileName: 'traffic.csv' },
      },
    }, '2026-09-03')).toBe('csv_upload');
    expect(classifyDailyTrafficFact({
      'wing.traffic': {
        grain: 'listing_option_sum',
        scope: 'matched_listings',
        periodDays: 1,
        sourceAttemptId: '00000000-0000-4000-8000-000000000010',
        businessDate: '2026-09-02',
      },
    }, '2026-09-03')).toBeNull();
  });

  it('uses the explicit active writer marker when both namespaces are retained', () => {
    const sourceAttemptId = '00000000-0000-4000-8000-000000000010';
    const wing = {
      grain: 'listing_option_sum',
      scope: 'matched_listings',
      periodDays: 1,
      sourceAttemptId,
      businessDate: '2026-09-03',
    };
    const csv = { source: 'traffic_csv_upload', data: { fileName: 'traffic.csv' } };

    expect(classifyDailyTrafficFact({
      'traffic.currentSource': 'traffic.csv_upload',
      'wing.traffic': wing,
      'traffic.csv_upload': csv,
    }, '2026-09-03')).toBe('csv_upload');
    expect(classifyDailyTrafficFact({
      'traffic.currentSource': 'wing.traffic',
      'wing.traffic': wing,
      'traffic.csv_upload': csv,
    }, '2026-09-03')).toBe('wing');
  });

  it('fails closed when retained namespaces have no active-writer marker', () => {
    const sourceAttemptId = '00000000-0000-4000-8000-000000000010';
    expect(classifyDailyTrafficFact({
      'wing.traffic': {
        grain: 'listing_option_sum',
        scope: 'matched_listings',
        periodDays: 1,
        sourceAttemptId,
        businessDate: '2026-09-03',
      },
      'traffic.csv_upload': { source: 'traffic_csv_upload', data: {} },
    }, '2026-09-03')).toBeNull();
    expect(classifyDailyTrafficFact({
      'traffic.currentSource': 'unknown',
      'traffic.csv_upload': { source: 'traffic_csv_upload', data: {} },
    }, '2026-09-03')).toBeNull();
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
