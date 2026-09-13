import { describe, expect, it } from 'vitest';
import {
  mergeKeywordTargets,
  normalizeAdKeywordTarget,
} from '../ad-keyword-normalizer';
import type { ListingMap } from '../../../domain/listing-match';

const map: ListingMap = {
  channelAccountId: 'channel-account-1',
  externalOptionIdMap: new Map([
    [
      '95514044205',
      {
        listingId: 'listing-1',
        listingOptionId: 'listing-option-1',
        externalId: 'seller-product-1',
      },
    ],
  ]),
  externalIdMap: new Map(),
};

function keywordRow(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: '104640375',
    campaignName: '쿠팡윙 집중광고',
    adGroup: 'MBTI젤리',
    adId: '541920849',
    externalOptionId: '95514044205',
    productName: '캐릭터 문어발 비눗방울 1p',
    keyword: '버블문어',
    origin: 'smart_targeting',
    impressions: 3,
    clicks: 0,
    spend: 0,
    revenue: 0,
    conversions: 0,
    orders: 0,
    ...overrides,
  };
}

function target(overrides: Record<string, unknown> = {}) {
  return normalizeAdKeywordTarget(keywordRow(overrides), {
    organizationId: 'org-1',
    map,
    businessDate: new Date('2026-07-30T00:00:00.000Z'),
    windowDays: 7,
    campaignName: '쿠팡윙 집중광고',
  });
}

describe('ad-keyword-normalizer', () => {
  it('normalizes keyword target identity and preserves observation width', () => {
    const normalized = target();

    expect(normalized).toMatchObject({
      targetType: 'keyword',
      targetKey: 'account:channel-account-1:keyword:104640375:MBTI젤리:버블문어',
      keyword: '버블문어',
      impressions: 3,
      listingOptionId: 'listing-option-1',
      metaJson: {
        data: { origin: 'smart_targeting', adId: '541920849', windowDays: 7 },
      },
    });
  });

  it('rejects a keyword-column control label without creating a target', () => {
    expect(target({ keyword: '키워드 보기' })).toBeNull();
  });

  it('sums shared keyword metrics and drops an ambiguous option link', () => {
    const first = target({ impressions: 3, clicks: 1, spend: 100 });
    const second = target({
      externalOptionId: '95514078596',
      impressions: 5,
      clicks: 2,
      spend: 250,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const merged = mergeKeywordTargets(first!, second!);

    expect(merged).toMatchObject({
      impressions: 8,
      clicks: 3,
      spend: 350,
      adSpend: 350,
      externalOptionId: null,
      listingId: null,
      listingOptionId: null,
    });
  });

  it('requires a stable campaign identity for a keyword target', () => {
    expect(() => target({ campaignId: undefined })).toThrow(
      'buildAdTargetKey: keyword target requires a stable campaign identity and keyword',
    );
  });
});
