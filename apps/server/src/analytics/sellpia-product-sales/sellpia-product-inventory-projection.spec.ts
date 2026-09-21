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
    const candidates = [{
      masterProductId: SKU_ID,
      code: 'KID00000001',
      sourceAccountKey: 'kiditem',
      sourceProductCode: 'SKU-1',
      sourceOptionCode: '',
      barcode: null,
    }];
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);

    const result = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability: {
        snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{
          masterProductId: SKU_ID,
          currentStock: 100,
          generation: '12',
        }],
      },
      inventoryProducts: [inventoryProduct()],
      destinations: [{
        unitsPerSale: 1,
        masterProductId: SKU_ID,
        masterProductCode: 'MP-1',
        masterProductName: 'Product',
        channelListingOptionId: '33333333-3333-4333-8333-333333333333',
        channelListingId: '44444444-4444-4444-8444-444444444444',
        channel: 'coupang',
        externalOptionId: 'option-1',
        optionName: 'Variant',
    abc: missingAbc(),
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
      masterProductId: SKU_ID,
      masterProductCode: 'MP-1',
      masterProductName: 'Product',
    abc: missingAbc(),
    });
    expect(result.byProductKey.get('row-1')).toMatchObject({
      inventoryResolution: {
        status: 'matched',
        currentStock: 100,
        salesRowCount: 2,
        inventoryProduct: { masterProductId: SKU_ID },
      },
      monthsOfAvailableStockLeft: 2,
      reorderPoint: 75,
      needsReorder: false,
    });
    expect(result.byProductKey.get('row-2')).toEqual(
      result.byProductKey.get('row-1'),
    );
    expect(result.summary).toMatchObject({
      reorderCount: 0,
      matchedSalesRows: 2,
      matchedSkus: 1,
      unlinkedSkus: 0,
      abcStatusCounts: { SELLPIA_SOURCE_STALE: 1 },
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
      monthlyOutflow: null,
      outflowMonthCount: 0,
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
      {
        masterProductId: SKU_ID,
        code: 'KID00000001',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SKU-1',
        sourceOptionCode: '',
        barcode: null,
      },
    ]);
    const result = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability: {
        snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{
          masterProductId: SKU_ID,
          currentStock: 100,
          generation: '12',
        }],
      },
      inventoryProducts: [inventoryProduct()],
      destinations: [
        destination('variant-1', 'https://cdn.example/one.jpg'),
        destination('variant-2', 'https://cdn.example/two.jpg'),
      ],
    });

    expect(result.byProductKey.get('row-1')?.inventoryResolution).toMatchObject({
      status: 'matched',
      destinations: [
        { channelListingOptionId: 'variant-1', displayImage: { url: 'https://cdn.example/one.jpg' } },
        { channelListingOptionId: 'variant-2', displayImage: { url: 'https://cdn.example/two.jpg' } },
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

function inventoryProduct() {
  return {
    masterProductId: SKU_ID,
    masterProductCode: 'MP-1',
    masterProductName: 'Product',
    abc: missingAbc(),
  };
}

function destination(channelListingOptionId: string, url: string) {
  return {
    masterProductId: SKU_ID,
    unitsPerSale: 1,
    masterProductCode: 'MP-1',
    masterProductName: 'Product',
    channelListingOptionId,
    channelListingId: '44444444-4444-4444-8444-444444444444',
    channel: 'coupang',
    externalOptionId: channelListingOptionId,
    optionName: channelListingOptionId,
    abc: missingAbc(),
    displayImage: {
      url,
      source: 'channel_catalog' as const,
      channel: 'coupang',
      channelListingId: '44444444-4444-4444-8444-444444444444',
      externalOptionId: 'option-1',
    },
  };
}

function missingAbc(): import('@kiditem/shared/product-abc').ProductAbcReadModel {
  const source = {
    ready: false,
    requiredCutoff: '2026-09-12',
    actualCutoff: null,
    latestAttempt: null,
    latestComplete: null,
  };
  return {
    abcGrade: null,
    evaluation: null,
    formulaRevision: 0,
    publicationRevision: 0,
    officialCutoffDate: null,
    publishedAt: null,
    actualCutoffDate: null,
    sources: {
      sellpia: source,
      advertising: source,
      mapping: {
        valid: true,
        currentMappingGeneration: '0',
        evidenceMappingGeneration: '0',
      },
    },
  };
}
