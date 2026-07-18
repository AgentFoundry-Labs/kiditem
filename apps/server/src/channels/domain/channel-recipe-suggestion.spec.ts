import { describe, expect, it } from 'vitest';
import {
  classifyChannelRecipeSuggestion,
  type ChannelRecipeSuggestionInput,
} from './channel-recipe-suggestion';

const sku = (overrides: Partial<ChannelRecipeSuggestionInput['codeEvidence'][number]['sku']> = {}) => ({
  sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
  code: 'SP-001',
  name: '키즈 식판',
  optionName: null,
  currentStock: 7,
  ...overrides,
});

const input = (overrides: Partial<ChannelRecipeSuggestionInput> = {}): ChannelRecipeSuggestionInput => ({
  channelListingOptionId: '00000000-0000-4000-8000-000000000001',
  productVariantId: '00000000-0000-4000-8000-000000000002',
  masterProductId: '00000000-0000-4000-8000-000000000003',
  options: [{
    channelListingOptionId: '00000000-0000-4000-8000-000000000001',
    listingName: '키즈 식판',
    itemName: '기본',
    sellerSku: null,
    modelNumber: null,
    barcode: null,
  }],
  existingComponents: [],
  codeEvidence: [],
  barcodeEvidence: [],
  nameOptionEvidence: [],
  nameEvidence: [],
  ...overrides,
});

describe('classifyChannelRecipeSuggestion', () => {
  it('preserves an existing recipe over all evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      existingComponents: [{
        sellpiaInventorySkuId: sku().sellpiaInventorySkuId,
        code: 'SP-001',
        quantity: 2,
        source: 'manual',
        confirmedBy: '00000000-0000-4000-8000-000000000201',
        confirmedAt: '2026-07-18T00:00:00.000Z',
      }],
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));

    expect(result.status).toBe('already_configured');
    expect(result.automationDecision).toBe('already_configured');
    expect(result.proposals).toEqual([]);
  });

  it('auto-applies one exact seller SKU candidate with quantity one', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));

    expect(result.status).toBe('unique_code');
    expect(result.automationDecision).toBe('auto_apply');
    expect(result.recommendedQuantity).toBe(1);
    expect(result.proposals).toEqual([expect.objectContaining({
      sellpiaInventorySkuId: sku().sellpiaInventorySkuId,
      requiresQuantityConfirmation: false,
      recommendedQuantity: 1,
      evidence: [{
        kind: 'seller_sku_code',
        channelValue: 'SP-001',
        normalizedValue: 'SP-001',
      }],
    })]);
  });

  it('requires quantity review when exact code evidence accompanies set language', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '2개 세트' }],
      codeEvidence: [{ kind: 'model_number_code', channelValue: 'SP-001', sku: sku() }],
    }));
    expect(result.status).toBe('quantity_review');
    expect(result.automationDecision).toBe('operator_review');
    expect(result.recommendedQuantity).toBeNull();
  });

  it('recognizes Korean pack quantities without relying on an ASCII word boundary', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 4개입' }],
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));
    expect(result.status).toBe('quantity_review');
  });

  it('auto-applies one unique physical barcode candidate', () => {
    const result = classifyChannelRecipeSuggestion(input({
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        sku: sku(),
      }],
    }));
    expect(result).toMatchObject({
      status: 'unique_barcode',
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
    });
  });

  it('auto-applies one strict unique normalized product-and-option pair', () => {
    const result = classifyChannelRecipeSuggestion(input({
      nameOptionEvidence: [{
        productValue: ' 키즈 식판 ',
        optionValue: '블루 1개',
        normalizedProductValue: '키즈식판',
        normalizedOptionValue: '블루1개',
        sku: sku({ optionName: '블루 1개' }),
      }],
    }));
    expect(result).toMatchObject({
      status: 'exact_name_option',
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
    });
  });

  it('auto-applies an exact normalized product name when both sides have no option', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: null }],
      nameOptionEvidence: [{
        productValue: '키즈 식판',
        optionValue: null,
        normalizedProductValue: '키즈식판',
        normalizedOptionValue: null,
        sku: sku(),
      }],
    }));
    expect(result.status).toBe('exact_name_option');
    expect(result.automationDecision).toBe('auto_apply');
  });

  it('reports seller SKU and model-number identifiers resolving to different Sellpia SKUs', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], sellerSku: 'SP-001', modelNumber: 'SP-002' }],
      codeEvidence: [
        { kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() },
        { kind: 'model_number_code', channelValue: 'SP-002', sku: sku({ sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102', code: 'SP-002' }) },
      ],
    }));
    expect(result.status).toBe('conflict');
    expect(result.automationDecision).toBe('blocked');
  });

  it('reports conflicts across multiple channel options linked to one variant', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [
        { ...input().options[0], sellerSku: 'SP-001' },
        { ...input().options[0], channelListingOptionId: '00000000-0000-4000-8000-000000000004', modelNumber: 'SP-002' },
      ],
      codeEvidence: [
        { kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() },
        { kind: 'model_number_code', channelValue: 'SP-002', sku: sku({ sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102', code: 'SP-002' }) },
      ],
    }));
    expect(result.status).toBe('conflict');
  });

  it('reports an identifier that maps to multiple Sellpia rows as ambiguous', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [
        { kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() },
        { kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku({ sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102' }) },
      ],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.automationDecision).toBe('blocked');
  });

  it('blocks duplicate barcodes and exact name duplicates', () => {
    const secondSku = sku({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
      code: 'SP-002',
    });
    const barcode = classifyChannelRecipeSuggestion(input({
      barcodeEvidence: [
        { kind: 'unique_physical_barcode', channelValue: '001234567890', normalizedValue: '001234567890', sku: sku() },
        { kind: 'unique_physical_barcode', channelValue: '001234567890', normalizedValue: '001234567890', sku: secondSku },
      ],
    }));
    expect(barcode.status).toBe('ambiguous');
    expect(barcode.automationDecision).toBe('blocked');

    const name = classifyChannelRecipeSuggestion(input({
      nameOptionEvidence: [
        { productValue: '키즈 식판', optionValue: null, normalizedProductValue: '키즈식판', normalizedOptionValue: null, sku: sku() },
        { productValue: '키즈 식판', optionValue: null, normalizedProductValue: '키즈식판', normalizedOptionValue: null, sku: secondSku },
      ],
    }));
    expect(name.status).toBe('ambiguous');
    expect(name.automationDecision).toBe('blocked');
  });

  it('blocks cross-signal disagreement', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
      nameOptionEvidence: [{
        productValue: '키즈 식판',
        optionValue: null,
        normalizedProductValue: '키즈식판',
        normalizedOptionValue: null,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
          code: 'SP-002',
        }),
      }],
    }));
    expect(result.status).toBe('conflict');
    expect(result.automationDecision).toBe('blocked');
  });

  it('keeps normalized-name evidence review-only and returns no-match without evidence', () => {
    const nameOnly = classifyChannelRecipeSuggestion(input({
      nameEvidence: [{ channelValue: '키즈 식판', normalizedValue: '키즈식판', sku: sku() }],
    }));
    expect(nameOnly.status).toBe('name_review_only');
    expect(nameOnly.automationDecision).toBe('operator_review');
    expect(nameOnly.proposals[0]?.evidence[0]?.kind).toBe('normalized_name');

    expect(classifyChannelRecipeSuggestion(input())).toMatchObject({
      status: 'no_match',
      automationDecision: 'blocked',
      recommendedQuantity: null,
    });
  });
});
