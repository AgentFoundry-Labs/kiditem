import { describe, expect, it } from 'vitest';
import {
  AdCampaignSourceBeginSchema,
  AdCampaignSourceReceiptInputSchema,
} from './ad-campaign-source';

describe('campaign source wire', () => {
  it('admits only optional account selection, never client dates or organization', () => {
    expect(AdCampaignSourceBeginSchema.parse({})).toEqual({});
    expect(AdCampaignSourceBeginSchema.safeParse({ startDate: '2026-09-01' }).success).toBe(false);
    expect(AdCampaignSourceBeginSchema.safeParse({ organizationId: 'other' }).success).toBe(false);
  });
  it('freezes a displayed seven-day or exact-day manual report scope', () => {
    expect(AdCampaignSourceBeginSchema.parse({
      captureMode: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      targetUrl: 'https://advertising.coupang.com/marketing/dashboard/sales',
    })).toMatchObject({ captureMode: 'manual_report', period: '7d' });
    expect(AdCampaignSourceBeginSchema.safeParse({
      captureMode: 'manual_report',
      period: '1d',
      startDate: '2026-09-05',
      endDate: '2026-09-05',
      targetUrl: 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-05',
      extra: true,
    }).success).toBe(false);
  });
  it('keeps provider-observed empty dashboard evidence without synthesizing pagination or identity', () => {
    const empty = {
      kind: 'dashboard_page',
      key: 'dashboard:1',
      advertiserId: null,
      capturedAt: new Date(),
      pageIndex: 1,
      totalPages: 0,
      verified: false,
      explicitEmpty: true,
      campaigns: [],
    };
    expect(AdCampaignSourceReceiptInputSchema.parse(empty)).toMatchObject({
      advertiserId: null,
      verified: false,
      totalPages: 0,
    });
    const { explicitEmpty: _proof, ...missing } = empty;
    expect(AdCampaignSourceReceiptInputSchema.safeParse(missing).success).toBe(false);
  });
  it('does not turn incomplete campaign-day pagination into success at the wire boundary', () => {
    const date = '2026-09-05';
    const receipt = {
      kind: 'campaign_day',
      key: `day:campaign:${date}`,
      campaignKey: 'campaign',
      advertiserId: 'A',
      capturedAt: new Date(),
      businessDate: date,
      payload: {
        data: [],
        normalizedRows: [],
        campaignName: 'Campaign',
        campaignReportScope: 'single_campaign_authoritative',
        timestamp: new Date(),
      },
      proof: {
        dateApplied: false,
        complete: false,
        explicitEmpty: false,
        expectedPages: 8,
        visitedPages: [1, 2],
      },
    };
    expect(AdCampaignSourceReceiptInputSchema.parse(receipt)).toMatchObject({
      proof: receipt.proof,
    });
  });
  it('admits a strict product_sales API proof alongside the legacy DOM proof', () => {
    const date = '2026-09-05';
    const receipt = {
      kind: 'campaign_day',
      key: `day:campaign:${date}`,
      campaignKey: 'campaign',
      advertiserId: 'A',
      capturedAt: new Date(),
      businessDate: date,
      payload: {
        data: [{ adId: '101', responseKey: '101', vendorItemId: '202' }],
        normalizedRows: [{ adId: '101', vendorItemId: '202' }],
        campaignName: 'Campaign',
        campaignReportScope: 'single_campaign_authoritative',
        startDate: date,
        endDate: date,
        kpis: {},
        timestamp: new Date(),
      },
      proof: {
        kind: 'product_sales_api',
        campaignId: '123',
        adGroupId: '456',
        businessDate: date,
        start: Date.parse(`${date}T00:00:00+09:00`),
        end: Date.parse(`${date}T00:00:00+09:00`),
        tableType: 'product_sales',
        creativeId: null,
        isMatchTypeEnabled: false,
        expectedGroupIds: ['456'],
        totalAdCount: 1,
        expectedAds: [{ adId: '101', vendorItemId: '202' }],
        observedAdIds: ['101'],
        complete: true,
        explicitEmpty: false,
      },
    };
    expect(AdCampaignSourceReceiptInputSchema.parse(receipt).proof).toMatchObject({
      kind: 'product_sales_api',
      expectedGroupIds: ['456'],
      totalAdCount: 1,
    });
    expect(AdCampaignSourceReceiptInputSchema.safeParse({
      ...receipt,
      proof: { ...receipt.proof, totalAdCount: 0 },
    }).success).toBe(false);
  });
  it('keeps one manual report receipt scoped to its frozen period and URL', () => {
    const receipt = {
      kind: 'manual_report',
      key: 'manual_report:7d:2026-08-30:2026-09-05',
      advertiserId: 'A',
      capturedAt: new Date(),
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
      payload: {
        data: [],
        normalizedRows: [],
        campaignName: '_전체',
        startDate: '2026-08-30',
        endDate: '2026-09-05',
        timestamp: new Date(),
        url: 'https://advertising.coupang.com/marketing/dashboard/sales',
      },
    };
    expect(AdCampaignSourceReceiptInputSchema.parse(receipt)).toMatchObject({
      kind: 'manual_report',
      period: '7d',
      startDate: '2026-08-30',
      endDate: '2026-09-05',
    });
  });
});
