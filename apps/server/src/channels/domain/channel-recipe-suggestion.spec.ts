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
  }],
  existingComponents: [],
  codeEvidence: [],
  nameEvidence: [],
  ...overrides,
});

describe('classifyChannelRecipeSuggestion', () => {
  it('preserves an existing recipe over all evidence', () => {
    const result = classifyChannelRecipeSuggestion(input({
      existingComponents: [{ sellpiaInventorySkuId: sku().sellpiaInventorySkuId, code: 'SP-001', quantity: 2 }],
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));

    expect(result.status).toBe('already_configured');
    expect(result.proposals).toEqual([]);
  });

  it('marks one exact seller SKU candidate as a quantity-unconfirmed proposal', () => {
    const result = classifyChannelRecipeSuggestion(input({
      codeEvidence: [{ kind: 'seller_sku_code', channelValue: 'SP-001', sku: sku() }],
    }));

    expect(result.status).toBe('unique_code');
    expect(result.proposals).toEqual([expect.objectContaining({
      sellpiaInventorySkuId: sku().sellpiaInventorySkuId,
      requiresQuantityConfirmation: true,
      evidence: [expect.objectContaining({ kind: 'seller_sku_code' })],
    })]);
  });

  it('requires quantity review when exact code evidence accompanies set language', () => {
    const result = classifyChannelRecipeSuggestion(input({
      options: [{ ...input().options[0], itemName: '2개 세트' }],
      codeEvidence: [{ kind: 'model_number_code', channelValue: 'SP-001', sku: sku() }],
    }));
    expect(result.status).toBe('quantity_review');
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
  });

  it('keeps normalized-name evidence review-only and returns no-match without evidence', () => {
    const nameOnly = classifyChannelRecipeSuggestion(input({
      nameEvidence: [{ channelValue: '키즈 식판', normalizedValue: '키즈식판', sku: sku() }],
    }));
    expect(nameOnly.status).toBe('name_review_only');
    expect(nameOnly.proposals[0]?.evidence[0]?.kind).toBe('normalized_name');

    expect(classifyChannelRecipeSuggestion(input()).status).toBe('no_match');
  });
});
