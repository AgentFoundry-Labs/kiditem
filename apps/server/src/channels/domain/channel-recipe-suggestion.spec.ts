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
  similarityEvidence: [],
  manualMatchEvidence: [],
  ...overrides,
});

describe('classifyChannelRecipeSuggestion', () => {
  it('treats one exact manual-match alias as a completed product match with its stored quantity', () => {
    const result = classifyChannelRecipeSuggestion(input({
      manualMatchEvidence: [{
        channelValue: '크리스마스 아동양말 대 2개',
        normalizedValue: '크리스마스아동양말대2개',
        quantity: 2,
        sku: sku({ code: '6402-1', name: '크리스마스아동양말(대)' }),
      }],
    }));

    expect(result).toMatchObject({
      status: 'confirmed_manual_match_alias',
      automationDecision: 'auto_apply',
      recommendedQuantity: 2,
      proposals: [{
        code: '6402-1',
        requiresQuantityConfirmation: false,
        recommendedQuantity: 2,
      }],
    });
    expect(result.proposals[0]?.evidence[0]?.kind).toBe('sellpia_manual_match_alias');
  });

  it.each([
    ['18 개입', 18],
    ['5 개 묶음', 5],
    ['2개입 x 3세트', 6],
    ['3팩×2', 6],
    ['2 x 3개', 6],
    ['１＋１', 2],
    ['4종 세트', 4],
    ['3종 택1', 1],
  ])('auto-confirms explicit title quantity %s when Sellpia item_count agrees', (title, quantity) => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], listingName: `키즈 식판 ${title}` }],
      manualMatchEvidence: [{
        channelValue: `키즈 식판 ${title}`,
        normalizedValue: `키즈식판${title.replace(/\s/g, '')}`,
        quantity,
        sku: sku(),
      }],
    }));

    expect(result).toMatchObject({
      status: 'confirmed_manual_match_alias',
      automationDecision: 'auto_apply',
      recommendedQuantity: quantity,
    });
  });

  it('keeps contradictory combined title quantities under review', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], listingName: '키즈 식판 2개입 x 3세트' }],
      manualMatchEvidence: [{
        channelValue: '키즈 식판 2개입 x 3세트',
        normalizedValue: '키즈식판2개입x3세트',
        quantity: 5,
        sku: sku(),
      }],
    }));

    expect(result).toMatchObject({
      status: 'quantity_review',
      automationDecision: 'quantity_review',
      recommendedQuantity: null,
    });
  });

  it('keeps the product matched but separates a title and Sellpia quantity disagreement', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], listingName: '키즈 식판 18개입' }],
      manualMatchEvidence: [{
        channelValue: '키즈 식판 18개입',
        normalizedValue: '키즈식판18개입',
        quantity: 12,
        sku: sku(),
      }],
    }));

    expect(result).toMatchObject({
      status: 'quantity_review',
      automationDecision: 'quantity_review',
      recommendedQuantity: null,
      proposals: [{ requiresQuantityConfirmation: true }],
    });
  });

  it('keeps the product match while separating conflicting alias quantities for review', () => {
    const matchedSku = sku({ code: '6402-1', name: '크리스마스아동양말(대)' });
    const result = classifyChannelRecipeSuggestion(input({
      manualMatchEvidence: [
        {
          channelValue: '크리스마스 아동양말 대',
          normalizedValue: '크리스마스아동양말대',
          quantity: 1,
          sku: matchedSku,
        },
        {
          channelValue: '크리스마스 아동양말 대',
          normalizedValue: '크리스마스아동양말대',
          quantity: 2,
          sku: matchedSku,
        },
      ],
    }));

    expect(result).toMatchObject({
      status: 'quantity_review',
      automationDecision: 'quantity_review',
      recommendedQuantity: null,
      proposals: [{
        sellpiaInventorySkuId: matchedSku.sellpiaInventorySkuId,
        requiresQuantityConfirmation: true,
      }],
    });
  });

  it('blocks a manual-match product identity that conflicts with exact code evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
      manualMatchEvidence: [{
        channelValue: '다른 판매처 상품명',
        normalizedValue: '다른판매처상품명',
        quantity: 1,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
          code: 'SP-002',
        }),
      }],
    }));

    expect(result.status).toBe('conflict');
    expect(result.automationDecision).toBe('blocked');
  });

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

  it('does not infer quantity from matching pack-like title text', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '2개 세트' }],
      codeEvidence: [{
        kind: 'model_number_code',
        channelValue: 'SP-001',
        sku: sku({ name: '키즈 식판 2개 세트' }),
      }],
    }));
    expect(result.status).toBe('quantity_review');
    expect(result.automationDecision).toBe('quantity_review');
    expect(result.recommendedQuantity).toBeNull();
  });

  it('does not derive a component ratio from title numbers', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 10개입' }],
      codeEvidence: [{
        kind: 'seller_sku_code',
        channelValue: 'SP-001',
        sku: sku({ name: '키즈 식판 5개입' }),
      }],
    }));
    expect(result.status).toBe('quantity_review');
    expect(result.automationDecision).toBe('quantity_review');
    expect(result.recommendedQuantity).toBeNull();
  });

  it('keeps a multi-unit channel pack under review when the Sellpia unit has no pack evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 10개입' }],
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));
    expect(result.status).toBe('quantity_review');
    expect(result.recommendedQuantity).toBeNull();
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

  it('auto-applies one unique exact normalized product name', () => {
    const nameOnly = classifyChannelRecipeSuggestion(input({
      nameEvidence: [{ channelValue: '키즈 식판', normalizedValue: '키즈식판', sku: sku() }],
    }));
    expect(nameOnly.status).toBe('exact_name');
    expect(nameOnly.automationDecision).toBe('auto_apply');
    expect(nameOnly.recommendedQuantity).toBe(1);
    expect(nameOnly.proposals[0]?.evidence[0]?.kind).toBe('normalized_name');
  });

  it('auto-applies one unique contained or high-confidence fuzzy name candidate', () => {
    const contained = classifyChannelRecipeSuggestion(input({
      similarityEvidence: [
        {
          kind: 'contained_name',
          channelValue: '키즈 식판 어린이 식기',
          normalizedValue: '키즈식판어린이식기',
          score: 0.68,
          sku: sku(),
        },
        {
          kind: 'fuzzy_name',
          channelValue: '키즈 식판 어린이 식기',
          normalizedValue: '키즈식판어린이식기',
          score: 0.64,
          sku: sku({
            sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
            code: 'SP-002',
          }),
        },
      ],
    }));
    expect(contained).toMatchObject({
      status: 'high_confidence_name',
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
    });

    const fuzzy = classifyChannelRecipeSuggestion(input({
      similarityEvidence: [{
        kind: 'fuzzy_name',
        channelValue: '키즈 식판 블루',
        normalizedValue: '키즈식판블루',
        score: 0.86,
        sku: sku(),
      }],
    }));
    expect(fuzzy).toMatchObject({
      status: 'high_confidence_name',
      automationDecision: 'auto_apply',
    });
  });

  it('keeps close fuzzy candidates for operator review instead of guessing', () => {
    const result = classifyChannelRecipeSuggestion(input({
      similarityEvidence: [
        {
          kind: 'fuzzy_name', channelValue: '키즈 식판 블루',
          normalizedValue: '키즈식판블루', score: 0.86, sku: sku(),
        },
        {
          kind: 'fuzzy_name', channelValue: '키즈 식판 블루',
          normalizedValue: '키즈식판블루', score: 0.82,
          sku: sku({
            sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
            code: 'SP-002',
          }),
        },
      ],
    }));
    expect(result.status).toBe('name_review_only');
    expect(result.automationDecision).toBe('operator_review');
  });

  it('requires review when an exact identifier points to a name-incompatible SKU', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{
        kind: 'model_number_code',
        channelValue: 'SP-001',
        nameCompatibilityScore: 0.1,
        sku: sku({ name: '전혀 다른 상품' }),
      }],
    }));
    expect(result.status).toBe('identifier_name_mismatch');
    expect(result.automationDecision).toBe('operator_review');
  });

  it('returns no-match without evidence', () => {

    expect(classifyChannelRecipeSuggestion(input())).toMatchObject({
      status: 'no_match',
      automationDecision: 'blocked',
      recommendedQuantity: null,
    });
  });
});
