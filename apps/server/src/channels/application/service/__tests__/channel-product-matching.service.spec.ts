import { BadRequestException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingService } from '../channel-product-matching.service';
import type { CatalogDisplayMediaPort } from '../../../../ai/application/port/in/workspace/catalog-display-media.port';
import type { ChannelProductMatchingRepositoryPort } from '../../port/out/repository/channel-product-matching.repository.port';

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
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      makeDisplayMedia(),
    );

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
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      makeDisplayMedia(),
    );

    await expect(service.variantCandidates(
      organizationId,
      optionId,
      {},
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.linkOption).not.toHaveBeenCalled();
  });

  it('passes product and option confirmation through organization-scoped commands', async () => {
    const repository = makeRepository();
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      makeDisplayMedia(),
    );

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
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      makeDisplayMedia(),
    );

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
    const service = new ChannelProductMatchingService(
      repository,
      availability as never,
      makeDisplayMedia(),
    );

    const result = await service.list(organizationId);

    expect(result.options[0]).toMatchObject({ recipeStatus: 'matched', capacity: 3 });
    expect(availability.findByChannelSkuIds).toHaveBeenCalledWith(organizationId, [optionId]);
  });

  it('hydrates one batched channel image read while preserving direct linked-product media', async () => {
    const repository = makeRepository();
    repository.listQueue.mockResolvedValue(matchingQueue([
      matchingProductRow({
        id: listingId,
        directImageUrl: 'https://cdn.example.com/operator.jpg',
      }),
      matchingProductRow({
        id: '00000000-0000-4000-8000-000000000006',
        masterProductId: null,
      }),
    ], [{
      channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
      listing: { id: listingId, externalId: 'P-1', masterProductId: productId },
      option: {
        id: optionId,
        externalOptionId: 'O-1',
        itemName: 'Option',
        sellerSku: null,
        barcode: null,
        productVariantId: null,
        updatedAt: '2026-07-18T00:00:00.000Z',
      },
      linkedVariant: null,
      recipeStatus: 'unmatched',
      capacity: null,
    }]));
    const displayMedia = makeDisplayMedia();
    displayMedia.findDisplayMedia.mockResolvedValue(new Map([
      [listingId, channelMedia('https://cdn.example.com/channel.jpg', listingId)],
      ['00000000-0000-4000-8000-000000000006', channelMedia(
        'https://cdn.example.com/unlinked-channel.jpg',
        '00000000-0000-4000-8000-000000000006',
      )],
    ]));
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      displayMedia,
    );

    const result = await service.list(organizationId);

    expect(result.products[0]).toMatchObject({
      listing: { channelImageUrl: 'https://cdn.example.com/channel.jpg' },
      linkedProduct: { displayImageUrl: 'https://cdn.example.com/operator.jpg' },
    });
    expect(result.products[1]).toMatchObject({
      listing: { channelImageUrl: 'https://cdn.example.com/unlinked-channel.jpg' },
      linkedProduct: null,
    });
    expect(displayMedia.findDisplayMedia).toHaveBeenCalledTimes(1);
    expect(displayMedia.findDisplayMedia).toHaveBeenCalledWith({
      organizationId,
      requests: [
        {
          key: listingId,
          candidates: [{ channelListingId: listingId, externalOptionId: null }],
        },
        {
          key: '00000000-0000-4000-8000-000000000006',
          candidates: [{
            channelListingId: '00000000-0000-4000-8000-000000000006',
            externalOptionId: null,
          }],
        },
      ],
    });
  });

  it('falls back from an empty direct linked-product image to its channel image', async () => {
    const repository = makeRepository();
    repository.listQueue.mockResolvedValue(matchingQueue([
      matchingProductRow({ id: listingId, directImageUrl: null }),
    ]));
    const displayMedia = makeDisplayMedia();
    displayMedia.findDisplayMedia.mockResolvedValue(new Map([
      [listingId, channelMedia('https://cdn.example.com/channel.jpg', listingId)],
    ]));
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      displayMedia,
    );

    const channelFallback = await service.list(organizationId);

    expect(channelFallback.products[0]).toMatchObject({
      linkedProduct: { displayImageUrl: 'https://cdn.example.com/channel.jpg' },
    });
  });

  it('returns explicit null display images when no direct or channel media exists', async () => {
    const repository = makeRepository();
    repository.listQueue.mockResolvedValue(matchingQueue([
      matchingProductRow({ id: listingId, directImageUrl: null }),
    ]));
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      makeDisplayMedia(),
    );

    const noMedia = await service.list(organizationId);

    expect(noMedia.products[0]).toMatchObject({
      listing: { channelImageUrl: null },
      linkedProduct: { displayImageUrl: null },
    });
  });

  it('logs failed media enrichment and still returns matching rows with null images', async () => {
    const repository = makeRepository();
    repository.listQueue.mockResolvedValue(matchingQueue([
      matchingProductRow({ id: listingId, directImageUrl: null }),
    ]));
    const displayMedia = makeDisplayMedia();
    displayMedia.findDisplayMedia.mockRejectedValue(new Error('media unavailable'));
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new ChannelProductMatchingService(
      repository,
      makeAvailability(),
      displayMedia,
    );

    const result = await service.list(organizationId);

    expect(result.products[0]).toMatchObject({
      listing: { channelImageUrl: null },
      linkedProduct: { displayImageUrl: null },
    });
    expect(warn).toHaveBeenCalledWith(
      `Matching display media enrichment failed for organization ${organizationId}.`,
      expect.stringContaining('media unavailable'),
    );
    warn.mockRestore();
  });

  it('does not read display media for an empty product queue', async () => {
    const displayMedia = makeDisplayMedia();
    const service = new ChannelProductMatchingService(
      makeRepository(),
      makeAvailability(),
      displayMedia,
    );

    await service.list(organizationId);

    expect(displayMedia.findDisplayMedia).not.toHaveBeenCalled();
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

function makeDisplayMedia() {
  return {
    findDisplayMedia: vi.fn().mockResolvedValue(new Map()),
  } as unknown as {
    [K in keyof CatalogDisplayMediaPort]: ReturnType<typeof vi.fn>;
  };
}

function matchingProductRow({
  id,
  masterProductId = productId,
  directImageUrl = null,
}: {
  id: string;
  masterProductId?: string | null;
  directImageUrl?: string | null;
}) {
  return {
    channelAccount: { id: listingId, channel: 'coupang', name: 'Wing' },
    listing: {
      id,
      externalId: `P-${id}`,
      displayName: 'Channel listing',
      status: 'active',
      masterProductId,
      channelImageUrl: null,
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    linkedProduct: masterProductId ? {
      id: masterProductId,
      code: 'KI-1',
      name: 'Linked product',
      displayImageUrl: directImageUrl,
    } : null,
    optionCount: 0,
    linkedOptionCount: 0,
  };
}

function matchingQueue(products: ReturnType<typeof matchingProductRow>[], options: unknown[] = []) {
  return {
    products,
    options,
    counts: {
      products: { all: products.length, linked: 0, unlinked: 0 },
      options: {
        all: options.length,
        linked: 0,
        unlinked: options.length,
        recipeConfirmed: 0,
        configurationRequired: 0,
        reviewRequired: 0,
      },
    },
  };
}

function channelMedia(url: string, channelListingId: string) {
  return {
    url,
    source: 'channel_catalog' as const,
    channel: 'coupang',
    channelListingId,
    externalOptionId: null,
  };
}
