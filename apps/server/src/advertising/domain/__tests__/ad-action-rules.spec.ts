import { describe, it, expect } from 'vitest';

import {
  calcProfitRate,
  createActionCandidate,
  type ChannelSkuAdEvidence,
} from '../ad-action-rules';
import type { LatestTargetRow } from '../../application/port/out/repository/ad-action.repository.port';

/**
 * Pure decision logic for the 5 `AdAction` rules. The rules consume one
 * `LatestTargetRow` (latest `ChannelAdTargetDailySnapshot` per `targetKey`)
 * and the exact component-derived ChannelSku capacity per `listingOptionId`.
 * Tested without Prisma so threshold/priority/payload
 * regressions surface as plain unit failures.
 *
 * Lifecycle, persistence, and end-to-end orchestration are protected by the
 * sibling integration test (`ad-action-flow.pg.integration.spec.ts`).
 */

function baseRow(overrides: Partial<LatestTargetRow> = {}): LatestTargetRow {
  return {
    id: 'TGT-1',
    targetType: 'campaign',
    targetKey: 'campaign:CMP-1',
    listingId: 'L1',
    listingOptionId: 'LO1',
    externalId: 'EXT-1',
    campaignId: 'CMP-1',
    campaignName: 'C1',
    keyword: null,
    status: 'active',
    currentBid: null,
    dailyBudget: 10000,
    spend: 5000,
    revenue: 10000,
    impressions: 100,
    clicks: 10,
    conversions: 2,
    abcGrade: 'B',
    optionCommissionRate: 0.1,
    productName: '상품1',
    ...overrides,
  };
}

