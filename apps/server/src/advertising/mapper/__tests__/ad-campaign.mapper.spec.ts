import { describe, expect, it } from 'vitest';
import { toAdKeywordSnapshot } from '../ad-campaign.mapper';
import type { KeywordTargetRollup } from '../../application/port/out/repository/ad-campaign.repository.port';

function keywordRollup(overrides: Partial<KeywordTargetRollup> = {}): KeywordTargetRollup {
  return {
    targetKey: 'account:00000000-0000-4000-8000-000000000001:keyword:campaign:1::비눗방울',
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    campaignIdentity: 'campaign:1',
    campaignId: '1',
    campaignName: '쿠팡윙 집중광고',
    adGroup: 'group-1',
    keyword: '비눗방울',
    listingId: null,
    listingOptionId: null,
    externalOptionId: '95514044205',
    status: null,
    onOff: null,
    currentBid: null,
    metaJson: {
      'advertising.keyword.target': {
        origin: 'smart_targeting',
        productName: '캐릭터 문어발 비눗방울 1p',
      },
    },
    lastObservedAt: new Date('2026-09-12T03:00:00.000Z'),
    businessDate: new Date('2026-09-12T00:00:00.000Z'),
    windowDays: 7,
    spend: 3_000,
    revenue: 0,
    impressions: 400,
    clicks: 20,
    conversions: 0,
    orders: 0,
    conversionsObserved: true,
    ...overrides,
  };
}

describe('toAdKeywordSnapshot', () => {
  it('publishes an observed zero conversion count as a measured zero CVR', () => {
    const snapshot = toAdKeywordSnapshot(keywordRollup(), null);

    expect(snapshot.conversionsAvailable).toBe(true);
    expect(snapshot.metrics).toMatchObject({ clicks: 20, conversions: 0, cvr: 0 });
  });

  it('marks an unobserved conversion column unavailable and publishes no CVR', () => {
    // The keyword table lacked the conversion column; ingest stored 0.
    const snapshot = toAdKeywordSnapshot(
      keywordRollup({ conversionsObserved: false }),
      null,
    );

    expect(snapshot.conversionsAvailable).toBe(false);
    expect(snapshot.metrics.cvr).toBeNull();
    // Measured additive metrics stay published.
    expect(snapshot.metrics).toMatchObject({ spend: 3_000, impressions: 400, clicks: 20 });
  });
});
