import { describe, expect, it } from 'vitest';
import {
  AdCampaignReportScopeSchema,
  AdCampaignSnapshotSchema,
  AdExtensionReplayIdempotencyKeySchema,
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
      period: '7d',
      conversionsAvailable: false,
      metrics,
    })).toMatchObject({ campaignIdentity: expect.any(String) });
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
