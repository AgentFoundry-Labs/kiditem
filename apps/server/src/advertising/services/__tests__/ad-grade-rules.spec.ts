import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { AdGradeRulesService } from '../ad-grade-rules.service';
import type { GradeRulesInput, AdIssuesInput, HydratedListing, InventoryRow } from '../types';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const listing: HydratedListing = {
  id: 'L1',
  externalId: 'EXT-1',
  channelName: '쿠팡 등록명',
  masterProduct: {
    id: 'M1',
    code: 'M-00000001',
    name: '테스트 상품',
    abcGrade: 'A',
    adTier: '1차',
    healthScore: 80,
  },
};

const baseInv: InventoryRow = {
  optionId: 'O1',
  listingId: 'L1',
  availableStock: 10,
  costPrice: 5000,
  sellPrice: 10000,
  commissionRate: null,
};

const fixture = (
  overrides: Partial<GradeRulesInput['snapshots'][number]> = {},
): GradeRulesInput['snapshots'][number] => ({
  id: 's1',
  listingId: 'L1',
  optionId: 'O1',
  pageType: 'campaign',
  externalId: 'EXT-1',
  campaignName: 'CAM-1',
  status: '진행중',
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  roas: null,
  dailyBudget: 10000,
  currentBid: null,
  ...overrides,
});

const buildInput = (
  snapshot: GradeRulesInput['snapshots'][number],
  inv: InventoryRow = baseInv,
  grade: 'A' | 'B' | 'C' = 'A',
): GradeRulesInput => ({
  snapshots: [snapshot],
  listings: [listing],
  inventory: new Map([[inv.optionId, inv]]),
  gradeMap: new Map([[listing.id, grade]]),
});

// ─────────────────────────────────────────────
// calcActions — 5 rule 경계값
// ─────────────────────────────────────────────

