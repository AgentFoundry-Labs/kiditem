import { describe, it, expect } from 'vitest';
import { resolvePricing } from '../option-pricing-resolver';

// Prisma Decimal stub: Number(decimal) calls valueOf()
function decimal(n: number) {
  return {
    valueOf: () => n,
    toNumber: () => n,
    toString: () => String(n),
  } as unknown as number;
}

describe('resolvePricing (option-pricing-resolver, v2 nested-only §4.4)', () => {
  describe('costPrice', () => {
    it('returns option.costPrice when present', () => {
      const result = resolvePricing({ option: { costPrice: 5000 } });
      expect(result.costPrice).toBe(5000);
      expect(result.isCostMissing).toBe(false);
    });

    it('falls back to costCny * 190 when costPrice is null', () => {
      const result = resolvePricing({
        option: { costPrice: null, costCny: decimal(10) },
      });
      expect(result.costPrice).toBe(1900);
      expect(result.isCostMissing).toBe(false);
    });

    it('returns 0 and isCostMissing=true when both costPrice and costCny are null', () => {
      const result = resolvePricing({ option: {} });
      expect(result.costPrice).toBe(0);
      expect(result.isCostMissing).toBe(true);
    });

    it('returns costPrice=0 when explicitly 0 (not treated as nullish)', () => {
      const result = resolvePricing({
        option: { costPrice: 0, costCny: decimal(10) },
      });
      // `?? ` treats 0 as non-nullish → option.costPrice(0) wins
      expect(result.costPrice).toBe(0);
      expect(result.isCostMissing).toBe(false); // hasCost true because costPrice != null
    });

    it('treats undefined costPrice the same as null (fallback to costCny)', () => {
      const result = resolvePricing({ option: { costCny: decimal(5) } });
      expect(result.costPrice).toBe(950); // 5 * 190
      expect(result.isCostMissing).toBe(false);
    });
  });

  describe('sellPrice', () => {
    it('returns option.sellPrice when present', () => {
      const result = resolvePricing({ option: { sellPrice: 15000 } });
      expect(result.sellPrice).toBe(15000);
    });

    it('returns 0 when sellPrice is null', () => {
      const result = resolvePricing({ option: { sellPrice: null } });
      expect(result.sellPrice).toBe(0);
    });

    it('returns 0 when sellPrice is omitted', () => {
      const result = resolvePricing({ option: {} });
      expect(result.sellPrice).toBe(0);
    });
  });

  describe('commissionRate', () => {
    it('converts Prisma Decimal to number via Number()', () => {
      const result = resolvePricing({
        option: { commissionRate: decimal(0.108) },
      });
      expect(result.commissionRate).toBeCloseTo(0.108);
    });

    it('accepts raw number commissionRate', () => {
      const result = resolvePricing({ option: { commissionRate: 0.15 } });
      expect(result.commissionRate).toBeCloseTo(0.15);
    });

    it('returns 0 when commissionRate is null', () => {
      const result = resolvePricing({ option: { commissionRate: null } });
      expect(result.commissionRate).toBe(0);
    });

    it('returns 0 when commissionRate is omitted', () => {
      const result = resolvePricing({ option: {} });
      expect(result.commissionRate).toBe(0);
    });
  });

  describe('shippingCost / otherCost (C-07 passthrough)', () => {
    it('returns option.shippingCost when present', () => {
      const result = resolvePricing({ option: { shippingCost: 2500 } });
      expect(result.shippingCost).toBe(2500);
    });

    it('returns 0 when shippingCost is null', () => {
      const result = resolvePricing({ option: { shippingCost: null } });
      expect(result.shippingCost).toBe(0);
    });

    it('returns option.otherCost when present', () => {
      const result = resolvePricing({ option: { otherCost: 300 } });
      expect(result.otherCost).toBe(300);
    });

    it('returns 0 when otherCost is null', () => {
      const result = resolvePricing({ option: { otherCost: null } });
      expect(result.otherCost).toBe(0);
    });

    it('passes through shippingCost + otherCost alongside costPrice', () => {
      const result = resolvePricing({
        option: {
          costPrice: 8000,
          sellPrice: 20000,
          commissionRate: decimal(0.108),
          shippingCost: 2500,
          otherCost: 300,
        },
      });
      expect(result).toEqual({
        costPrice: 8000,
        sellPrice: 20000,
        commissionRate: 0.108,
        shippingCost: 2500,
        otherCost: 300,
        isCostMissing: false,
      });
    });
  });

  describe('isCostMissing', () => {
    it('is true only when BOTH costPrice and costCny are nullish', () => {
      expect(resolvePricing({ option: {} }).isCostMissing).toBe(true);
      expect(
        resolvePricing({ option: { costPrice: null, costCny: null } })
          .isCostMissing,
      ).toBe(true);
    });

    it('is false when costPrice is set', () => {
      expect(
        resolvePricing({ option: { costPrice: 100 } }).isCostMissing,
      ).toBe(false);
    });

    it('is false when only costCny is set', () => {
      expect(
        resolvePricing({ option: { costCny: decimal(1) } }).isCostMissing,
      ).toBe(false);
    });
  });
});
