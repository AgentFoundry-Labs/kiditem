import { describe, expect, it } from 'vitest';
import {
  ChannelMatchCandidateReasonSchema,
  ChannelOptionMatchingQueueRowSchema,
  ChannelProductMatchCandidateSchema,
  ChannelProductMatchingCountsSchema,
  ChannelProductMatchingQueueRowSchema,
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

  it('publishes derived product and option matching counts', () => {
    expect(ChannelProductMatchingCountsSchema.parse({
      products: { all: 3, matched: 1, unmatched: 2 },
      options: {
        all: 4,
        matched: 1,
        unmatched: 1,
        configurationRequired: 1,
        reviewRequired: 1,
      },
    })).toBeDefined();
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
