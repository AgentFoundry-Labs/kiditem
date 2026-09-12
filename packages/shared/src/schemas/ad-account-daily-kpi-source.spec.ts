import { describe, expect, it } from 'vitest';
import {
  AdAccountDailyKpiLegacySourceReceiptInputSchema,
  AdAccountDailyKpiSourceReceiptInputSchema,
  AdAccountDailyKpiSourceReceiptWireSchema,
} from './ad-account-daily-kpi-source';

const base = {
  businessDate: '2026-09-07',
  observedAt: '2026-09-08T01:00:00.000+00:00',
  providerAdvertiserId: 'VENDOR-A',
  rawJson: { data: [] },
};

const normalized = {
  date: base.businessDate,
  adSpend: 0,
  adRevenue: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  orders: 0,
  roas: null,
  ctr: null,
  conversionRate: null,
  rowCount: 0,
};

describe('ad account daily KPI receipt wire compatibility', () => {
  it('requires additive observed evidence on the new receipt shape', () => {
    const result = AdAccountDailyKpiSourceReceiptInputSchema.safeParse({
      ...base,
      normalized,
    });
    expect(result.success).toBe(false);
  });

  it('accepts explicit zero and nullable provider ratios with v2 evidence', () => {
    const result = AdAccountDailyKpiSourceReceiptInputSchema.safeParse({
      ...base,
      normalized: {
        ...normalized,
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('keeps legacy v1 receipts readable without turning unknown evidence into proof', () => {
    const result = AdAccountDailyKpiLegacySourceReceiptInputSchema.safeParse({
      ...base,
      normalized,
    });
    expect(result.success).toBe(true);
    expect(AdAccountDailyKpiSourceReceiptWireSchema.safeParse({
      ...base,
      normalized,
    }).success).toBe(true);
  });

  it('rejects impossible calendar dates instead of validating format only', () => {
    const result = AdAccountDailyKpiSourceReceiptInputSchema.safeParse({
      ...base,
      businessDate: '2026-02-31',
      normalized: {
        ...normalized,
        date: '2026-02-31',
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
