import { describe, expect, it } from 'vitest';
import { resolveOrderLineSalesCosts, resolveUnitCost } from '../option-pricing-resolver';

describe('resolveUnitCost', () => {
  it('prices one sold unit as the recipe at Sellpia purchase prices', () => {
    expect(resolveUnitCost({
      inventoryComponents: [
        { quantity: 2, purchasePrice: 1_000 },
        { quantity: 1, purchasePrice: 2_500 },
      ],
    })).toBe(4_500);
  });

  it('keeps a recorded purchase price of 0 as a measured 0', () => {
    expect(resolveUnitCost({ inventoryComponents: [{ quantity: 1, purchasePrice: 0 }] })).toBe(0);
  });

  it('has no unit cost without a recipe or when any component has no purchase price', () => {
    expect(resolveUnitCost({ inventoryComponents: [] })).toBeNull();
    expect(resolveUnitCost({
      inventoryComponents: [
        { quantity: 1, purchasePrice: 1_000 },
        { quantity: 1, purchasePrice: null },
      ],
    })).toBeNull();
  });

  it('does not read an option cost override (KID-114)', () => {
    expect(resolveUnitCost({
      costPriceOverride: 9_999,
      inventoryComponents: [{ quantity: 1, purchasePrice: 1_000 }],
    } as Parameters<typeof resolveUnitCost>[0])).toBe(1_000);
  });
});

describe('resolveOrderLineSalesCosts', () => {
  it('does not apply a commission or other cost to a Rocket direct-purchase order', () => {
    expect(resolveOrderLineSalesCosts({ channel: 'rocket' })).toEqual({
      commissionApplies: false,
      otherCostApplies: false,
      commission: 0,
      otherCost: 0,
    });
  });

  it.each([{ channel: 'coupang' }, { channel: 'naver' }, null])(
    'leaves both unknown for an order account whose commission has no source: %o',
    (account) => {
      expect(resolveOrderLineSalesCosts(account)).toEqual({
        commissionApplies: true,
        otherCostApplies: true,
        commission: null,
        otherCost: null,
      });
    },
  );
});
