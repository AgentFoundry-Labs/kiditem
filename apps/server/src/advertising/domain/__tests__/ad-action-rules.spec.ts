import { describe, it, expect } from 'vitest';

import {
  createActionCandidate,
  type ChannelSkuAdEvidence,
} from '../ad-action-rules';
import type { AdRuleTarget } from '../../application/port/out/repository/ad-action.repository.port';

/**
 * Pure decision logic for the `AdAction` rules over the ad report ledger
 * (KID-372). A rule reads one campaign (current `ChannelAdCampaign` state and
 * the recent measured window's product sums) or one keyword (its recent
 * window sums) and the exact component-derived ChannelSku capacity per
 * advertised option (`vendorItemId`). There is no bid rule: the ledger carries
 * no bid. `budget` is assumed to be KRW per day (unit not yet confirmed,
 * KID-371).
 */

function campaign(overrides: Partial<AdRuleTarget> = {}): AdRuleTarget {
  return {
    targetType: 'campaign',
    channelAccountId: 'ACC-1',
    campaignId: 'CMP-1',
    campaignName: 'C1',
    adGroupId: null,
    keyword: null,
    vendorItemId: null,
    vendorItemIds: ['VI-1'],
    listingIds: ['L1'],
    listingId: 'L1',
    listingChannel: 'coupang',
    productName: '상품1',
    isActive: true,
    budget: 10_000,
    spend: 5_000,
    revenue: 10_000,
    impressions: 100,
    clicks: 10,
    orders: 2,
    abcGrade: 'B',
    businessDate: '2026-09-20',
    measuredDays: 14,
    ...overrides,
  };
}

function keyword(overrides: Partial<AdRuleTarget> = {}): AdRuleTarget {
  return campaign({
    targetType: 'keyword',
    adGroupId: 'G1',
    keyword: '물총',
    vendorItemId: 'VI-1',
    vendorItemIds: ['VI-1'],
    budget: null,
    ...overrides,
  });
}

const stock = (entries: Array<[string, number | null]>) =>
  new Map<string, ChannelSkuAdEvidence>(entries.map(([id, sellableStock]) => [id, { sellableStock }]));

describe('createActionCandidate over the ad report ledger', () => {
  describe('Rule 1: advertised options all sold out → budget cut (budget assumed KRW/day)', () => {
    it('fires urgent with proposed 3000 when every advertised option has sellable stock 0', () => {
      const candidate = createActionCandidate(campaign({ vendorItemIds: ['VI-1', 'VI-2'] }), stock([['VI-1', 0], ['VI-2', 0]]));
      expect(candidate).toMatchObject({
        actionType: 'change_daily_budget',
        targetType: 'campaign',
        externalId: 'CMP-1',
        priority: 'urgent',
        currentValue: 10_000,
        proposedValue: 3000,
        payload: { adTarget: { campaignId: 'CMP-1', adGroupId: null, vendorItemId: null, businessDate: '2026-09-20', source: 'ad_report' } },
      });
      expect(candidate).not.toHaveProperty('adTargetDailyId');
    });

    it('does not fire while one advertised option still has stock or its capacity is unknown', () => {
      expect(createActionCandidate(campaign({ vendorItemIds: ['VI-1', 'VI-2'] }), stock([['VI-1', 0], ['VI-2', 3]]))?.priority).not.toBe('urgent');
      expect(createActionCandidate(campaign(), stock([['VI-1', null]]))?.priority).not.toBe('urgent');
      expect(createActionCandidate(campaign(), new Map())?.priority).not.toBe('urgent');
    });

    it('skips a paused campaign', () => {
      expect(createActionCandidate(campaign({ isActive: false }), stock([['VI-1', 0]]))).toBeNull();
    });
  });

  describe('Rule 2: keyword pause', () => {
    it('zero orders + spend>=5000 → pause_keyword urgent on the advertised option', () => {
      const candidate = createActionCandidate(keyword({ orders: 0, spend: 6_000, revenue: 0 }), new Map());
      expect(candidate).toMatchObject({
        actionType: 'pause_keyword',
        targetType: 'keyword',
        externalId: 'VI-1',
        targetLabel: '물총',
        priority: 'urgent',
        payload: { adTarget: { campaignId: 'CMP-1', adGroupId: 'G1', vendorItemId: 'VI-1', keyword: '물총', businessDate: '2026-09-20', source: 'ad_report' } },
      });
      expect(candidate?.reason).toContain('전환 0건');
    });

    it('keyword roas in (0,100) + grade=A → pause_keyword high', () => {
      expect(createActionCandidate(keyword({ abcGrade: 'A', spend: 10_000, revenue: 5_000 }), new Map()))
        .toMatchObject({ actionType: 'pause_keyword', priority: 'high' });
    });

    it('proposes nothing for a keyword of a paused campaign or the non-search row', () => {
      expect(createActionCandidate(keyword({ isActive: false, orders: 0, spend: 6_000 }), new Map())).toBeNull();
      expect(createActionCandidate(keyword({ keyword: '', orders: 0, spend: 6_000 }), new Map())).toBeNull();
    });

    it('never proposes a bid change: a keyword with ROAS 100–200 has no action', () => {
      expect(createActionCandidate(keyword({ spend: 10_000, revenue: 15_000 }), new Map())).toBeNull();
    });
  });

  describe('Rule 3: A-grade campaign budget expansion', () => {
    it('grade=A + roas>=480 → change_daily_budget high (budget * 1.2)', () => {
      expect(createActionCandidate(campaign({ abcGrade: 'A', spend: 1_000, revenue: 5_000 }), new Map())).toMatchObject({
        actionType: 'change_daily_budget', priority: 'high', currentValue: 10_000, proposedValue: 12_000,
      });
    });
  });

  describe('Rule 4: low-performance campaign budget shrink', () => {
    it('does not treat an unclassified product as C when ROAS is healthy', () => {
      expect(createActionCandidate(campaign({ abcGrade: null, spend: 1_000, revenue: 3_000 }), new Map())).toBeNull();
    });

    it('grade=C + budget>3000 → high, max(3000, budget*0.5)', () => {
      expect(createActionCandidate(campaign({ abcGrade: 'C' }), new Map())).toMatchObject({
        priority: 'high', proposedValue: 5_000,
      });
    });

    it('non-C grade + low ROAS uses medium priority and clamps to 3000', () => {
      expect(createActionCandidate(campaign({ budget: 5_000, spend: 10_000, revenue: 5_000 }), new Map())).toMatchObject({
        priority: 'medium', proposedValue: 3_000,
      });
    });

    it('skips a campaign without a budget', () => {
      expect(createActionCandidate(campaign({ abcGrade: 'C', budget: null }), new Map())).toBeNull();
    });
  });
});
