import { describe, expect, it } from 'vitest';
import {
  CreateMasterProductInputSchema,
  CreateProductVariantInputSchema,
  MasterProductOperationsDetailSchema,
  MasterProductOperationsListItemSchema,
  MasterProductOperationsListQuerySchema,
  MasterProductOperationsListResponseSchema,
  ProductDepletionProjectionSchema,
  ProductInventoryStatusSchema,
  ProductRecipeComponentCandidateListResponseSchema,
  ProductRecipeComponentCandidateQuerySchema,
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

  it('strictly parses focused physical recipe component candidates', () => {
    expect(ProductRecipeComponentCandidateQuerySchema.parse({
      search: '  SP-001  ',
      limit: 20,
    })).toEqual({ search: 'SP-001', limit: 20 });
    expect(() => ProductRecipeComponentCandidateQuerySchema.parse({
      search: 'x',
      organizationId: productId,
    })).toThrow();

    expect(ProductRecipeComponentCandidateListResponseSchema.parse({
      items: [{
        sellpiaInventorySkuId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: '분홍',
        barcode: '8800000000001',
        currentStock: 8,
      }],
    }).items[0]).toMatchObject({
      sellpiaInventorySkuId: skuId,
      currentStock: 8,
    });
  });

  it('parses nullable product-operation metrics separately from physical inventory units', () => {
    const parsed = MasterProductOperationsListItemSchema.parse({
      id: productId,
      code: 'KI-001',
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: 'KI-001',
      },
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
      depletion: {
        coverage: 'shared',
        needsReorder: true,
        reorderSkuCount: 2,
        minMonthsOfAvailableStockLeft: 0.5,
      },
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
    const response = MasterProductOperationsListResponseSchema.parse({
      items: [parsed],
      total: 80,
      page: 1,
      limit: 1,
      summary: {
        abcGradeCounts: { A: 23, B: 17, C: 40 },
        channelConnectionCounts: { connected: 71, unconnected: 9 },
        inventoryStatusCounts: {
          sellable: 41,
          partial_out_of_stock: 8,
          out_of_stock: 7,
          configuration_required: 19,
          review_required: 5,
        },
        negativeProfitCount: 6,
        reorderProductCount: 12,
        depletionCoveredProductCount: 54,
        sharedDepletionProductCount: 7,
      },
    });
    expect(response.summary.abcGradeCounts.A).toBe(23);
    expect(response.summary.channelConnectionCounts.connected).toBe(71);
    expect(response.summary.inventoryStatusCounts.out_of_stock).toBe(7);
    expect(response.summary.negativeProfitCount).toBe(6);
    expect(response.items[0]?.abcGrade).toBe('A');
    expect(response.items[0]?.depletion.coverage).toBe('shared');
  });

  it('keeps depletion coverage separate from manual operating metadata', () => {
    expect(ProductDepletionProjectionSchema.parse({
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    })).toEqual({
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    });
  });

  it('parses detail variants with central components, capacity, and warnings', () => {
    const detail = MasterProductOperationsDetailSchema.parse({
      id: productId,
      code: 'KI-001',
      displayReference: {
        type: 'channel_product',
        label: 'Coupang Wing 상품번호',
        value: '13712531060',
      },
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
        displayReference: {
          type: 'product_variant_code',
          label: '옵션 코드',
          value: 'KI-001-DEFAULT',
        },
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
          activeCommitmentQuantity: 16,
          availableStock: 64,
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
    expect(detail.displayReference.value).toBe('13712531060');
  });

  it('rejects inconsistent component availability in product detail', () => {
    expect(() => MasterProductOperationsDetailSchema.parse({
      id: productId,
      code: 'KI-001',
      displayReference: { type: 'product_code', label: '상품 코드', value: 'KI-001' },
      name: '키즈 식판',
      description: null,
      category: null,
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
      channelListings: [],
      variants: [{
        id: variantId,
        code: 'KI-001-DEFAULT',
        displayReference: {
          type: 'product_variant_code',
          label: '옵션 코드',
          value: 'KI-001-DEFAULT',
        },
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
          activeCommitmentQuantity: 16,
          availableStock: 80,
          isActive: true,
          quantity: 8,
          source: 'manual',
          confirmedBy: null,
          confirmedAt: '2026-07-16T00:00:00.000Z',
        }],
      }],
    })).toThrow(/availableStock/i);
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
      expectedRecipe: [],
    }).components).toHaveLength(1);
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: [],
    })).toThrow();
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: [{ sellpiaInventorySkuId: skuId, quantity: 0 }],
      expectedRecipe: [],
    })).toThrow();
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: Array.from({ length: 51 }, (_, index) => ({
        sellpiaInventorySkuId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        quantity: 1,
      })),
      expectedRecipe: [],
    })).toThrow();
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: [
        { sellpiaInventorySkuId: skuId, quantity: 1 },
        { sellpiaInventorySkuId: skuId, quantity: 2 },
      ],
      expectedRecipe: [],
    })).toThrow();
    expect(() => ReplaceProductVariantRecipeInputSchema.parse({
      components: [{ sellpiaInventorySkuId: skuId, quantity: 1 }],
      expectedRecipe: [{
        id: '00000000-0000-4000-8000-000000000006',
        sellpiaInventorySkuId: skuId,
        quantity: 1,
        source: 'manual',
        confirmedBy: null,
        confirmedAt: 'not-a-date',
      }],
    })).toThrow();
  });
});
