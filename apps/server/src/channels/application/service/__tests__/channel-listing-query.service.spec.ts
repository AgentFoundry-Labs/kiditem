import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ChannelListingRepositoryAdapter } from '../../../adapter/out/repository/channel-listing.repository.adapter';

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1',
    channelAccountId: 'account-1',
    externalId: 'seller-product-1',
    channelName: '쿠팡 등록명',
    displayName: 'KidItem 등록명',
    category: null,
    brand: null,
    manufacturer: null,
    rawJson: null,
    sourceCandidateId: 'candidate-1',
    masterProductId: 'master-1',
    status: 'active',
    exposureStatus: 'visible',
    createdAt: new Date('2026-05-16T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    channelAccount: {
      id: 'account-1',
      channel: 'coupang',
      name: '쿠팡 본계정',
    },
    options: [
      {
        salePrice: 12_900,
        inventoryComponents: [{ sellpiaInventorySkuId: 'sku-1' }],
      },
      {
        salePrice: null,
        inventoryComponents: [{ sellpiaInventorySkuId: 'sku-2' }],
      },
    ],
    contentWorkspaces: [{
      id: 'workspace-1',
      currentDetailPageArtifactId: 'artifact-1',
      currentDetailPageRevisionId: 'revision-1',
      currentThumbnailSelection: {
        contentAsset: { url: 'https://cdn.example.com/workspace.jpg' },
      },
      contentGenerationGroups: [],
    }],
    thumbnails: [],
    ...overrides,
  };
}

function makePrisma() {
  return {
    $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    channelListing: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([listingRow()]),
      findFirst: vi.fn().mockResolvedValue(listingRow()),
      groupBy: vi.fn().mockResolvedValue([
        { channelAccountId: 'account-1', _count: { id: 3 } },
      ]),
    },
    channelAccount: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'account-1', channel: 'coupang', name: '쿠팡 본계정' },
      ]),
    },
  };
}

