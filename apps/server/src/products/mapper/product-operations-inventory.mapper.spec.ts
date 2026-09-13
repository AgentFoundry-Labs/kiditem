import { describe, expect, it } from 'vitest';
import { mapProductOperationsListItem } from './product-operations-inventory.mapper';
import type {
  ProductOperationsRepositoryListItem,
} from '../application/port/out/repository/product-operations.repository.port';

const SKU_ID = '11111111-1111-4111-8111-111111111111';

describe('product operations inventory mapper', () => {
  it('keeps physical stock visible and derives capacity from common available stock', () => {
    const result = mapProductOperationsListItem(
      rawListItem(),
      new Map([[SKU_ID, {
        sellpiaInventorySkuId: SKU_ID,
        currentStock: 100,
        availableStock: 100,
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
      inventoryUnits: 100,
      inventory: { skuCount: 1, measuredSkuCount: 1, inactiveSkuCount: 0 },
      depletion: { needsReorder: true },
      activeChannels: [{
        channelAccountId: '55555555-5555-4555-8555-555555555555',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
      }],
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

  it('keeps a missing published availability fact uncollected instead of zero', () => {
    const result = mapProductOperationsListItem(
      rawListItem(),
      new Map(),
      {
        coverage: 'no_direct_sales',
        needsReorder: false,
        reorderSkuCount: 0,
        minMonthsOfAvailableStockLeft: null,
      },
    );

    expect(result).toMatchObject({
      inventoryUnits: null,
      inventory: { skuCount: 1, measuredSkuCount: 0, inactiveSkuCount: 0 },
      channelOptionSummary: { configured: 0, warning: 1 },
    });
  });
});

function rawListItem(): ProductOperationsRepositoryListItem {
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
    abcCreatedAt: new Date('2026-07-17T00:00:00.000Z'),
    adBudgetLimit: null,
    isActive: true,
    isSelling: true,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelCount: 0,
    channelStatus: 'unlisted' as const,
    activeChannelProducts: [{
      channelAccountId: '55555555-5555-4555-8555-555555555555',
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
    }],
    traffic: null,
    visitorCount: null,
    viewCount: null,
    cartAddCount: null,
    orderCount: null,
    salesQuantity: null,
    salesAmount: null,
    adSpend: null,
    adSpendRate: null,
    metricsFreshness: {
      orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      traffic: {
        ready: false,
        coverageStartDate: null,
        coverageEndDate: null,
        capturedAt: null,
      },
      advertising: {
        ready: false,
        coverageStartDate: null,
        coverageEndDate: null,
        capturedAt: null,
      },
    },
    contributionMargin: null,
    contributionProfitVelocity30: null,
    inventorySkuIds: [SKU_ID],
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
