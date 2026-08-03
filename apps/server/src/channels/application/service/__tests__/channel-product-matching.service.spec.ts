import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingService } from '../channel-product-matching.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const listingId = '00000000-0000-4000-8000-000000000002';
const masterProductId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';

function queue() {
  return {
    products: [
      {
        channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡' },
        listing: {
          id: listingId,
          externalId: 'P-1',
          channelName: '채널 상품',
          displayName: null,
          masterProductId,
          channelImageUrl: null,
        },
        linkedProduct: {
          id: masterProductId,
          code: 'MP-1',
          name: '운영 상품',
          displayImageUrl: null,
        },
        configuredOptionCount: 1,
        optionCount: 1,
      },
      {
        channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡' },
        listing: {
          id: '00000000-0000-4000-8000-000000000005',
          externalId: 'P-2',
          channelName: '미매칭 상품',
          displayName: null,
          masterProductId: null,
          channelImageUrl: null,
        },
        linkedProduct: null,
        configuredOptionCount: 0,
        optionCount: 1,
      },
    ],
    options: [
      { option: { id: 'option-1', inventoryComponents: [{ sellpiaInventorySkuId: 'sku-1' }] } },
      { option: { id: 'option-2', inventoryComponents: [] } },
    ],
    counts: {
      products: { all: 2, linked: 1, unlinked: 1 },
      options: { all: 2, configured: 1, unconfigured: 1 },
    },
  };
}

function repository() {
  return {
    listQueue: vi.fn().mockResolvedValue(queue()),
    getProductCandidateContext: vi.fn().mockResolvedValue(null),
    linkProduct: vi.fn().mockResolvedValue(undefined),
    autoMatch: vi.fn().mockResolvedValue({
      evaluatedListings: 2,
      matchedListings: 1,
      configuredOptions: 1,
    }),
  };
}

function service(repo = repository(), media = { findDisplayMedia: vi.fn().mockResolvedValue(new Map()) }) {
  return { repo, media, service: new ChannelProductMatchingService(repo as never, media as never) };
}

describe('ChannelProductMatchingService', () => {
  it('derives product-link and direct option-recipe counts from one queue', async () => {
    const { service: matching } = service();
    await expect(matching.list(organizationId, { search: ' 상품 ' })).resolves.toMatchObject({
      counts: {
        products: { all: 2, linked: 1, unlinked: 1 },
        options: { all: 2, configured: 1, unconfigured: 1 },
      },
    });
  });

  it('uses the channel image as the linked MasterProduct fallback', async () => {
    const media = {
      findDisplayMedia: vi.fn().mockResolvedValue(new Map([[listingId, { url: 'https://cdn.example/item.jpg' }]])),
    };
    const { service: matching } = service(repository(), media);
    const result = await matching.list(organizationId);
    expect(result.products[0]).toMatchObject({
      listing: { channelImageUrl: 'https://cdn.example/item.jpg' },
      linkedProduct: { displayImageUrl: 'https://cdn.example/item.jpg' },
    });
  });

  it('returns no candidates when the tenant-scoped listing does not exist', async () => {
    const { service: matching } = service();
    await expect(matching.productCandidates(organizationId, listingId, {}))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes a direct MasterProduct link through the organization fence', async () => {
    const { repo, service: matching } = service();
    await matching.linkProduct(organizationId, listingId, { masterProductId });
    expect(repo.linkProduct).toHaveBeenCalledWith({
      organizationId,
      channelListingId: listingId,
      masterProductId,
    });
  });

  it('rejects malformed direct links before persistence', async () => {
    const { repo, service: matching } = service();
    await expect(matching.linkProduct(organizationId, listingId, { masterProductId: 'invalid' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.linkProduct).not.toHaveBeenCalled();
  });

  it('runs conservative automatic matching for an optional channel account', async () => {
    const { repo, service: matching } = service();
    await expect(matching.autoMatch(organizationId, { channelAccountId: accountId }))
      .resolves.toEqual({ evaluatedListings: 2, matchedListings: 1, configuredOptions: 1 });
    expect(repo.autoMatch).toHaveBeenCalledWith({ organizationId, channelAccountId: accountId });
  });
});
