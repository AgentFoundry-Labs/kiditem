import { describe, expect, it } from 'vitest';
import {
  ChannelMatchCandidateReasonSchema,
  ChannelOptionMatchingQueueRowSchema,
  ChannelProductMatchCandidateSchema,
  ChannelProductMatchingCountsSchema,
  ChannelProductMatchingQueueRowSchema,
  ChannelRecipeSuggestionResponseSchema,
  ChannelVariantMatchCandidateSchema,
  LinkChannelListingOptionInputSchema,
  LinkChannelListingProductInputSchema,
} from './channel-product-matching';

const listingId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const productId = '00000000-0000-4000-8000-000000000003';
const variantId = '00000000-0000-4000-8000-000000000004';

const evidence = {
  providerIdentity: null,
  code: 'KI-001',
  barcode: null,
  normalizedName: '키즈식판',
  aiExplanation: null,
  score: null,
};

const createOptionQueueRow = ({
  linked,
  recipeStatus,
  capacity,
}: {
  linked: boolean;
  recipeStatus: 'unmatched' | 'matched' | 'configuration_required' | 'review_required';
  capacity: number | null;
}) => ({
  channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
  listing: { id: listingId, externalId: 'P-001', masterProductId: productId },
  option: {
    id: optionId,
    externalOptionId: 'S-001',
    itemName: '기본',
    sellerSku: 'KI-001-DEFAULT',
    barcode: null,
    productVariantId: linked ? variantId : null,
    updatedAt: '2026-07-16T00:00:00.000Z',
  },
  linkedVariant: linked
    ? {
      id: variantId,
      masterProductId: productId,
      code: 'KI-001-DEFAULT',
      name: '기본',
      optionLabel: null,
    }
    : null,
  recipeStatus,
  capacity,
});

