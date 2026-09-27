import { describe, expect, it } from 'vitest';
import {
  adCampaignIdentity,
  campaignIdOfIdentity,
  toAdKeywordSnapshot,
  toAdProductSnapshot,
  toAdTrendsData,
} from '../ad-campaign.mapper';
import type {
  AdKeywordWindowRollup,
  AdProductWindowRollup,
} from '../../application/port/out/repository/ad-ledger-read.repository.port';
import type { ScopedAdListingReadModel } from '../../application/port/out/repository/ad-listing.repository.port';

const ACCOUNT = '00000000-0000-4000-8000-000000000001';

function keywordRollup(overrides: Partial<AdKeywordWindowRollup> = {}): AdKeywordWindowRollup {
  return {
    channelAccountId: ACCOUNT,
    campaignId: '104640375',
    campaignName: '쿠팡윙 집중광고',
    adGroupId: 'G1',
    vendorItemId: '95514044205',
    keyword: '비눗방울',
    nonSearch: false,
    listingId: null,
    optionName: '캐릭터 문어발 비눗방울 1p',
    days: 3,
    lastDate: '2026-09-12',
    spend: 3_000,
    revenue: 0,
    impressions: 400,
    clicks: 20,
    orders: 0,
    units: 0,
    ...overrides,
  };
}

function productRollup(overrides: Partial<AdProductWindowRollup> = {}): AdProductWindowRollup {
  return {
    channelAccountId: ACCOUNT,
    campaignId: '104640375',
    campaignName: '쿠팡윙 집중광고',
    adGroupId: 'G1',
    vendorItemId: '95514044205',
    listingId: 'listing-1',
    optionName: null,
    isActive: true,
    status: 'APPROVED',
    days: 2,
    spend: 3_000,
    billedSpend: 2_500,
    revenue: 9_000,
    impressions: 400,
    clicks: 20,
    orders: 1,
    units: 1,
    ...overrides,
  };
}

const listing: ScopedAdListingReadModel = {
  id: 'listing-1',
  externalId: '15000001',
  channelName: '문어발 비눗방울',
  masterProduct: { id: 'master-1', code: 'M-1', name: '마스터 비눗방울', abcGrade: 'A' },
};

describe('campaign identity round trip', () => {
  it('issues campaign:<id> and reads back only that shape', () => {
    expect(adCampaignIdentity('104640375')).toBe('campaign:104640375');
    expect(campaignIdOfIdentity('campaign:104640375')).toBe('104640375');
    expect(campaignIdOfIdentity('href:https://advertising.coupang.com/marketing/campaign/1')).toBeNull();
    expect(campaignIdOfIdentity('campaign:')).toBeNull();
  });
});

describe('toAdProductSnapshot', () => {
  it('publishes delivered spend and orders, the catalog listing number, and no product URL', () => {
    const snapshot = toAdProductSnapshot(productRollup(), listing, '7d');
    expect(snapshot).toMatchObject({
      campaignIdentity: 'campaign:104640375',
      externalId: '15000001',
      externalOptionId: '95514044205',
      productName: '문어발 비눗방울',
      onOff: 'ON',
      productUrl: null,
      imageUrl: null,
      metrics: { spend: 3_000, conversions: 1, cvr: 5 },
    });
  });

  it('names the product by its report option first and leaves the listing number empty without a listing', () => {
    const snapshot = toAdProductSnapshot(productRollup({ optionName: '파랑 1개', isActive: null }), null, '7d');
    expect(snapshot).toMatchObject({ productName: '파랑 1개', externalId: null, onOff: null, listing: null });
  });
});

describe('toAdKeywordSnapshot', () => {
  it('publishes the period, the measured days it had rows on and orders as conversions', () => {
    const snapshot = toAdKeywordSnapshot(keywordRollup(), null, null, '14d');
    expect(snapshot).toMatchObject({
      period: '14d',
      windowDays: 3,
      businessDate: '2026-09-12',
      nonSearch: false,
      adGroup: 'G1',
      productName: '캐릭터 문어발 비눗방울 1p',
      metrics: { clicks: 20, conversions: 0, cvr: 0 },
    });
  });

  it('marks the non-search row', () => {
    expect(toAdKeywordSnapshot(keywordRollup({ keyword: '', nonSearch: true }), null, null, '7d'))
      .toMatchObject({ keyword: '', nonSearch: true });
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
    orders: 1,
  });

  // ADR-0006: the summary carries facts only. A reader that wants to name
  // "nothing measured" reads `periodDayCount === 0`.
  it('publishes a window no ad report measured as zero measured days and no source word', () => {
    const trends = toAdTrendsData({ ...window, days: [], observedAt: null });

    expect(trends.summary).toEqual({
      periodDayCount: 0,
      latestBusinessDate: null,
      observedAt: null,
      metrics: null,
      orders: null,
    });
  });

  it('publishes measured days with their count, holes for the rest, and orders as conversions', () => {
    const trends = toAdTrendsData({
      ...window,
      days: [day('2026-09-10', 1_000), day('2026-09-12', 500)],
      observedAt: new Date('2026-09-13T00:00:00.000Z'),
    });

    expect(trends.daily[1]).toEqual({ date: '2026-09-11', metrics: null, orders: null });
    expect(trends.summary).not.toHaveProperty('source');
    expect(trends.summary).toMatchObject({
      periodDayCount: 2,
      latestBusinessDate: '2026-09-12',
      observedAt: '2026-09-13T00:00:00.000Z',
      metrics: { spend: 1_500, revenue: 4_500, conversions: 2, cvr: 10 },
      orders: 2,
    });
  });
});
