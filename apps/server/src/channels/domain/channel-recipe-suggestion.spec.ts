import { describe, expect, it } from 'vitest';
import {
  classifyChannelRecipeSuggestion,
  inferRecipeQuantity,
  isBarcodeEvidenceNameCompatible,
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

describe('inferRecipeQuantity', () => {
  it.each([
    ['퓨어 클리어 슬라임 투명 9개 x 150g', 9],
    ['KY I&D 할로윈호박열쇠고리24개입 40*35mm 주황', 24],
    ['논노 베이커리 주물럭 말랑이 랜덤발송 8개 75g', 8],
    ['감자빵 말랑이 노랑 6개 75g', 6],
    ['KY I&D 색칠하는에어글라이더5개입 49 x 46 cm', 5],
    ['손에 묻지않는 크레파스 1개 24색', 1],
  ])('does not treat physical measures or decimal prefixes as pack multipliers: %s',
    (title, quantity) => {
      expect(inferRecipeQuantity([title])).toBe(quantity);
    });

  it('returns null when explicit pack quantities disagree', () => {
    expect(inferRecipeQuantity(['상품 2개입', '옵션 3개입'])).toBeNull();
  });

  it('distinguishes an explicit single unit from an unspecified selling unit', () => {
    expect(inferRecipeQuantity(['키즈 식판 단품'])).toBe(1);
    expect(inferRecipeQuantity(['키즈 식판'])).toBeNull();
    expect(inferRecipeQuantity(['1.5개입'])).toBeNull();
  });
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

  /**
   * 몰 상품코드 칸(사방넷 모델명 · 몰 자체코드)의 셀피아 코드가 맞으면 셀피아는 주문 하나에 그 코드 하나를 뺀다 — 제목에
   * 묶음 수가 없거나 어긋나도 1개로 잇는다(사장님 2026-09-19 "코드가 맞으면 1개로 잇는다").
   */
  it('⭐ auto-applies an exact seller SKU code as one unit when the title has no selling-unit evidence', () => {
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

  it('uses one unit for an exact seller SKU code even when title pack counts disagree', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{
        channelListingOptionId: '00000000-0000-4000-8000-000000000001',
        listingName: '플라잉 캐치 프로펠라 1p 프로펠라3p 줄을 잡아 당겨요',
        itemName: null,
        sellerSku: '10074-1',
        modelNumber: null,
        barcode: null,
      }],
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: '10074-1', sku: sku({ code: '10074-1', name: '5000플라잉캐치프로펠라' }) }],
    }));
    expect(result.automationDecision).toBe('auto_apply');
    expect(result.recommendedQuantity).toBe(1);
  });

  it('keeps a model-number code without selling-unit evidence under quantity review', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{ kind: 'model_number_code', channelValue: 'SP-001', sku: sku() }],
    }));
    expect(result.status).toBe('quantity_review');
    expect(result.recommendedQuantity).toBeNull();
  });

  /**
   * 몰 제목은 셀피아 이름에 설명을 덧붙인 것이 많아 이름 점수가 낮다. 셀피아 이름이 제목 안에 그대로 있으면 같은 상품이고,
   * 전혀 다른 이름이면 잘못 적힌 코드라 사람이 본다(라이브 2026-09-19: 플라잉 팽이에 머그컵 키링 코드).
   */
  it('trusts a seller SKU code whose Sellpia name sits inside the title, but reviews an unrelated one', () => {
    const contained = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{
        kind: 'seller_sku_code',
        channelValue: '10227-1',
        nameCompatibilityScore: 0.31,
        skuNameInTitle: true,
        sku: sku({ code: '10227-1', name: '3000톡톡팝콘플레이' }),
      }],
    }));
    expect(contained.status).toBe('unique_code');
    expect(contained.automationDecision).toBe('auto_apply');

    const unrelated = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{
        kind: 'seller_sku_code',
        channelValue: '10406-1',
        nameCompatibilityScore: 0,
        skuNameInTitle: false,
        sku: sku({ code: '10406-1', name: '2500머그컵딸깍키링' }),
      }],
    }));
    expect(unrelated.status).toBe('identifier_name_mismatch');
    expect(unrelated.automationDecision).toBe('operator_review');
  });

  it('infers the deduction quantity from matching pack-like title text', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '2개 세트' }],
      codeEvidence: [{
        kind: 'model_number_code',
        channelValue: 'SP-001',
        sku: sku({ name: '키즈 식판 2개 세트' }),
      }],
    }));
    expect(result.status).toBe('unique_code');
    expect(result.automationDecision).toBe('auto_apply');
    expect(result.recommendedQuantity).toBe(2);
  });

  it('derives a component ratio from title numbers', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 10개입' }],
      codeEvidence: [{
        kind: 'seller_sku_code',
        channelValue: 'SP-001',
        sku: sku({ name: '키즈 식판 5개입' }),
      }],
    }));
    expect(result.status).toBe('unique_code');
    expect(result.automationDecision).toBe('auto_apply');
    expect(result.recommendedQuantity).toBe(10);
  });

  it('uses a multi-unit channel pack as the deduction quantity when the Sellpia unit has no pack evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 10개입' }],
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));
    expect(result.status).toBe('unique_code');
    expect(result.automationDecision).toBe('auto_apply');
    expect(result.recommendedQuantity).toBe(10);
  });

  it('requires quantity review for a unique barcode without selling-unit evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        sku: sku(),
      }],
    }));
    expect(result).toMatchObject({
      status: 'quantity_review',
      automationDecision: 'quantity_review',
      recommendedQuantity: null,
    });
  });

  it.each([
    [0.35, true],
    [0.349, false],
  ])('applies the barcode/name admissibility boundary at %s', (score, expected) => {
    expect(isBarcodeEvidenceNameCompatible(score)).toBe(expected);
  });

  it('keeps a mismatched typed barcode as unresolved review evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        nameCompatibilityScore: 0,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
          code: 'SP-002',
          name: '전혀 다른 상품',
        }),
      }],
      similarityEvidence: [{
        kind: 'normalized_name',
        channelValue: '키즈 식판',
        normalizedValue: '키즈식판',
        score: 1,
        sku: sku(),
      }],
    }));

    expect(result).toMatchObject({
      status: 'identifier_name_mismatch',
      automationDecision: 'operator_review',
    });
    expect(result.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ sellpiaInventorySkuId: sku().sellpiaInventorySkuId }),
      expect.objectContaining({
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
      }),
    ]));
  });

  it('keeps a rejected barcode conflict with a valid code under review', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{
        kind: 'seller_sku_code',
        channelValue: 'SP-001',
        sku: sku(),
      }],
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        nameCompatibilityScore: 0.349,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000102',
          code: 'SP-002',
          name: '전혀 다른 상품',
        }),
      }],
    }));

    expect(result).toMatchObject({
      status: 'identifier_name_mismatch',
      automationDecision: 'operator_review',
    });
  });

  it('blocks a valid code and valid barcode that resolve to different SKUs', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{
        kind: 'seller_sku_code',
        channelValue: 'SP-001',
        sku: sku(),
      }],
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        nameCompatibilityScore: 0.35,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-0000-0000-000000000102',
          code: 'SP-002',
        }),
      }],
    }));

    expect(result.status).toBe('conflict');
    expect(result.automationDecision).toBe('blocked');
  });

  it('does not discard a rejected barcode that conflicts with a manual alias', () => {
    const result = classifyChannelRecipeSuggestion(input({
      manualMatchEvidence: [{
        channelValue: '키즈 식판',
        normalizedValue: '키즈식판',
        quantity: 1,
        sku: sku(),
      }],
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        nameCompatibilityScore: 0,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-0000-0000-000000000102',
          code: 'SP-002',
          name: '전혀 다른 상품',
        }),
      }],
    }));

    expect(result).toMatchObject({
      status: 'identifier_name_mismatch',
      automationDecision: 'operator_review',
      recommendedQuantity: null,
    });
  });

  it('preserves an existing recipe when barcode evidence is rejected', () => {
    const result = classifyChannelRecipeSuggestion(input({
      existingComponents: [{
        sellpiaInventorySkuId: sku().sellpiaInventorySkuId,
        code: sku().code,
        quantity: 2,
        source: 'manual',
        confirmedBy: '00000000-0000-4000-8000-000000000201',
        confirmedAt: '2026-07-18T00:00:00.000Z',
      }],
      barcodeEvidence: [{
        kind: 'unique_physical_barcode',
        channelValue: '001234567890',
        normalizedValue: '001234567890',
        nameCompatibilityScore: 0,
        sku: sku({
          sellpiaInventorySkuId: '00000000-0000-0000-0000-000000000102',
          code: 'SP-002',
          name: '전혀 다른 상품',
        }),
      }],
    }));

    expect(result.status).toBe('already_configured');
    expect(result.automationDecision).toBe('already_configured');
    expect(result.existingComponents).toHaveLength(1);
    expect(result.proposals).toEqual([]);
  });

  it('auto-applies one strict unique normalized product-and-option pair', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 1개' }],
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

  it('keeps an exact normalized product name under review when quantity is unknown', () => {
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
    expect(result.status).toBe('quantity_review');
    expect(result.automationDecision).toBe('quantity_review');
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

  it('auto-applies one unique exact normalized product name with explicit single-unit evidence', () => {
    const nameOnly = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '단품' }],
      similarityEvidence: [{
        kind: 'normalized_name',
        channelValue: '키즈 식판 단품',
        normalizedValue: '키즈식판',
        score: 1,
        sku: sku(),
      }],
    }));
    expect(nameOnly.status).toBe('high_confidence_name');
    expect(nameOnly.automationDecision).toBe('auto_apply');
    expect(nameOnly.recommendedQuantity).toBe(1);
    expect(nameOnly.proposals[0]?.evidence[0]?.kind).toBe('normalized_name');
  });

  it('auto-applies one unique contained or high-confidence fuzzy name candidate with known quantity', () => {
    const contained = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '단품' }],
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
          score: 0.5,
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
      options: [{ ...input().options[0], itemName: '단품' }],
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

  it('keeps duplicate normalized-name SKUs for operator review', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '단품' }],
      similarityEvidence: [
        {
          kind: 'normalized_name', channelValue: '키즈 식판 단품',
          normalizedValue: '키즈식판', score: 1, sku: sku(),
        },
        {
          kind: 'normalized_name', channelValue: '키즈 식판 단품',
          normalizedValue: '키즈식판', score: 1,
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

  it('keeps an explicit color or option disagreement for operator review', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '블루 단품' }],
      nameEvidence: [{
        channelValue: '키즈 식판',
        normalizedValue: '키즈식판',
        sku: sku({ optionName: '핑크' }),
      }],
      similarityEvidence: [{
        kind: 'fuzzy_name',
        channelValue: '키즈 식판 블루 단품',
        normalizedValue: '키즈식판블루',
        score: 0.9,
        sku: sku({ optionName: '핑크' }),
      }],
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

  it('⭐ 이름이 글자까지 같고 묶음 표기가 없으면 낱개 하나다 (KID-246, 사장님 2026-09-17)', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{
        channelListingOptionId: '00000000-0000-4000-8000-000000000001',
        listingName: '[키드아이템] 병아리스마트만능패드',
        itemName: '병아리스마트만능패드',
        sellerSku: null,
        modelNumber: null,
        barcode: null,
      }],
      similarityEvidence: [{
        kind: 'normalized_name',
        channelValue: '병아리스마트만능패드',
        normalizedValue: '병아리스마트만능패드',
        score: 1,
        sku: sku({ code: '8619-1', name: '병아리스마트만능패드' }),
      }],
    }));
    expect(result.automationDecision).toBe('auto_apply');
    expect(result.recommendedQuantity).toBe(1);
  });

  it('묶음 표기가 있으면 그 수를 쓴다 — 낱개로 접지 않는다', () => {
    const packed = classifyChannelRecipeSuggestion(input({
      options: [{
        channelListingOptionId: '00000000-0000-4000-8000-000000000001',
        listingName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
        itemName: '스크림가면',
        sellerSku: null,
        modelNumber: null,
        barcode: null,
      }],
      similarityEvidence: [{
        kind: 'normalized_name',
        channelValue: '스크림가면',
        normalizedValue: '스크림가면',
        score: 1,
        sku: sku({ code: '792-1', name: '스크림가면' }),
      }],
    }));
    expect(packed.recommendedQuantity).toBe(12);
  });

  it('묶음 표기가 서로 어긋나면 낱개로 접지 않는다', () => {
    const conflicting = classifyChannelRecipeSuggestion(input({
      options: [{
        channelListingOptionId: '00000000-0000-4000-8000-000000000001',
        listingName: '스크림가면 2개입',
        itemName: '스크림가면 5개',
        sellerSku: null,
        modelNumber: null,
        barcode: null,
      }],
      similarityEvidence: [{
        kind: 'normalized_name',
        channelValue: '스크림가면',
        normalizedValue: '스크림가면',
        score: 1,
        sku: sku({ code: '792-1', name: '스크림가면' }),
      }],
    }));
    expect(conflicting.automationDecision).toBe('quantity_review');
  });

  it('이름이 정확히 같지 않은 후보(유사)는 낱개로 접지 않는다', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{
        channelListingOptionId: '00000000-0000-4000-8000-000000000001',
        listingName: '병아리 스마트 만능패드 대용량',
        itemName: '병아리스마트만능패드세트',
        sellerSku: null,
        modelNumber: null,
        barcode: null,
      }],
      similarityEvidence: [{
        kind: 'fuzzy_name',
        channelValue: '병아리스마트만능패드',
        normalizedValue: '병아리스마트만능패드',
        score: 0.9,
        sku: sku({ code: '8619-1', name: '병아리스마트만능패드' }),
      }],
    }));
    expect(result.automationDecision).toBe('quantity_review');
  });

});
