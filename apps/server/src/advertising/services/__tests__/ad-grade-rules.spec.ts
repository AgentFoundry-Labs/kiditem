import { describe, it, expect, beforeEach } from 'vitest';
import { AdGradeRulesService } from '../ad-grade-rules.service';
import type { GradeRulesInput, AdIssuesInput, HydratedListing } from '../types';

/**
 * B2b (commit 2c17850) listing-level ABC rules 동작 검증.
 *
 * ad-grade-rules.service.ts 는 `prisma.ad.groupBy(['listingId'])` 결과 (AdAggregateRow)
 * 와 listing hydrate 결과 + profitRate map 을 받아 rule 평가. snapshot 단위가 아님.
 */

const listingBase = (
  overrides: Partial<HydratedListing['masterProduct']> = {},
  option: HydratedListing['primaryOption'] = {
    id: 'O1',
    availableStock: 100,
    costPrice: 5000,
    sellPrice: 20000,
    commissionRate: 0.1,
    shippingCost: 2500,
  },
): HydratedListing => ({
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
    ...overrides,
  },
  primaryOption: option,
});

const adGroup = (overrides: Partial<GradeRulesInput['adGroups'][number]> = {}) => ({
  listingId: 'L1',
  spend: 10000,
  revenue: 50000,
  clicks: 100,
  impressions: 10000,
  conversions: 10,
  ...overrides,
});

const buildInput = (
  adGroups: GradeRulesInput['adGroups'],
  listings: HydratedListing[] = [listingBase()],
  grade: 'A' | 'B' | 'C' = 'A',
  profitRate = 20,
): GradeRulesInput => ({
  adGroups,
  listings,
  gradeMap: new Map(listings.map((l) => [l.id, grade])),
  profitRateByListing: new Map(listings.map((l) => [l.id, profitRate])),
});

describe('AdGradeRulesService.calcActions', () => {
  let service: AdGradeRulesService;
  beforeEach(() => {
    service = new AdGradeRulesService();
  });

  describe('A 등급 규칙', () => {
    it('A-1 매출 확대: roas>=480 + spend>0 → priority=high + actionType=increase', () => {
      const input = buildInput([adGroup({ spend: 10000, revenue: 50000 })], [listingBase()], 'A');
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('high');
      expect(result[0].actionType).toBe('increase');
      expect(result[0].grade).toBe('A');
    });

    it('A-3 위험 감지: roas<200 + spend>3000 → priority=urgent + actionType=stop', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 15000, conversions: 1 })],
        [listingBase()],
        'A',
      );
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('urgent');
      expect(result[0].actionType).toBe('stop');
    });
  });

  describe('B 등급 규칙', () => {
    it('B-3 예산 유지: roas∈[300,480) → priority=low + actionType=maintain', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 35000 })],
        [listingBase()],
        'B',
      );
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('low');
      expect(result[0].actionType).toBe('maintain');
    });

    it('B-5 A 승격: roas>=480 → priority=high + actionType=maintain', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 50000 })],
        [listingBase()],
        'B',
      );
      const result = service.calcActions(input);
      expect(result[0].priority).toBe('high');
    });
  });

  describe('C 등급 규칙', () => {
    it('C-1 광고 중단: spend>0 + revenue=0 → priority=urgent + actionType=stop', () => {
      const input = buildInput(
        [adGroup({ spend: 5000, revenue: 0, conversions: 0, clicks: 10 })],
        [listingBase()],
        'C',
      );
      const result = service.calcActions(input);
      // 클릭<50 이고 스펜드>0+전환0 → C-1 이 main (urgent)
      expect(result[0].priority).toBe('urgent');
      expect(result[0].actionType).toBe('stop');
    });

    it('C-2 최소 예산: roas∈[50,100) → priority=high + actionType=decrease', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 8000, conversions: 1, clicks: 40 })],
        [listingBase()],
        'C',
      );
      const result = service.calcActions(input);
      expect(result[0].priority).toBe('high');
      expect(result[0].actionType).toBe('decrease');
    });
  });

  describe('긴급 규칙', () => {
    it('재고 0 + adTier 존재 + spend>0 → urgent (stop actionType)', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 50000 })],
        [
          listingBase({}, {
            id: 'O1',
            availableStock: 0,
            costPrice: 5000,
            sellPrice: 20000,
            commissionRate: 0.1,
            shippingCost: 2500,
          }),
        ],
        'A',
      );
      const result = service.calcActions(input);
      expect(result[0].priority).toBe('urgent');
      expect(result[0].actionType).toBe('stop');
    });

    it('재고 0 + adTier null → 긴급 규칙 skip (일반 A-1 동작)', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 50000 })],
        [
          listingBase({ adTier: null }, {
            id: 'O1',
            availableStock: 0,
            costPrice: 5000,
            sellPrice: 20000,
            commissionRate: 0.1,
            shippingCost: 2500,
          }),
        ],
        'A',
      );
      const result = service.calcActions(input);
      expect(result[0].priority).toBe('high'); // A-1
    });
  });

  describe('skip 조건', () => {
    it('spend === 0 → action 생성 skip', () => {
      const input = buildInput(
        [adGroup({ spend: 0, revenue: 0, conversions: 0 })],
        [listingBase()],
        'A',
      );
      expect(service.calcActions(input)).toHaveLength(0);
    });

    it('listingId 매칭 없음 (orchestrator 누락) → skip', () => {
      const input: GradeRulesInput = {
        adGroups: [adGroup({ listingId: 'UNKNOWN' })],
        listings: [listingBase()],
        gradeMap: new Map([['L1', 'A']]),
        profitRateByListing: new Map(),
      };
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('proposedValue = profitRate 백분율', () => {
    it('profitRate>0 → Math.round(profitRate)', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 50000 })],
        [listingBase()],
        'A',
        23.7,
      );
      const result = service.calcActions(input);
      expect(result[0].proposedValue).toBe(24);
    });

    it('profitRate=0 → null', () => {
      const input = buildInput(
        [adGroup({ spend: 10000, revenue: 50000 })],
        [listingBase()],
        'A',
        0,
      );
      const result = service.calcActions(input);
      expect(result[0].proposedValue).toBeNull();
    });
  });

  describe('priority 정렬', () => {
    it('urgent → high → medium → low 순 정렬', () => {
      // A urgent (재고0) + B high (roas 480) + B low (roas 300)
      const listings = [
        listingBase({}, {
          id: 'Oa',
          availableStock: 0,
          costPrice: 5000,
          sellPrice: 20000,
          commissionRate: 0.1,
          shippingCost: 2500,
        }),
        { ...listingBase({}, {
          id: 'Ob',
          availableStock: 100,
          costPrice: 5000,
          sellPrice: 20000,
          commissionRate: 0.1,
          shippingCost: 2500,
        }), id: 'L2' },
        { ...listingBase({}, {
          id: 'Oc',
          availableStock: 100,
          costPrice: 5000,
          sellPrice: 20000,
          commissionRate: 0.1,
          shippingCost: 2500,
        }), id: 'L3' },
      ];
      const input: GradeRulesInput = {
        adGroups: [
          adGroup({ listingId: 'L1', spend: 10000, revenue: 50000 }),
          adGroup({ listingId: 'L2', spend: 10000, revenue: 50000 }),
          adGroup({ listingId: 'L3', spend: 10000, revenue: 35000 }),
        ],
        listings,
        gradeMap: new Map([
          ['L1', 'A'],
          ['L2', 'B'],
          ['L3', 'B'],
        ]),
        profitRateByListing: new Map(),
      };
      const result = service.calcActions(input);
      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe('urgent');
      expect(result[1].priority).toBe('high');
      expect(result[2].priority).toBe('low');
    });
  });
});