describe('channel product and variant matching contracts', () => {
  it('accepts a quantity-one automatic proposal and rejects incomplete automatic evidence', () => {
    const response = {
      channelListingOptionId: optionId,
      productVariantId: variantId,
      masterProductId: productId,
      status: 'unique_code',
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
      reason: 'One exact Sellpia code candidate was found',
      existingComponents: [],
      proposals: [{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
        code: 'SP-001', name: '키즈 식판', optionName: null, currentStock: 7,
        evidence: [{
          kind: 'seller_sku_code', channelValue: 'SP-001', normalizedValue: 'SP-001',
        }],
        requiresQuantityConfirmation: false,
        recommendedQuantity: 1,
      }],
    };
    expect(ChannelRecipeSuggestionResponseSchema.parse(response)).toEqual(response);
    expect(() => ChannelRecipeSuggestionResponseSchema.parse({
      ...response,
      recommendedQuantity: null,
      proposals: [{ ...response.proposals[0], recommendedQuantity: null }],
    })).toThrow();
    expect(() => ChannelRecipeSuggestionResponseSchema.parse({
      ...response,
      proposals: [{
        ...response.proposals[0],
        evidence: [{
          ...response.proposals[0].evidence[0],
          sellpiaInventorySkuId: response.proposals[0].sellpiaInventorySkuId,
        }],
      }],
    })).toThrow();
  });

  it('keeps review proposals quantity-unconfirmed and exposes configured source metadata', () => {
    const review = {
      channelListingOptionId: optionId,
      productVariantId: variantId,
      masterProductId: productId,
      status: 'quantity_review',
      automationDecision: 'operator_review',
      recommendedQuantity: null,
      reason: 'Pack quantity requires review',
      existingComponents: [],
      proposals: [{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
        code: 'SP-001', name: '키즈 식판', optionName: null, currentStock: 7,
        evidence: [{
          kind: 'model_number_code', channelValue: 'SP-001', normalizedValue: 'SP-001',
        }],
        requiresQuantityConfirmation: true,
        recommendedQuantity: null,
      }],
    };
    expect(ChannelRecipeSuggestionResponseSchema.parse(review)).toEqual(review);

    expect(ChannelRecipeSuggestionResponseSchema.parse({
      ...review,
      status: 'already_configured',
      automationDecision: 'already_configured',
      reason: 'Existing recipe components are preserved',
      existingComponents: [{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
        code: 'SP-001',
        quantity: 1,
        source: 'deterministic',
        confirmedBy: null,
        confirmedAt: '2026-07-18T00:00:00.000Z',
      }],
      proposals: [],
    }).existingComponents[0]?.source).toBe('deterministic');
  });
  it('freezes candidate reasons without treating suggestions as confirmation', () => {
    expect(ChannelMatchCandidateReasonSchema.options).toEqual([
      'existing_identity',
      'exact_code',
      'unique_barcode',
      'exact_normalized_name',
      'ai_suggestion',
      'manual_search',
    ]);
    expect(ChannelProductMatchCandidateSchema.parse({
      masterProductId: productId,
      code: 'KI-001',
      name: '키즈 식판',
      category: null,
      brand: null,
      reason: 'exact_normalized_name',
      evidence,
      rank: 1,
    })).toBeDefined();
    expect(() => ChannelProductMatchCandidateSchema.parse({
      masterProductId: productId,
      code: 'KI-001',
      name: '키즈 식판',
      category: null,
      brand: null,
      reason: 'ai_suggestion',
      evidence,
      rank: 1,
      confirmed: true,
    })).toThrow();
  });

  it('requires evidence on every variant candidate', () => {
    expect(ChannelVariantMatchCandidateSchema.parse({
      productVariantId: variantId,
      masterProductId: productId,
      code: 'KI-001-DEFAULT',
      name: '기본',
      optionLabel: null,
      reason: 'exact_code',
      evidence,
      rank: 1,
    })).toBeDefined();
    expect(() => ChannelVariantMatchCandidateSchema.parse({
      productVariantId: variantId,
      masterProductId: productId,
      code: 'KI-001-DEFAULT',
      name: '기본',
      optionLabel: null,
      reason: 'exact_code',
      rank: 1,
    })).toThrow();
    expect(() => ChannelVariantMatchCandidateSchema.parse({
      productVariantId: variantId,
      masterProductId: productId,
      code: 'KI-001-DEFAULT',
      name: '기본',
      optionLabel: null,
      reason: 'unique_barcode',
      evidence: {
        providerIdentity: null,
        code: null,
        barcode: null,
        normalizedName: null,
        aiExplanation: null,
        score: null,
      },
      rank: 1,
    })).toThrow();
    expect(() => ChannelVariantMatchCandidateSchema.parse({
      productVariantId: variantId,
      masterProductId: productId,
      code: 'KI-001-DEFAULT',
      name: '기본',
      optionLabel: null,
      reason: 'ai_suggestion',
      evidence,
      rank: 1,
    })).toThrow();
  });

  it('parses product-level and option-level queue rows independently', () => {
    expect(ChannelProductMatchingQueueRowSchema.parse({
      channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
      listing: {
        id: listingId,
        externalId: 'P-001',
        displayName: '키즈 식판',
        status: 'approved',
        masterProductId: productId,
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      linkedProduct: { id: productId, code: 'KI-001', name: '키즈 식판' },
      optionCount: 1,
      linkedOptionCount: 0,
    }).listing.masterProductId).toBe(productId);

    expect(ChannelOptionMatchingQueueRowSchema.parse({
      channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
      listing: { id: listingId, externalId: 'P-001', masterProductId: productId },
      option: {
        id: optionId,
        externalOptionId: 'S-001',
        itemName: '기본',
        sellerSku: 'KI-001-DEFAULT',
        barcode: null,
        productVariantId: variantId,
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      linkedVariant: {
        id: variantId,
        masterProductId: productId,
        code: 'KI-001-DEFAULT',
        name: '기본',
        optionLabel: null,
      },
      recipeStatus: 'configuration_required',
      capacity: null,
    }).option.productVariantId).toBe(variantId);
  });

  it('rejects queue rows whose linked identities disagree with persisted links', () => {
    expect(() => ChannelProductMatchingQueueRowSchema.parse({
      channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
      listing: {
        id: listingId,
        externalId: 'P-001',
        displayName: '키즈 식판',
        status: 'approved',
        masterProductId: productId,
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      linkedProduct: {
        id: '00000000-0000-4000-8000-000000000099',
        code: 'KI-099',
        name: '다른 상품',
      },
      optionCount: 1,
      linkedOptionCount: 0,
    })).toThrow();

    expect(() => ChannelOptionMatchingQueueRowSchema.parse({
      channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
      listing: { id: listingId, externalId: 'P-001', masterProductId: productId },
      option: {
        id: optionId,
        externalOptionId: 'S-001',
        itemName: '기본',
        sellerSku: 'KI-001-DEFAULT',
        barcode: null,
        productVariantId: variantId,
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      linkedVariant: {
        id: '00000000-0000-4000-8000-000000000098',
        masterProductId: '00000000-0000-4000-8000-000000000099',
        code: 'KI-099-DEFAULT',
        name: '다른 기본',
        optionLabel: null,
      },
      recipeStatus: 'matched',
      capacity: 1,
    })).toThrow();
  });

  it.each([
    ['unmatched with a linked variant', true, 'unmatched', null],
    ['unmatched with capacity', false, 'unmatched', 1],
    ['matched without capacity', true, 'matched', null],
    ['matched without a linked variant', false, 'matched', 1],
    ['configuration required with capacity', true, 'configuration_required', 1],
    ['configuration required without a linked variant', false, 'configuration_required', null],
    ['review required with capacity', true, 'review_required', 1],
    ['review required without a linked variant', false, 'review_required', null],
  ] as const)('rejects contradictory option recipe state: %s', (
    _description,
    linked,
    recipeStatus,
    capacity,
  ) => {
    expect(() => ChannelOptionMatchingQueueRowSchema.parse(createOptionQueueRow({
      linked,
      recipeStatus,
      capacity,
    }))).toThrow();
  });

  it('publishes explicit direct-link and recipe matching counts', () => {
    expect(ChannelProductMatchingCountsSchema.parse({
      products: { all: 3, linked: 1, unlinked: 2 },
      options: {
        all: 4,
        linked: 3,
        unlinked: 1,
        recipeConfirmed: 1,
        configurationRequired: 1,
        reviewRequired: 1,
      },
    })).toBeDefined();
  });

  it('rejects missing, legacy, and internally inconsistent matching counts', () => {
    expect(() => ChannelProductMatchingCountsSchema.parse({
      products: { all: 3, linked: 1, unlinked: 2 },
      options: {
        all: 4,
        linked: 3,
        unlinked: 1,
        recipeConfirmed: 1,
        configurationRequired: 1,
      },
    })).toThrow();
    expect(() => ChannelProductMatchingCountsSchema.parse({
      products: { all: 3, matched: 1, unmatched: 2 },
      options: {
        all: 4,
        matched: 1,
        unmatched: 1,
        configurationRequired: 1,
        reviewRequired: 1,
      },
    })).toThrow();
    expect(() => ChannelProductMatchingCountsSchema.parse({
      products: { all: 3, linked: 1, unlinked: 1 },
      options: {
        all: 4,
        linked: 3,
        unlinked: 1,
        recipeConfirmed: 2,
        configurationRequired: 1,
        reviewRequired: 1,
      },
    })).toThrow();
  });

  it('reports legacy count aliases as unrecognized keys on an otherwise valid fixture', () => {
    const result = ChannelProductMatchingCountsSchema.safeParse({
      products: { all: 3, linked: 1, unlinked: 2, matched: 1, unmatched: 2 },
      options: {
        all: 4,
        linked: 3,
        unlinked: 1,
        recipeConfirmed: 1,
        configurationRequired: 1,
        reviewRequired: 1,
        matched: 1,
        unmatched: 1,
      },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('legacy aliases must be rejected');
    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unrecognized_keys',
        path: ['products'],
        keys: ['matched', 'unmatched'],
      }),
      expect.objectContaining({
        code: 'unrecognized_keys',
        path: ['options'],
        keys: ['matched', 'unmatched'],
      }),
    ]));
  });

  it.each([
    ['products.linked', {
      products: { all: 0, unlinked: 0 },
      options: {
        all: 0,
        linked: 0,
        unlinked: 0,
        recipeConfirmed: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    }, ['products', 'linked']],
    ['products.unlinked', {
      products: { all: 0, linked: 0 },
      options: {
        all: 0,
        linked: 0,
        unlinked: 0,
        recipeConfirmed: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    }, ['products', 'unlinked']],
    ['options.linked', {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: {
        all: 0,
        unlinked: 0,
        recipeConfirmed: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    }, ['options', 'linked']],
    ['options.unlinked', {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: {
        all: 0,
        linked: 0,
        recipeConfirmed: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    }, ['options', 'unlinked']],
    ['options.recipeConfirmed', {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: {
        all: 0,
        linked: 0,
        unlinked: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    }, ['options', 'recipeConfirmed']],
    ['options.configurationRequired', {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: {
        all: 0,
        linked: 0,
        unlinked: 0,
        recipeConfirmed: 0,
        reviewRequired: 0,
      },
    }, ['options', 'configurationRequired']],
    ['options.reviewRequired', {
      products: { all: 0, linked: 0, unlinked: 0 },
      options: {
        all: 0,
        linked: 0,
        unlinked: 0,
        recipeConfirmed: 0,
        configurationRequired: 0,
      },
    }, ['options', 'reviewRequired']],
  ] as const)('reports a missing required canonical count at %s', (_field, fixture, path) => {
    const result = ChannelProductMatchingCountsSchema.safeParse(fixture);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('missing canonical count must be rejected');
    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_type',
        path,
        message: 'Required',
      }),
    ]));
  });

  it('accepts only explicit nullable link commands', () => {
    expect(LinkChannelListingProductInputSchema.parse({ masterProductId: null }))
      .toEqual({ masterProductId: null });
    expect(LinkChannelListingOptionInputSchema.parse({ productVariantId: variantId }))
      .toEqual({ productVariantId: variantId });
    expect(() => LinkChannelListingProductInputSchema.parse({
      masterProductId: productId,
      reason: 'exact_code',
    })).toThrow();
    expect(() => LinkChannelListingOptionInputSchema.parse({})).toThrow();
  });
});
