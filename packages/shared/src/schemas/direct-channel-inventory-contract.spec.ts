import { describe, expect, it } from 'vitest';
import { ChannelOptionMatchingQueueRowSchema } from './channel-product-matching';
import { MasterProductOperationsDetailSchema } from './product-operations';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const LISTING_ID = '00000000-0000-4000-8000-000000000002';
const OPTION_ID = '00000000-0000-4000-8000-000000000003';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000004';
const SKU_ID = '00000000-0000-4000-8000-000000000005';
const COMPONENT_ID = '00000000-0000-4000-8000-000000000006';
const OBSERVED_AT = '2026-08-03T00:00:00.000Z';

// This product is deliberately unclassified: the recipe assertions below are
// about option inventory, not ABC. `abc` is the read model that carries that
// unclassified state now that the grade no longer travels as a loose field.
const UNCLASSIFIED_ABC = {
  abcGrade: null,
  evaluation: null,
  formulaRevision: 0,
  publicationRevision: 0,
  officialCutoffDate: null,
  publishedAt: null,
  actualCutoffDate: null,
  sources: {
    sellpia: missingAbcSource(),
    advertising: missingAbcSource(),
    mapping: { valid: false, currentMappingGeneration: '0', evidenceMappingGeneration: null },
  },
};

function missingAbcSource() {
  return {
    ready: false,
    requiredCutoff: '2026-07-31',
    actualCutoff: null,
    latestAttempt: null,
    latestComplete: null,
  };
}

describe('direct channel inventory contracts', () => {
  it('models an option recipe directly without an operating ProductVariant', () => {
    const parsed = ChannelOptionMatchingQueueRowSchema.parse({
      channelAccount: { id: ACCOUNT_ID, channel: 'coupang', name: 'Wing' },
      listing: { id: LISTING_ID, externalId: 'P-001', masterProductId: PRODUCT_ID },
      option: {
        id: OPTION_ID,
        externalOptionId: 'S-001',
        itemName: '10개입',
        sellerSku: 'SP-001',
        barcode: null,
        updatedAt: OBSERVED_AT,
        inventoryComponents: [{
          id: COMPONENT_ID,
          sellpiaInventorySkuId: SKU_ID,
          code: 'SP-001',
          name: '문구세트',
          optionName: null,
          barcode: null,
          currentStock: 80,
          quantity: 10,
        }],
      },
      capacity: 8,
    });

    expect(parsed.option.inventoryComponents[0]).toMatchObject({
      sellpiaInventorySkuId: SKU_ID,
      quantity: 10,
    });
    expect('productVariantId' in parsed.option).toBe(false);
    expect('linkedVariant' in parsed).toBe(false);
    expect('recipeStatus' in parsed).toBe(false);
  });

  it('exposes channel options and their inventory recipes on product detail', () => {
    const detail = MasterProductOperationsDetailSchema.parse({
      id: PRODUCT_ID,
      code: 'KI-001',
      displayReference: { type: 'product_code', label: '상품 코드', value: 'KI-001' },
      name: '문구세트',
      description: null,
      category: null,
      brand: null,
      tags: [],
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: null,
      abcEvaluation: null,
      abc: UNCLASSIFIED_ABC,
      contribution: null,
      adBudgetLimit: null,
      isActive: true,
      createdAt: OBSERVED_AT,
      updatedAt: OBSERVED_AT,
      inventory: { skuCount: 1, measuredSkuCount: 1 },
      inventoryUnits: 80,
      channelListings: [{
        id: LISTING_ID,
        channelAccountId: ACCOUNT_ID,
        channel: 'coupang',
        channelAccountName: 'Wing',
        externalId: 'P-001',
        displayName: '문구세트',
        status: 'approved',
        isActive: true,
        options: [{
          id: OPTION_ID,
          externalOptionId: 'S-001',
          itemName: '10개입',
          sellerSku: 'SP-001',
          barcode: null,
          status: '판매중',
          isActive: true,
          capacity: 8,
          inventoryComponents: [{
            id: COMPONENT_ID,
            sellpiaInventorySkuId: SKU_ID,
            code: 'SP-001',
            name: '문구세트',
            optionName: null,
            barcode: null,
            currentStock: 80,
            quantity: 10,
          }],
        }],
      }],
    });

    expect(detail.channelListings[0]?.options[0]?.capacity).toBe(8);
    expect('variants' in detail).toBe(false);
  });
});
