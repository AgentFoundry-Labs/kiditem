import { describe, expect, it } from 'vitest';
import { toAdKeywordSnapshot, toAdProductSnapshot, toAdTrendsData } from '../ad-campaign.mapper';
import type {
  KeywordTargetRollup,
  ProductTargetRollup,
} from '../../application/port/out/repository/ad-campaign.repository.port';

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

describe('toAdTrendsData', () => {
  const window = {
    knownThrough: '2026-09-12',
    from: new Date('2026-09-10T00:00:00.000Z'),
    to: new Date('2026-09-12T00:00:00.000Z'),
  };
  const day = (businessDate: string, spend: number) => ({
    businessDate,
    spend,
    revenue: spend * 3,
    impressions: 100,
    clicks: 10,
    conversions: 1,
    orders: 1,
    conversionsObserved: true,
  });

  // ADR-0006: the summary carries facts only. A reader that wants to name
  // "nothing measured" reads `periodDayCount === 0`.
  it('publishes a window the sweep never measured as zero measured days and no source word', () => {
    const trends = toAdTrendsData({ ...window, days: [], observedAt: null });

    expect(trends.summary).toEqual({
      periodDayCount: 0,
      latestBusinessDate: null,
      observedAt: null,
      metrics: null,
      orders: null,
    });
  });

  it('publishes measured days with their count and no source word', () => {
    const trends = toAdTrendsData({
      ...window,
      days: [day('2026-09-10', 1_000), day('2026-09-12', 500)],
      observedAt: new Date('2026-09-13T00:00:00.000Z'),
    });

    expect(trends.summary).not.toHaveProperty('source');
    expect(trends.summary).toMatchObject({
      periodDayCount: 2,
      latestBusinessDate: '2026-09-12',
      observedAt: '2026-09-13T00:00:00.000Z',
      metrics: { spend: 1_500, revenue: 4_500 },
      orders: 2,
    });
  });
});

function productRollup(overrides: Partial<ProductTargetRollup> = {}): ProductTargetRollup {
  return {
    targetKey: 'account:00000000-0000-4000-8000-000000000001:product:campaign:1::95514044205',
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    campaignIdentity: 'campaign:1',
    campaignId: '1',
    campaignName: '쿠팡윙 집중광고',
    listingId: null,
    listingOptionId: null,
    externalId: null,
    externalOptionId: '95514044205',
    keyword: null,
    status: null,
    onOff: null,
    metaJson: null,
    spend: 3_000,
    revenue: 9_000,
    impressions: 400,
    clicks: 20,
    conversions: 1,
    orders: 1,
    ...overrides,
  };
}

// Since #493 ingest writes target descriptors as `{ source, data }`;
// `keywordRollup` above still carries the older namespaced key.
describe('ledger meta descriptors', () => {
  it('reads an advertised product name, image, link and sale type from the meta data', () => {
    const snapshot = toAdProductSnapshot(productRollup({
      metaJson: {
        source: 'advertising.campaign.target',
        data: {
          productName: '캐릭터 문어발 비눗방울 1p',
          imageUrl: 'https://image.example.com/bubble.jpg',
          productUrl: 'https://www.coupang.com/vp/products/1',
          saleType: '판매자배송',
        },
      },
    }), null, '7d');

    expect(snapshot).toMatchObject({
      productName: '캐릭터 문어발 비눗방울 1p',
      imageUrl: 'https://image.example.com/bubble.jpg',
      productUrl: 'https://www.coupang.com/vp/products/1',
      saleType: '판매자배송',
    });
  });

  it('reads a keyword product name and origin from the meta data', () => {
    const snapshot = toAdKeywordSnapshot(keywordRollup({
      metaJson: {
        source: 'advertising.keyword.target',
        data: { origin: 'registered', productName: '캐릭터 문어발 비눗방울 1p' },
      },
    }), null);

    expect(snapshot).toMatchObject({
      productName: '캐릭터 문어발 비눗방울 1p',
      origin: 'registered',
    });
  });
});