describe('createActionCandidate — 5 rules', () => {
  describe('Rule 1: zero stock → change_daily_budget urgent', () => {
    it('does not treat unknown canonical ChannelSku capacity as sold out', () => {
      const row = baseRow();

      const candidate = createActionCandidate(
        row,
        new Map<string, ChannelSkuAdEvidence>([['LO1', {
          sellableStock: null,
          purchaseCost: 3000,
          salePrice: 10000,
        }]]),
      );

      expect(candidate).toBeNull();
    });

    it('fires when canonical ChannelSku sellableStock is 0 (proposedValue=3000, urgent)', () => {
      const row = baseRow();

      const candidate = createActionCandidate(
        row,
        new Map<string, ChannelSkuAdEvidence>([['LO1', {
          sellableStock: 0,
          purchaseCost: 3000,
          salePrice: 10000,
        }]]),
      );

      expect(candidate).toMatchObject({
        adTargetDailyId: 'TGT-1',
        listingId: 'L1',
        actionType: 'change_daily_budget',
        targetType: 'campaign',
        priority: 'urgent',
        currentValue: 10000,
        proposedValue: 3000,
      });
      expect(candidate?.reason).toContain('재고 0개');
    });

    it('does not fire when canonical ChannelSku sellableStock is positive', () => {
      const row = baseRow();
      const observed = new Map<string, ChannelSkuAdEvidence>([['LO1', {
        sellableStock: 5,
        purchaseCost: 3000,
        salePrice: 10000,
      }]]);

      const candidate = createActionCandidate(row, observed);

      expect(candidate).toBeNull();
    });

    it('skips when listingOptionId is null (option stock not observable)', () => {
      const row = baseRow({ listingOptionId: null });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toBeNull();
    });

    it('skips when canonical capacity is not available', () => {
      const row = baseRow();

      const candidate = createActionCandidate(row, new Map());

      // ROAS = revenue/spend*100 = 10000/5000*100 = 200 → no rule 4/5 either
      expect(candidate).toBeNull();
    });
  });

  describe('Rule 2: keyword pause', () => {
    it('zero conversion + spend>=5000 → pause_keyword urgent (non-A grade)', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 0,
        spend: 8000,
        revenue: 0,
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toMatchObject({
        actionType: 'pause_keyword',
        targetType: 'keyword',
        priority: 'urgent',
        currentValue: null,
        proposedValue: null,
      });
    });

    it('keyword roas in (0,100) + grade=A → pause_keyword high', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 1,
        spend: 2000,
        revenue: 1000, // ROAS = 50
        abcGrade: 'A',
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate?.actionType).toBe('pause_keyword');
      expect(candidate?.priority).toBe('high');
    });

    it('skips when keyword status text already indicates paused (e.g. "off")', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 0,
        spend: 8000,
        status: 'OFF',
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toBeNull();
    });
  });

  describe('Rule 3: keyword bid down', () => {
    it('uses exact ChannelSku sale price and component purchase cost for margin priority', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 5,
        spend: 10000,
        revenue: 15000,
        currentBid: 1000,
        optionCommissionRate: 0.1,
      });
      const evidence = new Map([['LO1', {
        sellableStock: 5,
        purchaseCost: 12000,
        salePrice: 10000,
      }]]) as Map<string, ChannelSkuAdEvidence>;

      expect(createActionCandidate(row, evidence)?.priority).toBe('high');
    });

    it('keeps priority neutral when exact component purchase cost is unknown', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 5,
        spend: 10000,
        revenue: 15000,
        currentBid: 1000,
        optionCommissionRate: 0.1,
      });
      const evidence = new Map([['LO1', {
        sellableStock: 5,
        purchaseCost: null,
        salePrice: 10000,
      }]]) as Map<string, ChannelSkuAdEvidence>;

      expect(createActionCandidate(row, evidence)?.priority).toBe('medium');
    });

    it('keyword 100<=roas<200 + currentBid>0 → change_bid (currentBid * 0.85, rounded)', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 5,
        spend: 10000,
        revenue: 15000, // ROAS = 150
        currentBid: 1000,
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toMatchObject({
        actionType: 'change_bid',
        targetType: 'keyword',
        currentValue: 1000,
        proposedValue: 850,
      });
    });

    it('upgrades priority to high when calculated profit rate is negative', () => {
      const row = baseRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 5,
        spend: 10000,
        revenue: 15000, // ROAS = 150
        currentBid: 1000,
        // commission 100% with cost > sell → negative margin
        optionCommissionRate: 0.1,
      });

      const candidate = createActionCandidate(row, new Map([['LO1', {
        sellableStock: 5,
        purchaseCost: 12000,
        salePrice: 10000,
      }]]));

      expect(candidate?.priority).toBe('high');
    });
  });

  describe('Rule 4: A-grade campaign budget expansion', () => {
    it('grade=A + roas>=480 + campaign with budget → change_daily_budget high (budget * 1.2)', () => {
      const row = baseRow({
        dailyBudget: 10000,
        spend: 1000,
        revenue: 5000, // ROAS = 500
        abcGrade: 'A',
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toMatchObject({
        actionType: 'change_daily_budget',
        targetType: 'campaign',
        priority: 'high',
        currentValue: 10000,
        proposedValue: 12000,
      });
    });
  });

  describe('Rule 5: low-performance campaign budget shrink', () => {
    it('does not treat an unclassified product as C when ROAS is healthy', () => {
      const row = baseRow({
        abcGrade: null,
        dailyBudget: 20_000,
        spend: 5_000,
        revenue: 10_000,
      });

      expect(createActionCandidate(row, new Map())).toBeNull();
    });

    it('uses only the metric rule for an unclassified low-ROAS product', () => {
      const row = baseRow({
        abcGrade: null,
        dailyBudget: 20_000,
        spend: 10_000,
        revenue: 8_000,
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toMatchObject({
        actionType: 'change_daily_budget',
        priority: 'medium',
      });
      expect(candidate?.reason).toContain('ROAS 80%');
      expect(candidate?.reason).not.toContain('C등급');
      expect(candidate?.reason).not.toContain('null등급');
    });

    it('grade=C + dailyBudget>3000 → change_daily_budget high (max(3000, budget*0.5))', () => {
      const row = baseRow({
        dailyBudget: 20000,
        spend: 10000,
        revenue: 8000, // ROAS = 80
        abcGrade: 'C',
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate).toMatchObject({
        actionType: 'change_daily_budget',
        priority: 'high',
        currentValue: 20000,
        proposedValue: 10000,
      });
    });

    it('non-C grade + low ROAS uses medium priority', () => {
      const row = baseRow({
        dailyBudget: 20000,
        spend: 10000,
        revenue: 8000, // ROAS = 80
        abcGrade: 'B',
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate?.priority).toBe('medium');
    });

    it('clamps proposedValue to 3000 when budget*0.5 falls below floor', () => {
      const row = baseRow({
        dailyBudget: 5000,
        spend: 100,
        revenue: 50, // ROAS = 50
        abcGrade: 'B',
      });

      const candidate = createActionCandidate(row, new Map());

      expect(candidate?.currentValue).toBe(5000);
      expect(candidate?.proposedValue).toBe(3000);
    });
  });
});

describe('calcProfitRate', () => {
  it('returns null when sellPrice is missing or non-positive', () => {
    expect(
      calcProfitRate({ costPrice: 1000, sellPrice: 0, commissionRate: 0.1 }),
    ).toBeNull();
    expect(
      calcProfitRate({ costPrice: 1000, sellPrice: null, commissionRate: 0.1 }),
    ).toBeNull();
  });

  it('returns positive percentage when sell exceeds cost + commission', () => {
    // sell=10000, cost=3000, commission=10% (1000) → profit=6000 → 60.00%
    expect(
      calcProfitRate({ costPrice: 3000, sellPrice: 10000, commissionRate: 0.1 }),
    ).toBe(60);
  });

  it('returns negative percentage when costs exceed sell', () => {
    // sell=10000, cost=12000, commission=10% (1000) → profit=-3000 → -30.00%
    expect(
      calcProfitRate({ costPrice: 12000, sellPrice: 10000, commissionRate: 0.1 }),
    ).toBe(-30);
  });
});
