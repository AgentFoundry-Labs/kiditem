import { describe, expect, it } from 'vitest';
import {
  AdCampaignReportScopeSchema,
  AdCampaignSnapshotSchema,
  AdExtensionReplayIdempotencyKeySchema,
  AdKeywordProductSummarySchema,
  AdKeywordSnapshotSchema,
  AdProductSnapshotSchema,
} from './ads';

describe('AdCampaignReportScopeSchema', () => {
  it('accepts exactly the three producer authority scopes', () => {
    const scopes = [
      'single_campaign_authoritative',
      'single_campaign_metadata_raw',
      'multi_campaign_raw',
    ] as const;

    for (const scope of scopes) {
      expect(AdCampaignReportScopeSchema.parse(scope)).toBe(scope);
    }
    expect(() => AdCampaignReportScopeSchema.parse('future_authoritative'))
      .toThrow();
    expect(() => AdCampaignReportScopeSchema.parse('')).toThrow();
  });
});

describe('advertising campaign identity contracts', () => {
  const metrics = {
    spend: 1,
    impressions: 2,
    clicks: 3,
    conversions: 4,
    revenue: 5,
    ctr: 6,
    roas: 7,
    cvr: 8,
  };

  it('requires account and stable identity on campaign snapshots', () => {
    expect(() => AdCampaignSnapshotSchema.parse({
      listing: null,
      campaignId: null,
      campaignName: '표시명',
      metricsAvailable: true,
      status: null,
      onOff: null,
      period: '7d',
      conversionsAvailable: false,
      metrics,
    })).toThrow();

    expect(AdCampaignSnapshotSchema.parse({
      listing: null,
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      campaignIdentity: 'href:https://advertising.coupang.com/marketing/campaign/1/product',
      campaignId: null,
      campaignName: '표시명',
      metricsAvailable: true,
      status: '운영중',
      onOff: 'ON',
      period: '7d',
      conversionsAvailable: false,
      metrics,
    })).toMatchObject({ campaignIdentity: expect.any(String) });
  });

  it('makes metadata-only campaign metrics explicitly unavailable', () => {
    expect(AdCampaignSnapshotSchema.parse({
      listing: null,
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      campaignIdentity: 'campaign:paused',
      campaignId: 'paused',
      campaignName: '중지 캠페인',
      metricsAvailable: false,
      status: '일시정지',
      onOff: 'OFF',
      period: '14d',
      conversionsAvailable: false,
      metrics: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        ctr: null,
        roas: null,
        cvr: null,
      },
    })).toMatchObject({
      metricsAvailable: false,
      onOff: 'OFF',
    });
  });

  it('exposes nullable identity for legitimate campaign-less product facts', () => {
    expect(AdProductSnapshotSchema.parse({
      listing: null,
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      campaignIdentity: null,
      externalId: 'product-1',
      externalOptionId: null,
      campaignId: null,
      campaignName: null,
      keyword: null,
      status: null,
      onOff: null,
      productName: null,
      imageUrl: null,
      productUrl: null,
      saleType: null,
      period: '7d',
      metrics,
    })).toMatchObject({ campaignIdentity: null });
  });
});

describe('AdExtensionReplayIdempotencyKeySchema', () => {
  it('accepts the bounded authoritative replay key and rejects arbitrary tokens', () => {
    expect(AdExtensionReplayIdempotencyKeySchema.parse(
      'authoritative-rebuild:12345:550e8400-e29b-41d4-a716-446655440000',
    )).toBe('authoritative-rebuild:12345:550e8400-e29b-41d4-a716-446655440000');
    expect(() => AdExtensionReplayIdempotencyKeySchema.parse('manual-replay'))
      .toThrow();
    expect(() => AdExtensionReplayIdempotencyKeySchema.parse(`authoritative-rebuild:1:${'x'.repeat(200)}`))
      .toThrow();
  });
});

describe('keyword conversion availability', () => {
  const metrics = {
    spend: 3_000,
    impressions: 400,
    clicks: 20,
    conversions: 0,
    revenue: 0,
    ctr: 5,
    roas: 0,
    cvr: null,
  };
  const keyword = {
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    campaignIdentity: 'campaign:1',
    campaignId: '1',
    campaignName: '캠페인',
    adGroup: 'group-1',
    keyword: '비눗방울',
    origin: 'smart_targeting',
    status: null,
    onOff: null,
    currentBid: null,
    externalOptionId: '95514044205',
    productName: '비눗방울 세트',
    listing: null,
    period: '7d',
    windowDays: 7,
    businessDate: '2026-09-12',
    metrics,
    relevance: null,
    relevanceReason: null,
  };

  it('requires keyword snapshots to say whether the conversion count was collected', () => {
    // A stored 0 from a table without the conversion column is not a count.
    expect(AdKeywordSnapshotSchema.safeParse(keyword).success).toBe(false);
    expect(AdKeywordSnapshotSchema.parse({ ...keyword, conversionsAvailable: false }))
      .toMatchObject({ conversionsAvailable: false, metrics: { cvr: null } });
  });

  it('requires the keyword product summary to carry the same availability', () => {
    const summary = {
      externalOptionId: '95514044205',
      productName: '비눗방울 세트',
      campaignId: '1',
      campaignName: '캠페인',
      listing: null,
      keywordCount: 1,
      registeredCount: 0,
      smartTargetingCount: 1,
      servingCount: 1,
      irrelevantCount: 0,
      unjudgedCount: 1,
      metrics,
    };
    expect(AdKeywordProductSummarySchema.safeParse(summary).success).toBe(false);
    expect(AdKeywordProductSummarySchema.parse({ ...summary, conversionsAvailable: true }))
      .toMatchObject({ conversionsAvailable: true });
  });
});