describe('ChannelListingRepositoryAdapter', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: ChannelListingRepositoryAdapter;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new ChannelListingRepositoryAdapter(prisma as never);
  });

  it('lists active marketplace products with account, mapping, and content metadata', async () => {
    const result = await repository.list('org-1', {
      page: 1,
      limit: 20,
      sort: 'newest',
      channel: 'coupang',
      channelAccountId: 'account-1',
      search: '다트',
    });

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        isActive: true,
        channelAccount: { is: { organizationId: 'org-1', channel: 'coupang' } },
        channelAccountId: 'account-1',
        OR: expect.arrayContaining([
          { displayName: { contains: '다트', mode: 'insensitive' } },
          { options: { some: { sellerSku: { contains: '다트', mode: 'insensitive' } } } },
        ]),
      },
      select: expect.objectContaining({
        channelAccount: expect.any(Object),
        options: expect.objectContaining({
          where: { isActive: true },
          select: expect.objectContaining({
            salePrice: true,
            inventoryComponents: expect.any(Object),
          }),
        }),
        contentWorkspaces: expect.any(Object),
        thumbnails: expect.any(Object),
      }),
    }));
    expect(result.items[0]).toEqual({
      id: 'listing-1',
      listingName: 'KidItem 등록명',
      thumbnailUrl: 'https://cdn.example.com/workspace.jpg',
      detailPageArtifactId: 'artifact-1',
      detailPageRevisionId: 'revision-1',
      channel: 'coupang',
      channelAccountId: 'account-1',
      channelAccountName: '쿠팡 본계정',
      externalId: 'seller-product-1',
      channelName: '쿠팡 등록명',
      category: null,
      brand: null,
      manufacturer: null,
      channelPrice: 12_900,
      sourceCandidateId: 'candidate-1',
      contentWorkspaceId: 'workspace-1',
      status: 'active',
      exposureStatus: 'visible',
      optionCount: 2,
      mappingStatus: 'matched',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });
    expect(result.marketCounts).toEqual([{
      channel: 'coupang',
      channelAccountId: 'account-1',
      channelAccountName: '쿠팡 본계정',
      count: 3,
    }]);
  });

  it('keeps an imported ChannelProduct visible without content or Sellpia Master linkage', async () => {
    prisma.channelListing.findMany.mockResolvedValueOnce([listingRow({
      id: 'imported-listing-1',
      externalId: 'imported-product-1',
      channelName: 'Wing import only',
      displayName: null,
      sourceCandidateId: null,
      masterProductId: null,
      channelAccount: { id: 'account-1', channel: 'coupang', name: 'Active Wing account' },
      options: [{ inventoryComponents: [], salePrice: 9_900 }],
      contentWorkspaces: [],
      thumbnails: [],
      createdAt: new Date('2026-07-11T00:00:00.000Z'),
      updatedAt: new Date('2026-07-11T00:00:00.000Z'),
    })]);
    prisma.channelListing.groupBy.mockResolvedValueOnce([]);

    const result = await repository.list('org-1');

    expect(prisma.channelListing.findMany.mock.calls[0]?.[0].where)
      .not.toHaveProperty('masterId');
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'imported-listing-1',
      listingName: 'Wing import only',
      contentWorkspaceId: null,
      mappingStatus: 'unmatched',
      channelPrice: 9_900,
    }));
    expect(result.items[0]).not.toHaveProperty('masterId');
  });

  it('treats complete option recipes as matched without a listing-level product summary', async () => {
    prisma.channelListing.findMany.mockResolvedValueOnce([listingRow({
      id: 'mixed-listing-1',
      masterProductId: null,
      options: [{
        inventoryComponents: [{ sellpiaInventorySkuId: 'sku-3' }],
        salePrice: 9_900,
      }],
    })]);
    prisma.channelListing.groupBy.mockResolvedValueOnce([]);

    const result = await repository.list('org-1');

    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'mixed-listing-1',
      mappingStatus: 'matched',
    }));
  });

  it('loads one active listing as the registered-product workspace fallback', async () => {
    const result = await repository.getWorkspace('org-1', 'listing-1');

    expect(prisma.channelListing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'listing-1', organizationId: 'org-1', isActive: true },
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 'listing-1',
      sourceCandidateId: 'candidate-1',
      contentWorkspaceId: 'workspace-1',
      channelAccountId: 'account-1',
    }));
  });

  it('projects only the canonical detail-document writer shape on the workspace read', async () => {
    prisma.channelListing.findFirst.mockResolvedValueOnce(listingRow({
      rawJson: {
        // These aliases were never written by updateChannelCatalogDetails and
        // must not become a second read contract.
        providerDetail: { contents: '<script>unsafe()</script>' },
        detailDocuments: [{
          id: 'contents-1',
          kind: 'contents',
          value: '<script>unsafe()</script>',
        }],
      },
      options: [{
        externalOptionId: 'option-1',
        itemName: '빨강',
        salePrice: null,
        sellerSku: null,
        barcode: null,
        modelNumber: null,
        status: 'active',
        attributesJson: { color: 'red' },
        rawJson: {
          vendorItemId: 'vendor-item-1',
          sellerProductItemId: 'seller-item-1',
          detailDocumentIds: ['contents-1'],
        },
        inventoryComponents: [],
      }],
      contentWorkspaces: [{
        id: 'workspace-1',
        currentDetailPageArtifactId: 'artifact-1',
        currentDetailPageRevisionId: 'revision-1',
        currentThumbnailSelection: {
          contentAsset: { url: 'https://cdn.example.com/workspace.jpg' },
        },
        contentGenerationGroups: [{
          originatingAssets: [
            {
              id: 'provider-primary',
              url: 'https://cdn.example.com/provider.png',
              role: 'primary',
              sortOrder: 0,
              metadata: {
                sourceType: 'channel_catalog',
                channel: 'coupang',
                active: true,
              },
            },
            {
              id: 'provider-option',
              url: 'https://cdn.example.com/provider-option.png',
              role: 'option',
              sortOrder: 1,
              metadata: {
                sourceType: 'channel_catalog',
                channel: 'coupang',
                externalOptionId: 'option-1',
                externalOptionIds: ['option-1'],
                active: true,
              },
            },
            {
              id: 'inactive-provider',
              url: 'https://cdn.example.com/old-provider.png',
              role: 'detail',
              sortOrder: 2,
              metadata: {
                sourceType: 'channel_catalog',
                channel: 'coupang',
                active: false,
              },
            },
          ],
        }],
      }],
    }));

    const result = await repository.getWorkspace('org-1', 'listing-1');

    expect(result.providerDetail).toEqual({
      category: null,
      brand: null,
      manufacturer: null,
      sourceDetail: {
        documents: [{
          id: 'contents-1',
          kind: 'contents',
          value: '<script>unsafe()</script>',
        }],
        options: [{ externalOptionId: 'option-1', documentIds: ['contents-1'] }],
      },
      options: [{
        externalOptionId: 'option-1',
        itemName: '빨강',
        vendorItemId: 'vendor-item-1',
        sellerProductItemId: 'seller-item-1',
        salePrice: null,
        sellerSku: null,
        barcode: null,
        modelNumber: null,
        status: 'active',
        attributes: { color: 'red' },
      }],
      media: [{
        sourceUrl: 'https://cdn.example.com/provider.png',
        role: 'primary',
        sortOrder: 0,
        externalOptionIds: [],
      }, {
        sourceUrl: 'https://cdn.example.com/provider-option.png',
        role: 'option',
        sortOrder: 1,
        externalOptionIds: ['option-1'],
      }],
    });
    expect(result.providerDetail?.sourceDetail).not.toHaveProperty('contents');
  });

  it('rejects an inactive or cross-organization workspace', async () => {
    prisma.channelListing.findFirst.mockResolvedValueOnce(null);

    await expect(repository.getWorkspace('org-1', 'foreign-listing'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
