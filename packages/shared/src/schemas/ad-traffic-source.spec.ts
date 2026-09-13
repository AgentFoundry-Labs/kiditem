import { describe, expect, it } from 'vitest';
import {
  AdTrafficSourceDailyPlanSchema,
  AdTrafficSourcePeriodReceiptInputSchema,
  AdTrafficSourceReceiptInputSchema,
  AdTrafficSourceReceiptSchema,
  adTrafficReconciliationStatus,
  dailyTrafficFactSource,
} from './ad-traffic-source';

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
    expect(dailyTrafficFactSource({
      'traffic.csv_upload': { source: 'traffic_csv_upload', data: { fileName: 'traffic.csv' } },
    })).toBe('csv_upload');
    expect(dailyTrafficFactSource(null)).toBeNull();
    expect(dailyTrafficFactSource({})).toBeNull();
  });

  it('uses the explicit active writer marker when both namespaces are retained', () => {
    const wing = { grain: 'listing_option_sum' };
    const csv = { source: 'traffic_csv_upload', data: { fileName: 'traffic.csv' } };
    expect(dailyTrafficFactSource({
      'traffic.currentSource': 'traffic.csv_upload', 'wing.traffic': wing, 'traffic.csv_upload': csv,
    })).toBe('csv_upload');
    expect(dailyTrafficFactSource({
      'traffic.currentSource': 'wing.traffic', 'wing.traffic': wing, 'traffic.csv_upload': csv,
    })).toBe('wing');
  });

  it('names no writer when retained namespaces have no marker or the marker is unknown', () => {
    expect(dailyTrafficFactSource({
      'wing.traffic': { grain: 'listing_option_sum' },
      'traffic.csv_upload': { source: 'traffic_csv_upload', data: {} },
    })).toBeNull();
    expect(dailyTrafficFactSource({
      'traffic.currentSource': 'unknown',
      'traffic.csv_upload': { source: 'traffic_csv_upload', data: {} },
    })).toBeNull();
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
