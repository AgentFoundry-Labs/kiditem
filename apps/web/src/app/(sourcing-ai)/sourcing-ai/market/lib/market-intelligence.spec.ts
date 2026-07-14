import { describe, expect, it } from 'vitest';
import {
  filterTrendOpportunities,
  rankTrendOpportunitiesForChannel,
  rankMovement,
  trendOpportunities,
  visibilityShare,
  type RankTrackingRow,
} from './market-intelligence';

describe('market intelligence helpers', () => {
  it('defines a complete ordered top 20 trend snapshot', () => {
    expect(trendOpportunities).toHaveLength(20);
    expect(new Set(trendOpportunities.map((opportunity) => opportunity.id)).size).toBe(20);
    expect(trendOpportunities.map((opportunity) => opportunity.trendRank)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(trendOpportunities.find((opportunity) => opportunity.id === 'keycap-keyring')?.monthlySearches).toBeNull();
  });

  it('filters opportunities by category and searchable evidence', () => {
    const stationery = filterTrendOpportunities(trendOpportunities, 'stationery', '중국');

    expect(stationery.map((opportunity) => opportunity.id)).toEqual(['perler-beads']);
  });

  it('creates independent SNS and China rankings with channel-only evidence', () => {
    const social = rankTrendOpportunitiesForChannel(trendOpportunities, 'social');
    const china = rankTrendOpportunitiesForChannel(trendOpportunities, 'china');

    expect(social.map((row) => row.channelRank)).toEqual(
      Array.from({ length: social.length }, (_, index) => index + 1),
    );
    expect(social.every((row) => (
      row.channelSources.every((source) => source === 'INSTAGRAM' || source === 'YOUTUBE')
    ))).toBe(true);
    expect(social.some((row) => row.opportunity.id === 'keycap-keyring')).toBe(true);

    expect(china.map((row) => row.channelRank)).toEqual(
      Array.from({ length: china.length }, (_, index) => index + 1),
    );
    expect(china.every((row) => (
      row.channelSources.every((source) => source === 'DOUYIN' || source === '1688')
    ))).toBe(true);
    expect(china.some((row) => row.opportunity.id === 'perler-beads')).toBe(true);
  });

  it('treats a lower current rank as positive movement', () => {
    expect(rankMovement(18, 31)).toBe(13);
    expect(rankMovement(42, 35)).toBe(-7);
  });

  it('calculates the share of tracked rows visible in the threshold', () => {
    const rows = [
      buildRankRow('top-10', 10),
      buildRankRow('top-20', 20),
      buildRankRow('outside', 21),
    ];

    expect(visibilityShare(rows)).toBeCloseTo(66.67, 1);
    expect(visibilityShare([])).toBe(0);
  });
});

function buildRankRow(id: string, organicRank: number): RankTrackingRow {
  return {
    id,
    keyword: id,
    productName: id,
    sku: id,
    organicRank,
    previousRank: organicRank,
    sponsoredRank: null,
    conversionRate: 0,
    views: 0,
    sales: 0,
    status: 'steady',
    history: [organicRank],
  };
}
