import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingService } from '../channel-product-matching.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const listingId = '00000000-0000-4000-8000-000000000002';
const masterProductId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const firstSkuId = '00000000-0000-4000-8000-000000000006';
const secondSkuId = '00000000-0000-4000-8000-000000000007';

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
      {
        channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡' },
        listing: { id: listingId, externalId: 'P-1', masterProductId },
        option: {
          id: '00000000-0000-4000-8000-000000000008',
          externalOptionId: 'OPTION-1',
          itemName: '묶음 상품',
          sellerSku: 'SELLER-1',
          barcode: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          inventoryComponents: [{
            id: '00000000-0000-4000-8000-000000000009',
            masterProductId: firstSkuId,
            code: 'SP-1',
            name: '첫 재고',
            optionName: null,
            barcode: null,
            currentStock: 999,
            quantity: 2,
          }, {
            id: '00000000-0000-4000-8000-000000000010',
            masterProductId: secondSkuId,
            code: 'SP-2',
            name: '둘째 재고',
            optionName: null,
            barcode: null,
            currentStock: 999,
            quantity: 3,
          }],
        },
        capacity: 333,
      },
      {
        channelAccount: { id: accountId, channel: 'coupang', name: '쿠팡' },
        listing: {
          id: '00000000-0000-4000-8000-000000000005',
          externalId: 'P-2',
          masterProductId: null,
        },
        option: {
          id: '00000000-0000-4000-8000-000000000011',
          externalOptionId: 'OPTION-2',
          itemName: '미설정 상품',
          sellerSku: null,
          barcode: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          inventoryComponents: [],
        },
        capacity: 999,
      },
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

function inventoryAvailability(items = [{
  masterProductId: firstSkuId,
  currentStock: 10,
  generation: '1',
}, {
  masterProductId: secondSkuId,
  currentStock: 7,
  generation: '1',
}]) {
  return {
    findByMasterProductIds: vi.fn().mockResolvedValue({
      snapshot: {
        collected: true,
        generation: '1',
        verifiedAt: '2026-08-01T00:00:00.000Z',
      },
      items,
    }),
  };
}

function service(
  repo = repository(),
  media = { findDisplayMedia: vi.fn().mockResolvedValue(new Map()) },
  inventory = inventoryAvailability(),
) {
  return {
    repo,
    media,
    inventory,
    service: new ChannelProductMatchingService(
      repo as never,
      media as never,
      inventory as never,
      { log: vi.fn(), warn: vi.fn() },
    ),
  };
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

  it('does not publish repository stock or capacity before Inventory has collected a snapshot', async () => {
    const inventory = inventoryAvailability([]);
    inventory.findByMasterProductIds.mockResolvedValue({
      snapshot: { collected: false, generation: null, verifiedAt: null },
      items: [],
    });
    const { service: matching } = service(repository(), undefined, inventory);

    const result = await matching.list(organizationId);

    expect(inventory.findByMasterProductIds).toHaveBeenCalledTimes(1);
    expect(inventory.findByMasterProductIds).toHaveBeenCalledWith({
      organizationId,
      masterProductIds: [firstSkuId, secondSkuId],
    });
    expect(result.options[0]).toMatchObject({
      capacity: null,
      option: {
        inventoryComponents: [{
          masterProductId: firstSkuId,
          currentStock: null,
        }, {
          masterProductId: secondSkuId,
          currentStock: null,
        }],
      },
    });
  });

  it('hydrates every matching recipe from one collected Inventory availability batch', async () => {
    const inventory = inventoryAvailability();
    const { service: matching } = service(repository(), undefined, inventory);

    const result = await matching.list(organizationId);

    expect(inventory.findByMasterProductIds).toHaveBeenCalledTimes(1);
    expect(result.options[0]).toMatchObject({
      capacity: 2,
      option: {
        inventoryComponents: [{
          masterProductId: firstSkuId,
          currentStock: 10,
        }, {
          masterProductId: secondSkuId,
          currentStock: 7,
        }],
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
      .rejects.toMatchObject({ code: 'CHANNELS_LISTING_NOT_FOUND', kind: 'not_found' });
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
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', kind: 'validation' });
    expect(repo.linkProduct).not.toHaveBeenCalled();
  });

  it('runs conservative automatic matching for an optional channel account', async () => {
    const { repo, service: matching } = service();
    await expect(matching.autoMatch(organizationId, { channelAccountId: accountId }))
      .resolves.toEqual({ evaluatedListings: 2, matchedListings: 1, configuredOptions: 1 });
    expect(repo.autoMatch).toHaveBeenCalledWith({ organizationId, channelAccountId: accountId });
  });
});
