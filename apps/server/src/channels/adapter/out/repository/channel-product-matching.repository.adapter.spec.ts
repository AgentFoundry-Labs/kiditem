import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingRepositoryAdapter } from './channel-product-matching.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('ChannelProductMatchingRepositoryAdapter candidate search', () => {
  it('pushes product manual search into an ordered uncapped Prisma query', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          externalId: 'P-1',
          masterProductId: null,
          displayName: 'Registered',
          channelName: null,
          rawJson: null,
        }),
      },
      masterProduct: { findMany },
    } as never);

    await repository.getProductCandidateContext(organizationId, 'listing-1', 'needle');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        OR: expect.arrayContaining([
          { code: { contains: 'needle', mode: 'insensitive' } },
          { name: { contains: 'needle', mode: 'insensitive' } },
        ]),
      }),
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    }));
    expect(findMany.mock.calls[0]![0]).not.toHaveProperty('take');
  });

});

describe('ChannelProductMatchingRepositoryAdapter matching counts', () => {
  it('uses a confirmed Rocket CSV Sellpia barcode to configure an unambiguous single-unit option', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'rocket-listing',
            channelName: 'Rocket 단품',
            displayName: 'Rocket 단품',
            rawJson: {
              source: 'coupang_rocket_matching_csv',
              sellpiaBarcode: '8801234567890',
              confidence: 'high',
            },
            masterProductId: null,
            options: [{
              id: 'rocket-option',
              itemName: '기본 옵션',
              inventoryComponents: [],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany,
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: 'sellpia-sku',
          code: 'SP-001',
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 1 });
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId,
        channelListingOptionId: 'rocket-option',
        sellpiaInventorySkuId: 'sellpia-sku',
        quantity: 1,
      },
    });
  });

  it('infers a Rocket CSV pack deduction quantity from its listing and option title', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'rocket-listing',
            channelName: 'Rocket 12개입',
            displayName: 'Rocket 12개입',
            rawJson: {
              source: 'coupang_rocket_matching_csv',
              sellpiaBarcode: '8801234567890',
              confidence: 'high',
            },
            masterProductId: null,
            options: [{
              id: 'rocket-option',
              itemName: '12개입',
              inventoryComponents: [],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: 'sellpia-sku',
          code: 'SP-001',
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 1 });
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId,
        channelListingOptionId: 'rocket-option',
        sellpiaInventorySkuId: 'sellpia-sku',
        quantity: 12,
      },
    });
  });

  it('updates an existing single-SKU recipe quantity from the common title rule', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'rocket-listing',
            channelName: 'Rocket 10개입',
            displayName: 'Rocket 10개입',
            rawJson: {
              source: 'coupang_rocket_matching_csv',
              sellpiaBarcode: '8801234567890',
              confidence: 'high',
            },
            masterProductId: null,
            options: [{
              id: 'rocket-option',
              itemName: '10개입',
              inventoryComponents: [{
                id: 'component-1',
                sellpiaInventorySkuId: 'sellpia-sku',
                quantity: 1,
              }],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: 'sellpia-sku',
          code: 'SP-001',
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { updateMany },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'component-1', organizationId },
      data: { quantity: 10 },
    });
  });

  it('updates an existing single-SKU recipe quantity without channel-specific SKU evidence', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'legacy-listing',
            channelName: '기존 상품 10개입',
            displayName: '기존 상품 10개입',
            rawJson: {},
            masterProductId: 'master-product',
            options: [{
              id: 'legacy-option',
              itemName: '10개입',
              sellerSku: null,
              modelNumber: null,
              barcode: null,
              inventoryComponents: [{
                id: 'component-1',
                sellpiaInventorySkuId: 'sellpia-sku',
                quantity: 1,
              }],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([]) },
        channelListingOptionInventoryComponent: { updateMany },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'component-1', organizationId },
      data: { quantity: 10 },
    });
  });

  it('uses the same exact-barcode single-unit rule for a Wing option', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'wing-listing',
            channelName: 'Wing 단품',
            displayName: 'Wing 단품',
            rawJson: {},
            masterProductId: null,
            options: [{
              id: 'wing-option',
              itemName: '기본 옵션',
              sellerSku: null,
              modelNumber: null,
              barcode: '8801234567890',
              inventoryComponents: [],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: 'sellpia-sku',
          code: 'SP-001',
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 1 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        channelListingOptionId: 'wing-option',
        sellpiaInventorySkuId: 'sellpia-sku',
        quantity: 1,
      }),
    }));
  });

  it('infers a Wing pack deduction quantity from its listing and option title', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'wing-listing',
            channelName: 'Wing 10개입',
            displayName: 'Wing 10개입',
            rawJson: {},
            masterProductId: null,
            options: [{
              id: 'wing-option',
              itemName: '10개입',
              sellerSku: null,
              modelNumber: null,
              barcode: '8801234567890',
              inventoryComponents: [],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: 'sellpia-sku',
          code: 'SP-001',
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 1 });
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId,
        channelListingOptionId: 'wing-option',
        sellpiaInventorySkuId: 'sellpia-sku',
        quantity: 10,
      },
    });
  });

  it('does not use record lifecycle state to omit channel products or options from the matching queue', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: { findMany },
    } as never);

    await repository.listQueue(organizationId, {});

    const query = findMany.mock.calls[0]![0];
    expect(query.where).not.toHaveProperty('isActive');
    expect(JSON.stringify(query.where)).not.toContain('"isActive":true');
    expect(query.include.options).not.toHaveProperty('where');
  });

  it('returns recipe identity and descriptive metadata without claiming availability', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing({
            masterProductId: 'product-1',
            masterProduct: {
              id: 'product-1',
              code: 'KI-1',
              name: 'Linked product',
              imageUrls: [],
            },
            options: [linkedOption([component({ currentStock: 8, quantity: 2 })])],
          }),
        ]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});
    const option = queue.options[0]!;
    const recipeComponent = option.option.inventoryComponents[0]!;

    expect(option).not.toHaveProperty('capacity');
    expect(recipeComponent).toMatchObject({
      sellpiaInventorySkuId: 'inventory-1',
      quantity: 2,
    });
    expect(recipeComponent).not.toHaveProperty('currentStock');
    expect(recipeComponent).not.toHaveProperty('availableStock');
    expect(recipeComponent).not.toHaveProperty('isActive');
  });

  it('counts product links independently from direct option recipe readiness', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing({ masterProductId: null, masterProduct: null, options: [unlinkedOption()] }),
          listing({
            masterProductId: 'product-1',
            masterProduct: {
              id: 'product-1',
              code: 'KI-1',
              name: 'Linked product',
              imageUrls: ['https://cdn.example.com/operator.jpg'],
            },
            options: [
              linkedOption([]),
              linkedOption([component({ isActive: false })]),
              linkedOption([component({ currentStock: 8, quantity: 2 })]),
            ],
          }),
        ]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue).toMatchObject({
      counts: {
        products: { all: 2, linked: 1, unlinked: 1 },
        options: {
          all: 4,
          configured: 2,
          unconfigured: 2,
        },
      },
    });
    expect(queue.products[1]).toMatchObject({
      listing: { channelImageUrl: null, saleStatus: 'active' },
      linkedProduct: { displayImageUrl: 'https://cdn.example.com/operator.jpg' },
    });
  });

  it('exposes explicit marketplace sale status separately from approval status', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing({
            masterProductId: null,
            masterProduct: null,
            status: '승인완료',
            rawJson: {},
            options: [unlinkedOption({ status: 'NEW' })],
          }),
          listing({
            masterProductId: null,
            masterProduct: null,
            externalId: 'external-sale',
            status: '승인완료',
            rawJson: { saleStatus: '판매중' },
            options: [unlinkedOption({ status: 'NEW' })],
          }),
          listing({
            masterProductId: null,
            masterProduct: null,
            externalId: 'external-workbook-sale',
            status: '승인완료',
            rawJson: {},
            options: [unlinkedOption({ status: '판매중' })],
          }),
        ]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue.products.map((row) => ({
      externalId: row.listing.externalId,
      status: row.listing.status,
      saleStatus: row.listing.saleStatus,
    }))).toEqual([
      { externalId: 'external-unlinked', status: '승인완료', saleStatus: null },
      { externalId: 'external-sale', status: '승인완료', saleStatus: '판매중' },
      { externalId: 'external-workbook-sale', status: '승인완료', saleStatus: '판매중' },
    ]);
  });
});

