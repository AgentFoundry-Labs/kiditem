import { describe, expect, it } from 'vitest';
import {
  CreateMasterProductInputSchema,
  CreateProductVariantInputSchema,
  MasterProductOperationsDetailSchema,
  MasterProductOperationsListItemSchema,
  MasterProductOperationsListQuerySchema,
  ProductInventoryStatusSchema,
  ReplaceProductVariantRecipeInputSchema,
  UpdateMasterProductInputSchema,
  UpdateProductVariantInputSchema,
} from './product-operations';

const productId = '00000000-0000-4000-8000-000000000001';
const variantId = '00000000-0000-4000-8000-000000000002';
const skuId = '00000000-0000-4000-8000-000000000003';

describe('product operations contracts', () => {
  it('strictly parses the supported product list filters', () => {
    expect(MasterProductOperationsListQuerySchema.parse({
      page: 2,
      limit: 25,
      query: '  식판  ',
      periodDays: 14,
      category: '  주방  ',
      activeStatus: 'active',
      inventoryStatus: 'partial_out_of_stock',
      abcGrade: 'A',
      adStatus: 'active',
    })).toMatchObject({ query: '식판', category: '주방', periodDays: 14 });
    expect(() => MasterProductOperationsListQuerySchema.parse({
      organizationId: productId,
    })).toThrow();
    expect(() => MasterProductOperationsListQuerySchema.parse({ periodDays: 15 })).toThrow();
  });

  it('freezes the product inventory status vocabulary', () => {
    expect(ProductInventoryStatusSchema.options).toEqual([
      'sellable',
      'partial_out_of_stock',
      'out_of_stock',
      'configuration_required',
      'review_required',
    ]);
  });

  it('parses nullable product-operation metrics separately from physical inventory units', () => {
    const parsed = MasterProductOperationsListItemSchema.parse({
      id: productId,
      code: 'KI-001',
      name: '키즈 식판',
      description: null,
      category: '주방',
      brand: null,
      tags: ['식판'],
      imageUrls: [],
      abcGrade: 'A',
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      isActive: true,
      updatedAt: '2026-07-16T00:00:00.000Z',
      variantSummary: { total: 2, active: 2, configured: 1, warning: 1 },
      inventoryUnits: 80,
      inventoryStatus: 'configuration_required',
      channelCount: 2,
      channelStatus: 'partial',
      traffic: null,
      orderCount: null,
      salesAmount: null,
      adSpend: null,
      profit: null,
    });
    expect(parsed.inventoryUnits).toBe(80);
    expect(parsed.traffic).toBeNull();
  });

  it('parses detail variants with central components, capacity, and warnings', () => {
    const detail = MasterProductOperationsDetailSchema.parse({
      id: productId,
      code: 'KI-001',
      name: '키즈 식판',
      description: null,
      category: '주방',
      brand: null,
      tags: [],
      imageUrls: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      isActive: true,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      inventoryStatus: 'sellable',
      inventoryUnits: 80,
      channelListings: [{
        id: '00000000-0000-4000-8000-000000000004',
        channelAccountId: '00000000-0000-4000-8000-000000000005',
        channel: 'coupang',
        channelAccountName: 'Wing',
        externalId: 'P-001',
        displayName: '키즈 식판',
        status: 'approved',
        isActive: true,
      }],
      variants: [{
        id: variantId,
        code: 'KI-001-DEFAULT',
        name: '기본',
        optionLabel: null,
        isDefault: true,
        isActive: true,
        capacity: 10,
        warningState: 'none',
        components: [{
          id: '00000000-0000-4000-8000-000000000006',
          sellpiaInventorySkuId: skuId,
          code: 'SP-001',
          name: '식판',
          optionName: null,
          barcode: null,
          currentStock: 80,
          isActive: true,
          quantity: 8,
          source: 'manual',
          confirmedBy: null,
          confirmedAt: '2026-07-16T00:00:00.000Z',
        }],
      }],
    });
    expect(detail.variants[0]?.capacity).toBe(10);
    expect(detail.variants[0]?.components[0]?.sellpiaInventorySkuId).toBe(skuId);
  });

  it('enforces product and variant code normalization and mutation strictness', () => {
    expect(CreateMasterProductInputSchema.parse({
      code: '  KI-001  ',
      name: '  키즈 식판  ',
    })).toMatchObject({ code: 'KI-001', name: '키즈 식판' });
    expect(CreateMasterProductInputSchema.parse({ code: 'KI-001', name: '식판' }).variants)
      .toBeUndefined();
    expect(() => CreateMasterProductInputSchema.parse({
      code: 'KI-001',
      name: '식판',
      variants: [],
    })).toThrow();
    expect(() => CreateMasterProductInputSchema.parse({
      code: 'x'.repeat(101),
      name: '식판',
    })).toThrow();
    expect(() => CreateProductVariantInputSchema.parse({
      code: ' ',
      name: '기본',
    })).toThrow();
    expect(() => UpdateMasterProductInputSchema.parse({})).toThrow();
    expect(() => UpdateProductVariantInputSchema.parse({ unknown: true })).toThrow();
  });

  it('accepts only complete bounded recipes with positive integer quantities', () => {
    expect(ReplaceProductVariantRecipeInputSchema.parse({
      components: [{ sellpiaInventorySkuId: skuId, quantity: 2 }],
    }).components).toHaveLength(1);
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: [{ sellpiaInventorySkuId: skuId, quantity: 0 }],
    })).toThrow();
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: Array.from({ length: 51 }, (_, index) => ({
        sellpiaInventorySkuId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        quantity: 1,
      })),
    })).toThrow();
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: [
        { sellpiaInventorySkuId: skuId, quantity: 1 },
        { sellpiaInventorySkuId: skuId, quantity: 2 },
      ],
    })).toThrow();
  });
});
