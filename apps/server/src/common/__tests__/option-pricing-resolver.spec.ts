import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolvePricing } from '../option-pricing-resolver';

/**
 * The listing-option pricing policy: a price the operator recorded is used as
 * recorded, and a price nobody recorded is unavailable — never zero, and never
 * converted from another currency at an assumed rate.
 */
const option = (overrides: Partial<Parameters<typeof resolvePricing>[0]['option']> = {}) => ({
  costPriceOverride: null,
  commissionRate: new Prisma.Decimal('0.1'),
  otherCost: 0,
  inventoryComponents: [{ quantity: 2, purchasePrice: 1_000 }],
  ...overrides,
});

describe('resolvePricing', () => {
  it('prices a unit from its cost override before its mapped components', () => {
    expect(resolvePricing({ option: option({ costPriceOverride: 4_500 }) }).unitCost).toBe(4_500);
  });

  it('keeps a recorded zero override as a measured zero', () => {
    expect(resolvePricing({ option: option({ costPriceOverride: 0 }) }).unitCost).toBe(0);
  });

  it('prices a unit from every mapped component and its quantity', () => {
    expect(resolvePricing({
      option: option({
        inventoryComponents: [
          { quantity: 2, purchasePrice: 1_000 },
          { quantity: 1, purchasePrice: 700 },
        ],
      }),
    }).unitCost).toBe(2_700);
  });

  it('has no unit cost when nothing is mapped and no override was recorded', () => {
    expect(resolvePricing({ option: option({ inventoryComponents: [] }) }).unitCost).toBeNull();
  });

  it('has no unit cost when any mapped component lacks a purchase price', () => {
    expect(resolvePricing({
      option: option({
        inventoryComponents: [
          { quantity: 1, purchasePrice: 1_000 },
          { quantity: 1, purchasePrice: null },
        ],
      }),
    }).unitCost).toBeNull();
  });

  it('reads a Decimal or numeric commission rate and keeps a recorded zero', () => {
    expect(resolvePricing({ option: option() }).commissionRate).toBe(0.1);
    expect(resolvePricing({ option: option({ commissionRate: 0 }) }).commissionRate).toBe(0);
  });

  it.each([null, undefined, 'not-a-rate'])('has no commission rate for %s', (commissionRate) => {
    expect(resolvePricing({ option: option({ commissionRate }) }).commissionRate).toBeNull();
  });

  it('keeps an unrecorded other cost unavailable and a recorded zero measured', () => {
    expect(resolvePricing({ option: option({ otherCost: null }) }).otherCost).toBeNull();
    expect(resolvePricing({ option: option({ otherCost: 0 }) }).otherCost).toBe(0);
  });
});