describe('AdGradeRulesService.calcAdIssues', () => {
  let service: AdGradeRulesService;
  beforeEach(() => {
    service = new AdGradeRulesService();
  });

  it('zeroConversion: spend>0 + conversions=0 → urgent / stop', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 },
      ],
      listings: [listingBase()],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.zeroConversion).toHaveLength(1);
    expect(result.zeroConversion[0].actionType).toBe('stop');
    expect(result.zeroConversion[0].priority).toBe('urgent');
  });

  it('lowRoas: spend>0 + revenue>0 + roas<100 → high / decrease', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 10000, impressions: 1000, clicks: 50, conversions: 1, revenue: 5000 },
      ],
      listings: [listingBase()],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.lowRoas).toHaveLength(1);
    expect(result.lowRoas[0].actionType).toBe('decrease');
    expect(result.lowRoas[0].priority).toBe('high');
  });

  it('highSpend: spend>=10000 → medium / maintain (B2b threshold)', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 10000, impressions: 1000, clicks: 50, conversions: 5, revenue: 50000 },
      ],
      listings: [listingBase()],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.highSpend).toHaveLength(1);
    expect(result.highSpend[0].actionType).toBe('maintain');
    expect(result.highSpend[0].priority).toBe('medium');
  });

  it('highSpend boundary: spend=9999 → skip', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 9999, impressions: 1000, clicks: 50, conversions: 5, revenue: 50000 },
      ],
      listings: [listingBase()],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.highSpend).toHaveLength(0);
  });

  it('listing 누락 시 skip', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'UNKNOWN', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 },
      ],
      listings: [listingBase()],
      gradeMap: new Map([['L1', 'A']]),
    };
    const result = service.calcAdIssues(input);
    expect(result.zeroConversion).toHaveLength(0);
    expect(result.lowRoas).toHaveLength(0);
    expect(result.highSpend).toHaveLength(0);
  });

  it('AdListingSummary 반환: option:null + masterProduct trimmed', () => {
    const input: AdIssuesInput = {
      adGroups: [
        { listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 },
      ],
      listings: [listingBase()],
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
