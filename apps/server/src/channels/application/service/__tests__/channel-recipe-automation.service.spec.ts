import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRecipeAutomationService } from '../channel-recipe-automation.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const channelAccountId = '00000000-0000-4000-8000-000000000002';
const variantA = '00000000-0000-4000-8000-000000000101';
const variantB = '00000000-0000-4000-8000-000000000102';
const productA = '00000000-0000-4000-8000-000000000201';
const productB = '00000000-0000-4000-8000-000000000202';
const optionA = '00000000-0000-4000-8000-000000000301';
const optionB = '00000000-0000-4000-8000-000000000302';
const skuId = '00000000-0000-4000-8000-000000000401';
const userId = '00000000-0000-4000-8000-000000000402';

describe('ChannelRecipeAutomationService', () => {
  it('sorts variant items and builds stable preview counts and a SHA-256 fence', async () => {
    const { service, contextRepository, suggestions } = makeService();
    const optionC = '00000000-0000-4000-8000-000000000303';
    contextRepository.listContexts.mockResolvedValue(accountContext([
      context(variantB, productB, [optionB]),
      context(variantA, productA, [optionA, optionC]),
    ], [
      topology('00000000-0000-4000-8000-000000000501', productB, [[optionB, variantB]]),
      topology('00000000-0000-4000-8000-000000000502', productA, [[optionA, variantA], [optionC, variantA]]),
    ]));
    suggestions.suggestBatch.mockResolvedValue([
      suggestion(optionB, variantB, productB, 'quantity_review', 'quantity_review'),
      suggestion(optionA, variantA, productA, 'unique_code', 'auto_apply', 2),
    ]);

    const preview = await service.preview(organizationId, channelAccountId);

    expect(preview.items.map((item) => item.productVariantId)).toEqual([variantA, variantB]);
    expect(preview.summary).toEqual({
      products: 2,
      autoApplyProducts: 1,
      quantityReviewProducts: 1,
      operatorReviewProducts: 0,
      blockedProducts: 0,
      alreadyConfiguredProducts: 0,
      variants: 2,
      affectedOptions: 3,
      autoApply: 1,
      quantityReview: 1,
      operatorReview: 0,
      blocked: 0,
      alreadyConfigured: 0,
    });
    expect(preview.productGroups).toEqual([
      expect.objectContaining({ decision: 'quantity_review', autoApplyProductVariantIds: [] }),
      expect.objectContaining({ decision: 'auto_apply', autoApplyProductVariantIds: [variantA] }),
    ]);
    expect(preview.proposalVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(contextRepository.listContexts).toHaveBeenCalledWith(
      organizationId,
      channelAccountId,
    );
  });

  it('rejects stale previews and applies only current automatic items', async () => {
    const { service, contextRepository, suggestions, products } = makeService();
    contextRepository.listContexts.mockResolvedValue(accountContext([
      context(variantA, productA, [optionA]),
      context(variantB, productB, [optionB]),
    ], [
      topology('00000000-0000-4000-8000-000000000501', productA, [[optionA, variantA]]),
      topology('00000000-0000-4000-8000-000000000502', productB, [[optionB, variantB]]),
    ]));
    suggestions.suggestBatch.mockResolvedValue([
      suggestion(optionA, variantA, productA, 'unique_code', 'auto_apply', 2),
      suggestion(optionB, variantB, productB, 'quantity_review', 'quantity_review'),
    ]);
    products.applyIfEmpty.mockResolvedValue({
      appliedProductVariantIds: [variantA],
      skippedExistingProductVariantIds: [],
    });

    await expect(service.apply(organizationId, {
      channelAccountId,
      proposalVersion: '0'.repeat(64),
    })).rejects.toBeInstanceOf(ConflictException);

    const preview = await service.preview(organizationId, channelAccountId);
    await expect(service.apply(organizationId, {
      channelAccountId,
      proposalVersion: preview.proposalVersion,
    })).resolves.toEqual({
      proposalVersion: preview.proposalVersion,
      appliedProducts: 1,
      skippedProducts: 1,
      appliedVariants: 1,
      affectedOptions: 1,
      skippedExistingVariants: 0,
    });
    expect(products.applyIfEmpty).toHaveBeenCalledWith({
      organizationId,
      recipes: [{
        productVariantId: variantA,
        sellpiaInventorySkuId: skuId,
        quantity: 2,
      }],
    });
  });

  it('applies safe child recipes when one sibling still needs review', async () => {
    const { service, contextRepository, suggestions, products } = makeService();
    contextRepository.listContexts.mockResolvedValue(accountContext([
      context(variantA, productA, [optionA]),
      context(variantB, productA, [optionB]),
    ], [
      topology('00000000-0000-4000-8000-000000000501', productA, [
        [optionA, variantA],
        [optionB, variantB],
      ]),
    ]));
    suggestions.suggestBatch.mockResolvedValue([
      suggestion(optionA, variantA, productA, 'unique_code', 'auto_apply'),
      suggestion(optionB, variantB, productA, 'quantity_review', 'operator_review'),
    ]);
    products.applyIfEmpty.mockResolvedValue({
      appliedProductVariantIds: [variantA],
      skippedExistingProductVariantIds: [],
    });

    const preview = await service.preview(organizationId, channelAccountId);
    expect(preview.productGroups).toEqual([expect.objectContaining({
      decision: 'operator_review',
      autoApplyProductVariantIds: [variantA],
    })]);
    expect(preview.summary.autoApplyProducts).toBe(1);

    await expect(service.apply(organizationId, {
      channelAccountId,
      proposalVersion: preview.proposalVersion,
    })).resolves.toMatchObject({
      appliedProducts: 1,
      skippedProducts: 0,
      appliedVariants: 1,
    });
    expect(products.applyIfEmpty).toHaveBeenCalledWith({
      organizationId,
      recipes: [{
        productVariantId: variantA,
        sellpiaInventorySkuId: skuId,
        quantity: 1,
      }],
    });
  });

  it('automatically applies only product groups selected by newly published channel options', async () => {
    const { service, contextRepository, suggestions, products } = makeService();
    contextRepository.listContexts.mockResolvedValue(accountContext([
      context(variantA, productA, [optionA]),
      context(variantB, productB, [optionB]),
    ], [
      topology('00000000-0000-4000-8000-000000000501', productA, [[optionA, variantA]]),
      topology('00000000-0000-4000-8000-000000000502', productB, [[optionB, variantB]]),
    ]));
    suggestions.suggestBatch.mockResolvedValue([
      suggestion(optionA, variantA, productA, 'unique_code', 'auto_apply', 2),
      suggestion(optionB, variantB, productB, 'unique_code', 'auto_apply', 3),
    ]);
    products.applyIfEmpty.mockResolvedValue({
      appliedProductVariantIds: [variantA],
      skippedExistingProductVariantIds: [],
    });

    await expect(service.applySafeForOptions({
      organizationId,
      channelAccountId,
      channelListingOptionIds: [optionA],
    })).resolves.toEqual({
      evaluatedProducts: 1,
      appliedProducts: 1,
      appliedVariants: 1,
      affectedOptions: 1,
      quantityReviewProducts: 0,
      operatorReviewProducts: 0,
      blockedProducts: 0,
      alreadyConfiguredProducts: 0,
      skippedExistingVariants: 0,
    });
    expect(products.applyIfEmpty).toHaveBeenCalledWith({
      organizationId,
      recipes: [{
        productVariantId: variantA,
        sellpiaInventorySkuId: skuId,
        quantity: 2,
      }],
    });
  });

  it('creates an operator-reviewed single-Sellpia recipe for a linked option', async () => {
    const { service, suggestions, productRecipes } = makeService();
    suggestions.suggest.mockResolvedValue(
      suggestion(optionA, variantA, productA, 'quantity_review', 'operator_review'),
    );
    productRecipes.createIfEmpty.mockResolvedValue({
      appliedProductVariantIds: [variantA],
      unchangedProductVariantIds: [],
    });

    await expect(service.linkOptionRecipe(
      organizationId,
      userId,
      optionA,
      { sellpiaInventorySkuId: skuId, quantity: 3 },
    )).resolves.toEqual({
      channelListingOptionId: optionA,
      productVariantId: variantA,
      sellpiaInventorySkuId: skuId,
      quantity: 3,
      status: 'created',
    });
    expect(productRecipes.createIfEmpty).toHaveBeenCalledWith(
      organizationId,
      userId,
      {
        recipes: [{
          productVariantId: variantA,
          components: [{ sellpiaInventorySkuId: skuId, quantity: 3 }],
        }],
      },
    );
  });

  it('rejects recipe creation before the channel option is linked to a variant', async () => {
    const { service, suggestions, productRecipes } = makeService();
    suggestions.suggest.mockResolvedValue({
      ...suggestion(optionA, variantA, productA, 'quantity_review', 'operator_review'),
      productVariantId: null,
      masterProductId: null,
    });

    await expect(service.linkOptionRecipe(
      organizationId,
      userId,
      optionA,
      { sellpiaInventorySkuId: skuId, quantity: 1 },
    )).rejects.toThrow('Confirm the ChannelListingOption ProductVariant');
    expect(productRecipes.createIfEmpty).not.toHaveBeenCalled();
  });
});

function makeService() {
  const contextRepository = { listContexts: vi.fn() };
  const suggestions = { suggest: vi.fn(), suggestBatch: vi.fn() };
  const products = { applyIfEmpty: vi.fn() };
  const productRecipes = { createIfEmpty: vi.fn() };
  return {
    contextRepository,
    suggestions,
    products,
    productRecipes,
    service: new ChannelRecipeAutomationService(
      contextRepository as never,
      suggestions as never,
      products as never,
      productRecipes as never,
    ),
  };
}

function context(productVariantId: string, masterProductId: string, optionIds: string[]) {
  return {
    productVariantId,
    masterProductId,
    selectedChannelListingOptionIds: optionIds,
    allLinkedOptions: optionIds.map((channelListingOptionId) => ({
      channelListingOptionId,
      listingName: '키즈 식판',
      itemName: null,
      sellerSku: null,
      modelNumber: null,
      barcode: null,
    })),
    existingComponents: [],
  };
}

function accountContext(
  variants: ReturnType<typeof context>[],
  products: ReturnType<typeof topology>[],
) {
  return { products, variants };
}

function topology(
  channelListingId: string,
  masterProductId: string | null,
  options: Array<[string, string | null]>,
) {
  return {
    channelListingId,
    masterProductId,
    options: options.map(([channelListingOptionId, productVariantId]) => ({
      channelListingOptionId,
      productVariantId,
    })),
  };
}

function suggestion(
  channelListingOptionId: string,
  productVariantId: string,
  masterProductId: string,
  status: 'unique_code' | 'quantity_review',
  automationDecision: 'auto_apply' | 'operator_review',
  quantity = 1,
) {
  const automatic = automationDecision === 'auto_apply';
  return {
    channelListingOptionId,
    productVariantId,
    masterProductId,
    status,
    automationDecision,
    recommendedQuantity: automatic ? quantity : null,
    reason: automatic ? 'One exact code' : 'Review quantity',
    existingComponents: [],
    proposals: [{
      sellpiaInventorySkuId: skuId,
      code: 'SP-001',
      name: '키즈 식판',
      optionName: null,
      currentStock: 3,
      evidence: [{
        kind: 'seller_sku_code',
        channelValue: 'SP-001',
        normalizedValue: 'SP-001',
      }],
      requiresQuantityConfirmation: !automatic,
      recommendedQuantity: automatic ? quantity : null,
    }],
  };
}