function listing({
  masterProductId,
  masterProduct,
  options,
  externalId,
  rawJson,
  status,
}: {
  masterProductId: string | null;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    imageUrls: string[];
  } | null;
  options: OptionFixture[];
  externalId?: string;
  rawJson?: Record<string, unknown>;
  status?: string | null;
}) {
  return {
    id: `listing-${masterProductId ?? 'unlinked'}`,
    externalId: externalId ?? `external-${masterProductId ?? 'unlinked'}`,
    displayName: 'Channel listing',
    status: status ?? 'active',
    rawJson: rawJson ?? null,
    channelName: 'Channel listing',
    masterProductId,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelAccount: { id: 'account-1', channel: 'coupang', name: 'Wing' },
    channelListingDailySnapshots: [],
    masterProduct,
    options,
  };
}

function unlinkedOption(overrides: { status?: string | null } = {}) {
  return {
    id: 'option-unlinked',
    externalOptionId: 'option-unlinked',
    itemName: 'Unlinked option',
    sellerSku: null,
    barcode: null,
    status: overrides.status ?? null,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    inventoryComponents: [],
  };
}

function linkedOption(inventoryComponents: ReturnType<typeof component>[]) {
  return {
    ...unlinkedOption(),
    id: `option-${inventoryComponents.length}-${inventoryComponents[0]?.sellpiaInventorySku.isActive ?? 'empty'}`,
    externalOptionId: `option-${inventoryComponents.length}-${inventoryComponents[0]?.sellpiaInventorySku.isActive ?? 'empty'}`,
    inventoryComponents,
  };
}

function component({
  currentStock = 0,
  isActive = true,
  quantity = 1,
}: {
  currentStock?: number;
  isActive?: boolean;
  quantity?: number;
} = {}) {
  return {
    sellpiaInventorySkuId: 'inventory-1',
    quantity,
    sellpiaInventorySku: { currentStock, isActive },
  };
}

type OptionFixture = ReturnType<typeof unlinkedOption> | ReturnType<typeof linkedOption>;
