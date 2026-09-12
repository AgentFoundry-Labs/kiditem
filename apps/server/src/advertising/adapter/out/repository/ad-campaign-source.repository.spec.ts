import { describe, expect, it } from 'vitest';
import { validateProductSalesApiDayReceipt } from './ad-campaign-source.repository';

const plan = {
  sourceType: 'coupang_ad_campaign',
  parserVersion: 'ad-campaign-v1',
  captureMode: 'campaign_sweep',
  channelAccountId: '00000000-0000-4000-8000-000000000001',
  expectedAdvertiserId: 'VENDOR-A',
  startDate: '2026-09-07',
  endDate: '2026-09-07',
  businessDates: ['2026-09-07'],
} as const;
const campaign = {
  key: 'camp',
  campaignKey: 'camp',
  campaignId: '123',
  mode: 'daily',
} as const;

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'campaign_day',
    key: 'day:camp:2026-09-07',
    campaignKey: 'camp',
    advertiserId: 'VENDOR-A',
    capturedAt: '2026-09-07T15:00:00.000Z',
    businessDate: '2026-09-07',
    payload: {
      type: 'ad_campaign',
      source: 'advertising',
      campaignName: 'Manual campaign',
      campaignReportScope: 'single_campaign_authoritative',
      startDate: '2026-09-07',
      endDate: '2026-09-07',
      kpis: {},
      url: 'https://advertising.coupang.com/marketing/dashboard/sales/campaign/123/group/456/product',
      timestamp: '2026-09-07T15:00:00.000Z',
      data: [{
        source: 'coupang', sourceApi: '/marketing/cmg-api/tableMetric', tableType: 'product_sales',
        campaignId: '123', adGroupId: '456', adId: '101', responseKey: '101', vendorItemId: '1001', creativeId: null,
        request: {
          campaignIds: ['123'], adGroupId: '456', creativeId: null,
          start: Date.parse('2026-09-07T00:00:00+09:00'), end: Date.parse('2026-09-07T00:00:00+09:00'),
          tableType: 'product_sales', targetList: ['101'], isMatchTypeEnabled: false,
        },
        metrics: {
          deliveredAdCost: 0, adAttributedSales: 20, impressions: 100,
          clicks: 3, adAttributedUnits: 1, adAttributedOrders: 1,
        },
      }],
      normalizedRows: [{
        pageType: 'product', campaignId: '123', campaignIdentity: 'campaign:123',
        adGroupId: '456', adId: '101', vendorItemId: '1001', adSelectionType: 'MANUAL_SELECTION',
        runningAdSpend: 0, spend: 0, adSpend: 0, revenue: 20, adRevenue: 20, impressions: 100, clicks: 3,
        conversions: 1, orders: 1,
        _observedMetrics: { adSpend: true, adRevenue: true, impressions: true, clicks: true, conversions: true, orders: true },
      }],
    },
    proof: {
      kind: 'product_sales_api', campaignId: '123', adGroupId: '456', businessDate: '2026-09-07',
      start: Date.parse('2026-09-07T00:00:00+09:00'), end: Date.parse('2026-09-07T00:00:00+09:00'),
      tableType: 'product_sales', creativeId: null, isMatchTypeEnabled: false,
      expectedGroupIds: ['456'], totalAdCount: 1,
      expectedAds: [{ adId: '101', vendorItemId: '1001' }], observedAdIds: ['101'],
      complete: true, explicitEmpty: false,
    },
    ...overrides,
  } as any;
}

