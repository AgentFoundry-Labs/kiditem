import { describe, expect, it } from 'vitest';
import {
  mergeKeywordTargets,
  type KeywordTargetMergeFields,
} from '../ad-keyword-target-merge';

type PublishedKeywordRow = {
  id: string;
  targetKey: string;
  windowDays: 7;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  adSpend: number;
  adRevenue: number;
  status: string | null;
  onOff: string | null;
  currentBid: number | null;
  campaignName: string | null;
  externalOptionId: string | null;
  listingId: string | null;
  listingOptionId: string | null;
};

function row(overrides: Partial<PublishedKeywordRow> = {}): PublishedKeywordRow {
  return {
    id: 'row-1',
    targetKey: 'account:a:keyword:1:group:버블문어',
    windowDays: 7,
    spend: 100,
    revenue: 1_000,
    impressions: 3,
    clicks: 1,
    conversions: 1,
    orders: 1,
    adSpend: 100,
    adRevenue: 1_000,
    status: null,
    onOff: null,
    currentBid: null,
    campaignName: null,
    externalOptionId: '95514044205',
    listingId: 'listing-1',
    listingOptionId: 'listing-option-1',
    ...overrides,
  };
}

describe('mergeKeywordTargets', () => {
  it('sums the additive metrics and keeps the earlier row for everything else', () => {
    const merged = mergeKeywordTargets(
      row(),
      row({
        id: 'row-2',
        spend: 250,
        revenue: 500,
        impressions: 5,
        clicks: 2,
        conversions: 0,
        orders: 2,
        adSpend: 250,
        adRevenue: 500,
      }),
    );

    expect(merged).toEqual(row({
      spend: 350,
      revenue: 1_500,
      impressions: 8,
      clicks: 3,
      conversions: 1,
      orders: 3,
      adSpend: 350,
      adRevenue: 1_500,
    }));
  });

  it('counts an absent metric as zero', () => {
    type SparseRow = KeywordTargetMergeFields & { targetKey: string };
    const merged = mergeKeywordTargets<SparseRow>(
      { targetKey: 'k', spend: 40, clicks: null },
      { targetKey: 'k', impressions: 6 },
    );

    expect(merged).toMatchObject({
      targetKey: 'k',
      spend: 40,
      revenue: 0,
      impressions: 6,
      clicks: 0,
      conversions: 0,
      orders: 0,
      adSpend: 0,
      adRevenue: 0,
    });
  });

  it('lets a later row fill only the descriptors the earlier row left empty', () => {
    const merged = mergeKeywordTargets(
      row({ status: 'ACTIVE', currentBid: null, campaignName: '집중광고', onOff: null }),
      row({ status: 'PAUSED', currentBid: 90, campaignName: '다른 캠페인', onOff: 'ON' }),
    );

    expect(merged).toMatchObject({
      status: 'ACTIVE',
      currentBid: 90,
      campaignName: '집중광고',
      onOff: 'ON',
    });
  });

  it('drops the option link when the rows advertise different options', () => {
    expect(mergeKeywordTargets(
      row(),
      row({ externalOptionId: '95514078596', listingId: 'listing-2', listingOptionId: 'option-2' }),
    )).toMatchObject({
      externalOptionId: null,
      listingId: null,
      listingOptionId: null,
    });
    expect(mergeKeywordTargets(row(), row({ id: 'row-2' }))).toMatchObject({
      externalOptionId: '95514044205',
      listingId: 'listing-1',
      listingOptionId: 'listing-option-1',
    });
  });
});
