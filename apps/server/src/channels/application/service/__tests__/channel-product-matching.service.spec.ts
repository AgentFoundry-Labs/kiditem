import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelProductMatchingRepositoryPort } from '../../port/out/repository/channel-product-matching.repository.port';
import { ChannelProductMatchingService } from '../channel-product-matching.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const listingId = '00000000-0000-4000-8000-000000000002';
const optionId = '00000000-0000-4000-8000-000000000003';
const productId = '00000000-0000-4000-8000-000000000004';
const variantId = '00000000-0000-4000-8000-000000000005';

describe('ChannelProductMatchingService', () => {
  it('generates normalized-name and AI product suggestions without writing links', async () => {
    const repository = makeRepository();
    repository.getProductCandidateContext.mockResolvedValue({
      listingId,
      externalId: 'P-1',
      masterProductId: null,
      displayName: ' Blue Bear ',
      explicitCode: null,
      barcode: null,
      aiSuggestion: {
        masterProductId: productId,
        explanation: 'same catalog image',
        score: 0.7,
      },
      candidates: [{
        id: productId,
        code: 'KI-1',
        name: 'BlueBear',
        category: null,
        brand: null,
        barcodes: [],
      }],
    });
    const service = new ChannelProductMatchingService(repository, makeAvailability());

    const result = await service.productCandidates(
      organizationId,
      listingId,
      { search: undefined },
    );

    expect(result.items[0]?.reason).toBe('exact_normalized_name');
    expect(repository.linkProduct).not.toHaveBeenCalled();
    expect(repository.linkOption).not.toHaveBeenCalled();
  });

  it('does not offer option candidates before the listing product is confirmed', async () => {
    const repository = makeRepository();
    repository.getVariantCandidateContext.mockResolvedValue({
      optionId,
      externalOptionId: 'O-1',
      productVariantId: null,
      masterProductId: null,
      sellerSku: null,
      barcode: null,
      itemName: 'Large',
      aiSuggestion: null,
      candidates: [],
    });
    const service = new ChannelProductMatchingService(repository, makeAvailability());

    await expect(service.variantCandidates(
      organizationId,
      optionId,
      {},
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.linkOption).not.toHaveBeenCalled();
  });

  it('passes product and option confirmation through organization-scoped commands', async () => {
    const repository = makeRepository();
    const service = new ChannelProductMatchingService(repository, makeAvailability());

    await service.linkProduct(organizationId, listingId, { masterProductId: productId });
    await service.linkOption(organizationId, optionId, { productVariantId: variantId });
    await service.linkProduct(organizationId, listingId, { masterProductId: null });

    expect(repository.linkProduct).toHaveBeenNthCalledWith(1, {
      organizationId,
      channelListingId: listingId,
      masterProductId: productId,
    });
    expect(repository.linkOption).toHaveBeenCalledWith({
      organizationId,
      channelListingOptionId: optionId,
      productVariantId: variantId,
    });
    expect(repository.linkProduct).toHaveBeenNthCalledWith(2, {
      organizationId,
      channelListingId: listingId,
      masterProductId: null,
    });
  });

  it('rejects malformed link commands without touching persistence', async () => {
    const repository = makeRepository();
    const service = new ChannelProductMatchingService(repository, makeAvailability());

    await expect(service.linkProduct(organizationId, listingId, {
      masterProductId: 'not-a-uuid',
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.linkOption(organizationId, optionId, {
      productVariantId: 'not-a-uuid',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.linkProduct).not.toHaveBeenCalled();
    expect(repository.linkOption).not.toHaveBeenCalled();
  });

  it('hydrates matching capacity from common commitment-aware availability', async () => {
    const repository = makeRepository();
    repository.listQueue.mockResolvedValue({
      products: [],
      options: [{
        channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
        listing: { id: listingId, externalId: 'P-1', masterProductId: productId },
        option: {
          id: optionId,
          externalOptionId: 'O-1',
          itemName: '기본',
          sellerSku: 'SP-1',
          barcode: null,
          productVariantId: variantId,
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
        linkedVariant: {
          id: variantId,
          masterProductId: productId,
          code: 'PV-1',
          name: '기본',
          optionLabel: null,
        },
        recipeStatus: 'matched',
        capacity: 5,
      }],
      counts: {
        products: { all: 0, linked: 0, unlinked: 0 },
        options: { all: 1, linked: 1, unlinked: 0, recipeConfirmed: 1, configurationRequired: 0, reviewRequired: 0 },
      },
    });
    const availability = makeAvailability();
    availability.findByChannelSkuIds.mockResolvedValue([{
      sku: { id: optionId, sellableStock: 3 },
      recipeStatus: 'matched',
      components: [{
        currentStock: 10,
        activeCommitmentQuantity: 4,
        availableStock: 6,
        quantity: 2,
        componentCapacity: 3,
        isBottleneck: true,
      }],
    }]);
    const service = new ChannelProductMatchingService(repository, availability as never);

    const result = await service.list(organizationId);

    expect(result.options[0]).toMatchObject({ recipeStatus: 'matched', capacity: 3 });
    expect(availability.findByChannelSkuIds).toHaveBeenCalledWith(organizationId, [optionId]);
  });
});

function makeRepository() {
  return {
    listQueue: vi.fn().mockResolvedValue({
      products: [],
      options: [],
      counts: {
        products: { all: 0, linked: 0, unlinked: 0 },
        options: {
          all: 0,
          linked: 0,
          unlinked: 0,
          recipeConfirmed: 0,
          configurationRequired: 0,
          reviewRequired: 0,
        },
      },
    }),
    getProductCandidateContext: vi.fn().mockResolvedValue(null),
    getVariantCandidateContext: vi.fn().mockResolvedValue(null),
    linkProduct: vi.fn().mockResolvedValue(undefined),
    linkOption: vi.fn().mockResolvedValue(undefined),
    listAvailabilityRows: vi.fn().mockResolvedValue([]),
  } as unknown as {
    [K in keyof ChannelProductMatchingRepositoryPort]: ReturnType<typeof vi.fn>;
  };
}

function makeAvailability() {
  return {
    list: vi.fn(),
    findByChannelSkuIds: vi.fn().mockResolvedValue([]),
    findByListingIds: vi.fn(),
  };
}