describe('manual product_sales campaign-day proof', () => {
  it('accepts one exact API row with explicit zero metrics', () => {
    expect(validateProductSalesApiDayReceipt(plan as any, receipt(), campaign as any)).toBeNull();
  });

  it('rejects a stale date, route mismatch, incomplete group roster, or missing metric evidence', () => {
    expect(validateProductSalesApiDayReceipt(plan as any, receipt({ businessDate: '2026-09-06' }), campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');
    expect(validateProductSalesApiDayReceipt(plan as any, receipt({ proof: { ...receipt().proof, adGroupId: '999', expectedGroupIds: ['999'] } }), campaign as any)).toBe('CAMPAIGN_IDENTITY_MISMATCH');
    expect(validateProductSalesApiDayReceipt(plan as any, receipt({ proof: { ...receipt().proof, expectedGroupIds: ['456', '999'] } }), campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');
    const malformed = receipt();
    malformed.payload.normalizedRows[0]._observedMetrics.orders = false;
    expect(validateProductSalesApiDayReceipt(plan as any, malformed, campaign as any)).toBe('INVALID_CAMPAIGN_REPORT');
  });

  it('rejects aggregate KPI leakage and extra/missing ad identities', () => {
    expect(validateProductSalesApiDayReceipt(plan as any, receipt({ payload: { ...receipt().payload, kpis: { 매출: 20 } } }), campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');
    expect(validateProductSalesApiDayReceipt(plan as any, receipt({ proof: { ...receipt().proof, observedAdIds: [] } }), campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');
    expect(validateProductSalesApiDayReceipt(plan as any, receipt({ payload: { ...receipt().payload, data: [] } }), campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');
  });

  it('rejects raw metric tampering, alias drift, duplicate raw ids, and non-manual rows', () => {
    const rawMetricTamper = receipt();
    rawMetricTamper.payload.data[0].metrics.adAttributedSales = 21;
    expect(validateProductSalesApiDayReceipt(plan as any, rawMetricTamper, campaign as any)).toBe('INVALID_CAMPAIGN_REPORT');

    const aliasDrift = receipt();
    aliasDrift.payload.normalizedRows[0].adRevenue = 21;
    expect(validateProductSalesApiDayReceipt(plan as any, aliasDrift, campaign as any)).toBe('INVALID_CAMPAIGN_REPORT');

    const duplicateRaw = receipt();
    duplicateRaw.payload.data.push({ ...duplicateRaw.payload.data[0] });
    expect(validateProductSalesApiDayReceipt(plan as any, duplicateRaw, campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');

    const autoRow = receipt();
    autoRow.payload.normalizedRows[0].adSelectionType = 'AUTO_SELECTION';
    expect(validateProductSalesApiDayReceipt(plan as any, autoRow, campaign as any)).toBe('INVALID_CAMPAIGN_REPORT');
  });

  it('rejects foreign, credentialed, ported, or non-exact report URLs', () => {
    for (const url of [
      'https://evil.example/marketing/dashboard/sales/campaign/123/group/456/product',
      'https://user:pass@advertising.coupang.com/marketing/dashboard/sales/campaign/123/group/456/product',
      'https://advertising.coupang.com:443/marketing/dashboard/sales/campaign/123/group/456/product',
      'https://advertising.coupang.com/marketing/campaign/123/group/456/product',
      'https://advertising.coupang.com/marketing/dashboard/sales/campaign/123/group/456/other',
    ]) {
      expect(validateProductSalesApiDayReceipt(plan as any, receipt({ payload: { ...receipt().payload, url } }), campaign as any)).toBe('CAMPAIGN_IDENTITY_MISMATCH');
    }
  });

  it('rejects booleans, objects, exponent ids, and non-canonical metric strings', () => {
    const badId = receipt();
    badId.payload.data[0].adId = true;
    expect(validateProductSalesApiDayReceipt(plan as any, badId, campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');

    const badMetric = receipt();
    badMetric.payload.data[0].metrics.clicks = '1e2';
    expect(validateProductSalesApiDayReceipt(plan as any, badMetric, campaign as any)).toBe('INVALID_CAMPAIGN_REPORT');

    const badRequestId = receipt();
    badRequestId.payload.data[0].request.targetList = [{ value: '101' }];
    expect(validateProductSalesApiDayReceipt(plan as any, badRequestId, campaign as any)).toBe('INCOMPLETE_CAMPAIGN_DAY');
  });
});
