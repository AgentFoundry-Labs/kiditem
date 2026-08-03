import { describe, expect, it } from 'vitest';
import { mapProductOperationsListItem } from './product-operations-inventory.mapper';

const SKU_ID = '11111111-1111-4111-8111-111111111111';

describe('product operations inventory mapper', () => {
  it('keeps physical stock visible and derives capacity from common available stock', () => {
    const result = mapProductOperationsListItem(
      rawListItem(),
      new Map([[SKU_ID, {
        sellpiaInventorySkuId: SKU_ID,
        currentStock: 100,
        activeCommitmentQuantity: 80,
        availableStock: 20,
        isActive: true,
        generation: '12',
      }]]),
      {
        coverage: 'ready',
        needsReorder: true,
        reorderSkuCount: 1,
        minMonthsOfAvailableStockLeft: 0.2,
      },
    );

    expect(result).toMatchObject({
      imageUrls: [],
      displayImageUrls: [],
      inventoryUnits: 20,
      inventoryStatus: 'sellable',
      depletion: { needsReorder: true },
      channelOptionSummary: { total: 1, active: 1, configured: 1, warning: 0 },
    });
    expect(result).not.toHaveProperty('variants');
  });

  it('initially mirrors direct product images into display images', () => {
    const result = mapProductOperationsListItem(
      { ...rawListItem(), imageUrls: ['https://cdn.example.com/operator.jpg'] },
      new Map(),
      {
        coverage: 'no_direct_sales',
        needsReorder: false,
        reorderSkuCount: 0,
        minMonthsOfAvailableStockLeft: null,
      },
    );

    expect(result).toMatchObject({
      imageUrls: ['https://cdn.example.com/operator.jpg'],
      displayImageUrls: ['https://cdn.example.com/operator.jpg'],
    });
    expect(result.displayImageUrls).not.toBe(result.imageUrls);
  });
});

function rawListItem() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'MP-1',
    displayReference: { type: 'product_code' as const, label: '상품 코드', value: 'MP-1' },
    name: 'Product',
    description: null,
    category: null,
    brand: null,
    tags: [],
    imageUrls: [],
    abcGrade: null,
    abcEvaluation: null,
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelCount: 0,
    channelStatus: 'unlisted' as const,
    traffic: null,
    orderCount: null,
    salesAmount: null,
    adSpend: null,
    profit: null,
    contributionMargin: null,
    contributionProfitVelocity30: null,
    inventoryOptions: [{
      id: '33333333-3333-4333-8333-333333333333',
      externalOptionId: 'OPTION-1',
      itemName: '기본 옵션',
      sellerSku: 'SKU-1',
      barcode: null,
      status: 'active',
      isActive: true,
      inventoryComponents: [{
        id: '44444444-4444-4444-8444-444444444444',
        sellpiaInventorySkuId: SKU_ID,
        code: 'SKU-1',
        name: 'Inventory',
        optionName: null,
        barcode: null,
        quantity: 1,
      }],
    }],
  };
}
