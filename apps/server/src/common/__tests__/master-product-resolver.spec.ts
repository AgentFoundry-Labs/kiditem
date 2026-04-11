import { describe, it, expect } from 'vitest';
import { resolvePricing, resolveInventory } from '../master-product-resolver';

// Prisma Decimal stub: Number(decimal) calls valueOf()
function decimal(n: number) {
  return { valueOf: () => n, toNumber: () => n, toString: () => String(n) } as any;
}

// Helper: minimal Product stub
function stubProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    companyId: 'c-1',
    name: 'Test Product',
    description: '',
    sku: null,
    barcode: null,
    status: 'active',
    category: null,
    brand: null,
    tags: [],
    thumbnailUrl: null,
    sourceUrl: null,
    sourcePlatform: null,
    costCny: null as any,
    marginRate: null as any,
    rawData: null,
    processedData: null,
    draftContent: null,
    pipelineStep: null,
    detailPageUrl: null,
    costPrice: null as number | null,
    sellPrice: null as number | null,
    commissionRate: null as any,
    shippingCost: null,
    otherCost: null,
    abcGrade: null,
    adTier: null,
    adBudgetLimit: null,
    coupangProductId: null,
    deliveryChargeType: null,
    freeShipOverAmount: null,
    returnCharge: null,
    deliveryInfo: null,
    images: null,
    imageUrl: null,
    thumbnailStrategy: 'standard',
    healthScore: null,
    healthUpdatedAt: null,
    isDeleted: false,
    deletedAt: null,
    memo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    masterProductId: null,
    masterProduct: null,
    inventory: null,
    ...overrides,
  };
}

describe('resolvePricing', () => {
  it('returns masterProduct.costPrice when present', () => {
    const p = stubProduct({
      costPrice: 5000,
      masterProduct: { costPrice: 8000, sellPrice: null, commissionRate: null, inventory: null },
    });
    const result = resolvePricing(p);
    expect(result.costPrice).toBe(8000);
    expect(result.isCostMissing).toBe(false);
  });

  it('falls back to product.costPrice when masterProduct.costPrice is null', () => {
    const p = stubProduct({
      costPrice: 5000,
      masterProduct: { costPrice: null, sellPrice: null, commissionRate: null, inventory: null },
    });
    const result = resolvePricing(p);
    expect(result.costPrice).toBe(5000);
    expect(result.isCostMissing).toBe(false);
  });

  it('falls back to costCny * 190 when both costPrice are null', () => {
    const p = stubProduct({
      costCny: decimal(10),
      masterProduct: { costPrice: null, sellPrice: null, commissionRate: null, inventory: null },
    });
    const result = resolvePricing(p);
    expect(result.costPrice).toBe(1900);
    expect(result.isCostMissing).toBe(false);
  });

  it('returns 0 and isCostMissing=true when all cost sources are null', () => {
    const p = stubProduct();
    const result = resolvePricing(p);
    expect(result.costPrice).toBe(0);
    expect(result.isCostMissing).toBe(true);
  });

  it('returns costPrice=0 when masterProduct.costPrice is explicitly 0', () => {
    const p = stubProduct({
      costPrice: 5000,
      masterProduct: { costPrice: 0, sellPrice: null, commissionRate: null, inventory: null },
    });
    const result = resolvePricing(p);
    // costPrice 0 is falsy but ?? treats it as non-nullish
    expect(result.costPrice).toBe(0);
  });

  it('prefers product.sellPrice over masterProduct.sellPrice', () => {
    const p = stubProduct({
      sellPrice: 15000,
      masterProduct: { costPrice: null, sellPrice: 20000, commissionRate: null, inventory: null },
    });
    const result = resolvePricing(p);
    expect(result.sellPrice).toBe(15000);
  });

  it('falls back to masterProduct.sellPrice when product.sellPrice is null', () => {
    const p = stubProduct({
      sellPrice: null,
      masterProduct: { costPrice: null, sellPrice: 20000, commissionRate: null, inventory: null },
    });
    const result = resolvePricing(p);
    expect(result.sellPrice).toBe(20000);
  });

  it('resolves commissionRate from masterProduct first', () => {
    const p = stubProduct({
      commissionRate: decimal(0.108),
      masterProduct: { costPrice: null, sellPrice: null, commissionRate: decimal(0.15), inventory: null },
    });
    const result = resolvePricing(p);
    expect(result.commissionRate).toBeCloseTo(0.15);
  });

  it('falls back to product.commissionRate when masterProduct has none', () => {
    const p = stubProduct({
      commissionRate: decimal(0.108),
    });
    const result = resolvePricing(p);
    expect(result.commissionRate).toBeCloseTo(0.108);
  });

  it('returns commissionRate 0 when neither has it', () => {
    const p = stubProduct();
    const result = resolvePricing(p);
    expect(result.commissionRate).toBe(0);
  });
});

describe('resolveInventory', () => {
  it('prefers masterInventory.currentStock', () => {
    const p = stubProduct({
      inventory: { currentStock: 10, safetyStock: 5, reorderPoint: 3 },
      masterProduct: { costPrice: null, sellPrice: null, commissionRate: null, inventory: { currentStock: 50, safetyStock: 20 } },
    });
    const result = resolveInventory(p);
    expect(result.currentStock).toBe(50);
    expect(result.safetyStock).toBe(20);
    expect(result.reorderPoint).toBe(3); // always from Product.Inventory
  });

  it('falls back to product inventory when masterInventory is null', () => {
    const p = stubProduct({
      inventory: { currentStock: 10, safetyStock: 5, reorderPoint: 3 },
    });
    const result = resolveInventory(p);
    expect(result.currentStock).toBe(10);
    expect(result.safetyStock).toBe(5);
    expect(result.reorderPoint).toBe(3);
  });
});