describe('AdGradeRulesService.calcActions', () => {
  let service: AdGradeRulesService;
  beforeEach(() => {
    service = new AdGradeRulesService();
  });

  describe('Rule 1 — stock=0 campaign 예산컷', () => {
    it('triggers when stock=0 + pageType=campaign + dailyBudget>0', () => {
      const input = buildInput(fixture({ dailyBudget: 10000 }), { ...baseInv, availableStock: 0 });
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].priority).toBe('urgent');
      expect(result[0].proposedValue).toBe(3000);
      expect(result[0].currentValue).toBe(10000);
      expect(result[0].listing.listingId).toBe('L1');
      expect(result[0].listing.option).toBeNull();
    });

    it('skips when snapshot.optionId is null (listing-level snapshot 매칭 시 stock 판정 불가)', () => {
      // roas=300 으로 Rule 5 (roas<100) 도 차단 — Rule 1 only assertion
      const input: GradeRulesInput = {
        snapshots: [fixture({ optionId: null, dailyBudget: 10000, roas: new Prisma.Decimal(300) })],
        listings: [listing],
        inventory: new Map([['O1', { ...baseInv, availableStock: 0 }]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      expect(service.calcActions(input)).toHaveLength(0);
    });

    it('skips when stock > 0', () => {
      // roas=300 으로 Rule 5 차단
      const input = buildInput(
        fixture({ dailyBudget: 10000, roas: new Prisma.Decimal(300) }),
        { ...baseInv, availableStock: 1 },
      );
      expect(service.calcActions(input)).toHaveLength(0);
    });

    it('skips when dailyBudget=0 (광고 OFF 상태)', () => {
      // dailyBudget=0 이면 Rule 1/4/5 모두 budget>0 / >3000 조건 fail
      const input = buildInput(fixture({ dailyBudget: 0 }), { ...baseInv, availableStock: 0 });
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('Rule 2 — keyword pause', () => {
    it('zero conversion + spend>=5000 (boundary) + grade=A → pause_keyword high', () => {
      const input = buildInput(
        fixture({ pageType: 'keyword', conversions: 0, spend: 5000 }),
        baseInv,
        'A',
      );
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('pause_keyword');
      expect(result[0].priority).toBe('high');
    });

    it('zero conversion + spend>=5000 + grade=B → pause_keyword urgent', () => {
      const input = buildInput(
        fixture({ pageType: 'keyword', conversions: 0, spend: 5000 }),
        baseInv,
        'B',
      );
      const result = service.calcActions(input);
      expect(result[0].priority).toBe('urgent');
    });

    it('roas∈(0,100) (e.g. 50) → pause_keyword (B grade urgent)', () => {
      const input = buildInput(
        fixture({
          pageType: 'keyword',
          spend: 1000,
          revenue: 500,
          roas: new Prisma.Decimal(50),
        }),
        baseInv,
        'B',
      );
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('pause_keyword');
      expect(result[0].priority).toBe('urgent');
    });

    it('skips when status contains "일시중지" (이미 paused)', () => {
      const input = buildInput(
        fixture({
          pageType: 'keyword',
          conversions: 0,
          spend: 5000,
          status: '일시중지',
        }),
      );
      expect(service.calcActions(input)).toHaveLength(0);
    });

    it('skips when zero conversion but spend < 5000', () => {
      const input = buildInput(fixture({ pageType: 'keyword', conversions: 0, spend: 4999 }));
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('Rule 3 — keyword bid 하향', () => {
    it('roas∈[100,200) + currentBid>0 → change_bid (nextBid = round(current*0.85), medium)', () => {
      // conversions=2 + spend=3000 (5000 미만) → Rule 2 zeroConvSpend 차단, roas 150 → Rule 2 poorRoas 차단
      const input = buildInput(
        fixture({
          pageType: 'keyword',
          currentBid: 1000,
          spend: 3000,
          revenue: 4500,
          conversions: 2,
          roas: new Prisma.Decimal(150),
        }),
        baseInv,
        'B',
      );
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('change_bid');
      expect(result[0].proposedValue).toBe(850); // round(1000 * 0.85 / 10) * 10
      expect(result[0].currentValue).toBe(1000);
      expect(result[0].priority).toBe('medium'); // profitRate >= 0
    });

    it('priority=high when profitRate < 0 (costPrice > sellPrice)', () => {
      const input = buildInput(
        fixture({
          pageType: 'keyword',
          currentBid: 1000,
          spend: 3000,
          revenue: 4500,
          conversions: 2,
          roas: new Prisma.Decimal(150),
        }),
        { ...baseInv, costPrice: 12000, sellPrice: 10000 }, // 손익 < 0
        'B',
      );
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('change_bid');
      expect(result[0].priority).toBe('high');
    });

    it('skips at boundary roas=200 (upper exclusive)', () => {
      // conversions=2 → Rule 2 zeroConvSpend 차단
      const input = buildInput(
        fixture({
          pageType: 'keyword',
          currentBid: 1000,
          spend: 3000,
          revenue: 6000,
          conversions: 2,
          roas: new Prisma.Decimal(200),
        }),
      );
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('Rule 4 — 캠페인 예산 확대', () => {
    it('grade=A + roas>=480 → change_daily_budget (1.2x, high)', () => {
      const input = buildInput(
        fixture({
          dailyBudget: 10000,
          spend: 5000,
          revenue: 24000,
          roas: new Prisma.Decimal(480),
        }),
        baseInv,
        'A',
      );
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].proposedValue).toBe(12000); // round(10000 * 1.2 / 1000) * 1000
      expect(result[0].priority).toBe('high');
    });

    it('skips when grade=B even if roas>=480 (A 전용)', () => {
      const input = buildInput(
        fixture({
          dailyBudget: 10000,
          roas: new Prisma.Decimal(500),
        }),
        baseInv,
        'B',
      );
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('Rule 5 — 캠페인 예산 축소', () => {
    it('grade=C + dailyBudget>3000 + low roas → change_daily_budget (0.5x, high)', () => {
      const input = buildInput(
        fixture({
          dailyBudget: 10000,
          spend: 5000,
          revenue: 4000,
          roas: new Prisma.Decimal(80),
        }),
        baseInv,
        'C',
      );
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].proposedValue).toBe(5000); // round(10000 * 0.5 / 1000) * 1000
      expect(result[0].priority).toBe('high'); // C grade
    });

    it('grade=B + roas<100 + dailyBudget>3000 → change_daily_budget (medium)', () => {
      const input = buildInput(
        fixture({
          dailyBudget: 10000,
          roas: new Prisma.Decimal(80),
        }),
        baseInv,
        'B',
      );
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].priority).toBe('medium');
    });

    it('clamps proposedValue at 3000 floor', () => {
      const input = buildInput(
        fixture({
          dailyBudget: 4000,
          roas: new Prisma.Decimal(50),
        }),
        baseInv,
        'C',
      );
      const result = service.calcActions(input);
      expect(result[0].proposedValue).toBe(3000); // max(3000, round(4000*0.5/1000)*1000) = max(3000, 2000) = 3000
    });

    it('skips when dailyBudget<=3000 (원본 임계값)', () => {
      const input = buildInput(
        fixture({
          dailyBudget: 3000,
          roas: new Prisma.Decimal(50),
        }),
        baseInv,
        'C',
      );
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('snapshot listingId / listing miss', () => {
    it('skips snapshot with null listingId', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ listingId: null })],
        listings: [listing],
        inventory: new Map([['O1', baseInv]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      expect(service.calcActions(input)).toHaveLength(0);
    });

    it('skips when listingMap miss (orchestrator 누락)', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ listingId: 'UNKNOWN', dailyBudget: 10000 })],
        listings: [listing],
        inventory: new Map([['O1', { ...baseInv, availableStock: 0 }]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      expect(service.calcActions(input)).toHaveLength(0);
    });

    it('defaults grade to C when gradeMap miss', () => {
      // Rule 5 trigger 조건 (C grade + roas<100 + budget>3000) — gradeMap 비어도 C default 로 trigger
      const input: GradeRulesInput = {
        snapshots: [fixture({ dailyBudget: 10000, roas: new Prisma.Decimal(50) })],
        listings: [listing],
        inventory: new Map([['O1', baseInv]]),
        gradeMap: new Map(),
      };
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].grade).toBe('C');
    });
  });
});

// ─────────────────────────────────────────────
// calcAdIssues — 카테고리화 boundary
// ─────────────────────────────────────────────

describe('AdGradeRulesService.calcAdIssues', () => {
  let service: AdGradeRulesService;
  beforeEach(() => {
    service = new AdGradeRulesService();
  });

  it('zero conversion + spend>=5000 → zeroConversion category', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 },
      ],
      listings: [listing],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.zeroConversion).toHaveLength(1);
    expect(result.zeroConversion[0].actionType).toBe('investigate');
    expect(result.zeroConversion[0].priority).toBe('urgent');
    expect(result.lowRoas).toHaveLength(0);
    expect(result.highSpend).toHaveLength(0);
  });

  it('roas∈(0,100) + spend>=5000 → lowRoas category', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 1, revenue: 4000 },
      ],
      listings: [listing],
      gradeMap: new Map([['L1', 'B']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.lowRoas).toHaveLength(1);
    expect(result.lowRoas[0].actionType).toBe('reduce_budget');
    expect(result.lowRoas[0].priority).toBe('high');
  });

  it('spend>=50000 + roas<200 → highSpend category', () => {
    const input: AdIssuesInput = {
      adGroups: [
        {
          listingId: 'L1',
          spend: 50000,
          impressions: 5000,
          clicks: 250,
          conversions: 5,
          revenue: 80000, // roas = 160
        },
      ],
      listings: [listing],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.highSpend).toHaveLength(1);
    expect(result.highSpend[0].actionType).toBe('review_campaign');
    expect(result.highSpend[0].priority).toBe('medium');
  });

  it('skips adGroup when listingMap miss', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'UNKNOWN', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 },
      ],
      listings: [listing],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.zeroConversion).toHaveLength(0);
    expect(result.lowRoas).toHaveLength(0);
    expect(result.highSpend).toHaveLength(0);
  });

  it('returns AdListingSummary with option:null + masterProduct trimmed', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 },
      ],
      listings: [listing],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.zeroConversion[0].listing).toEqual({
      listingId: 'L1',
      externalId: 'EXT-1',
      channelName: '쿠팡 등록명',
      masterProduct: { id: 'M1', code: 'M-00000001', name: '테스트 상품' },
      option: null,
    });
  });
});
