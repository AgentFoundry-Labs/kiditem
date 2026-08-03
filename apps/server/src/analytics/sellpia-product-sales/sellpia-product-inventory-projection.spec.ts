import { describe, expect, it } from 'vitest';
import {
  projectSellpiaProductInventory,
  resolveSellpiaProductInventoryRows,
} from './sellpia-product-inventory-projection';

const SKU_ID = '11111111-1111-4111-8111-111111111111';

describe('Sellpia product inventory projection', () => {
  it('aggregates duplicate sales rows by SKU and calculates depletion from available stock once', () => {
    const products = [
      product('row-1', 'SKU-1', [30, 30]),
      product('row-2', 'SKU-1', [20, 20]),
    ];
    const candidates = [{ id: SKU_ID, code: 'SKU-1', barcode: null, isActive: true }];
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);

    const result = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability: {
        snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{
          sellpiaInventorySkuId: SKU_ID,
          currentStock: 100,
          activeCommitmentQuantity: 80,
          availableStock: 20,
          isActive: true,
          generation: '12',
        }],
      },
      inventoryProducts: [inventoryProduct('A')],
      destinations: [{
        sellpiaInventorySkuId: SKU_ID,
        unitsPerSale: 1,
        masterProductId: '22222222-2222-4222-8222-222222222222',
        masterProductCode: 'MP-1',
        masterProductName: 'Product',
        channelListingOptionId: '33333333-3333-4333-8333-333333333333',
        channelListingId: '44444444-4444-4444-8444-444444444444',
        channel: 'coupang',
        externalOptionId: 'option-1',
        optionName: 'Variant',
        abcGrade: 'A',
        abcEvaluation: null,
        displayImage: null,
      }],
    });

    expect(resolved.matchedSkuIds).toEqual([SKU_ID]);
    const rowOne = result.byProductKey.get('row-1');
    expect(rowOne?.inventoryResolution.status).toBe('matched');
    if (rowOne?.inventoryResolution.status !== 'matched') {
      throw new Error('Expected a matched inventory resolution');
    }
    expect(rowOne.inventoryResolution.inventoryProduct).toEqual({
      masterProductId: '22222222-2222-4222-8222-222222222222',
      masterProductCode: 'MP-1',
      masterProductName: 'Product',
      abcGrade: 'A',
      abcEvaluation: null,
    });
    expect(result.byProductKey.get('row-1')).toMatchObject({
      inventoryResolution: {
        status: 'matched',
        currentStock: 100,
        activeCommitmentQuantity: 80,
        availableStock: 20,
        salesRowCount: 2,
        inventoryProduct: { masterProductId: '22222222-2222-4222-8222-222222222222', abcGrade: 'A' },
      },
      monthsOfAvailableStockLeft: 0.4,
      reorderPoint: 75,
      needsReorder: true,
    });
    expect(result.byProductKey.get('row-2')).toEqual(
      result.byProductKey.get('row-1'),
    );
    expect(result.summary).toMatchObject({
      reorderCount: 1,
      matchedSalesRows: 2,
      matchedSkus: 1,
      unlinkedSkus: 0,
      abcStatusCounts: { CALIBRATION_PENDING: 0 },
    });
  });

  it('keeps uncollected and mapping-required states out of reorder calculations', () => {
    const products = [product('missing', 'MISSING', [100, 100])];
    const resolved = resolveSellpiaProductInventoryRows(products, []);
    const result = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability: {
        snapshot: { collected: false, generation: null, verifiedAt: null },
        items: [],
      },
      inventoryProducts: [],
      destinations: [],
    });

    expect(result.byProductKey.get('missing')).toEqual({
      inventoryResolution: { status: 'not_collected' },
      monthsOfAvailableStockLeft: null,
      reorderPoint: null,
      needsReorder: false,
      deadStock: false,
      deadStockReason: null,
    });
    expect(result.summary.reorderCount).toBe(0);
  });

  it('keeps each matched destination attached to its own provider image', () => {
    const products = [product('row-1', 'SKU-1', [10, 10])];
    const resolved = resolveSellpiaProductInventoryRows(products, [
      { id: SKU_ID, code: 'SKU-1', barcode: null, isActive: true },
    ]);
    const result = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability: {
        snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{
          sellpiaInventorySkuId: SKU_ID,
          currentStock: 100,
          activeCommitmentQuantity: 0,
          availableStock: 100,
          isActive: true,
          generation: '12',
        }],
      },
      inventoryProducts: [inventoryProduct(null)],
      destinations: [
        destination('variant-1', 'https://cdn.example/one.jpg'),
        destination('variant-2', 'https://cdn.example/two.jpg'),
      ],
    });

    expect(result.byProductKey.get('row-1')?.inventoryResolution).toMatchObject({
      status: 'matched',
      destinations: [
        { channelListingOptionId: 'variant-1', abcGrade: null, displayImage: { url: 'https://cdn.example/one.jpg' } },
        { channelListingOptionId: 'variant-2', abcGrade: null, displayImage: { url: 'https://cdn.example/two.jpg' } },
      ],
    });
  });
});

function product(key: string, code: string, quantities: number[]) {
  return {
    key,
    evidence: { productCode: code, optionCode: '', barcode: null },
    completeMonthly: quantities.map((orderQty, index) => ({
      yearMonth: `2026-0${index + 5}`,
      orderQty,
    })),
  };
}

function inventoryProduct(abcGrade: 'A' | 'B' | 'C' | null) {
  return {
    sellpiaInventorySkuId: SKU_ID,
    masterProductId: '22222222-2222-4222-8222-222222222222',
    masterProductCode: 'MP-1',
    masterProductName: 'Product',
    abcGrade,
    abcEvaluation: null,
  };
}

function destination(channelListingOptionId: string, url: string) {
  return {
    sellpiaInventorySkuId: SKU_ID,
    unitsPerSale: 1,
    masterProductId: '22222222-2222-4222-8222-222222222222',
    masterProductCode: 'MP-1',
    masterProductName: 'Product',
    channelListingOptionId,
    channelListingId: '44444444-4444-4444-8444-444444444444',
    channel: 'coupang',
    externalOptionId: channelListingOptionId,
    optionName: channelListingOptionId,
    abcGrade: null,
    abcEvaluation: null,
    displayImage: {
      url,
      source: 'channel_catalog' as const,
      channel: 'coupang',
      channelListingId: '44444444-4444-4444-8444-444444444444',
      externalOptionId: 'option-1',
    },
  };
}
