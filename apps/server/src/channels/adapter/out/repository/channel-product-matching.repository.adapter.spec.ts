import { describe, expect, it, vi } from 'vitest';
import {
  ChannelProductMatchingRepositoryAdapter as ChannelProductMatchingRepositoryAdapterImpl,
} from './channel-product-matching.repository.adapter';
import type {
  ChannelOptionRecipeMutation,
} from '../../../application/port/in/channel-option-recipe.port';

class ChannelProductMatchingRepositoryAdapter
  extends ChannelProductMatchingRepositoryAdapterImpl {
  constructor(prisma: unknown) {
    const wrapped = withPublishedInventory(prisma);
    super(wrapped as never, productTransactionalRead(wrapped) as never, productSourceRead(wrapped) as never, {
      applyPreservingRecipesInTransaction: async (
        transaction: object,
        input: {
          organizationId: string;
          mutations: readonly ChannelOptionRecipeMutation[];
        },
      ) => {
        const tx = transaction as {
          channelListingOptionInventoryComponent?: {
            create(input: unknown): Promise<unknown>;
          };
        };
        for (const mutation of input.mutations) {
          for (const component of mutation.components) {
            await tx.channelListingOptionInventoryComponent?.create({
              data: {
                organizationId: input.organizationId,
                channelListingOptionId: mutation.channelListingOptionId,
                masterProductId: component.masterProductId,
                quantity: component.quantity,
              },
            });
          }
        }
        return {
          changedOptionCount: input.mutations.length,
          matchedListingCount: 0,
          conflictingChannelListingOptionIds: [],
          mappingChanged: input.mutations.length > 0,
        };
      },
    } as never);
  }
}

function inventoryRows(context: { client: unknown }) {
  const client = context.client as {
    sellpiaInventorySku?: {
      findMany?: (query: Record<string, unknown>) => Promise<unknown[]>;
    };
  };
  if (!client.sellpiaInventorySku?.findMany) return Promise.resolve([]);
  return client.sellpiaInventorySku.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      optionName: true,
      barcode: true,
      purchasePrice: true,
      salePrice: true,
      isActive: true,
      masterProductId: true,
      currentStock: true,
    },
  });
}

function toProductIdentity(row: Record<string, any>) {
  return {
    masterProductId: row.masterProductId ?? row.id,
    code: row.code ?? '',
    name: row.name ?? '',
    optionName: row.optionName ?? null,
    barcode: row.barcode ?? null,
    purchasePrice: row.purchasePrice ?? null,
    sourceAccountKey: 'sellpia',
    sourceProductCode: row.code ?? '',
    sourceOptionCode: '',
    imageUrls: [],
  };
}

function productTransactionalRead(_prisma: unknown) {
  return {
    lock: vi.fn().mockResolvedValue({}),
    readActiveMatchingCandidates: vi.fn(async (context: { client: unknown }) => {
      const rows = await inventoryRows(context);
      return rows.map((row) => ({
        ...toProductIdentity(row as Record<string, any>),
        currentStock: (row as Record<string, any>).currentStock ?? null,
      }));
    }),
  };
}

function productSourceRead(prisma: unknown) {
  return {
    findByIds: vi.fn(async (organizationId: string, ids: string[]) => {
      void organizationId;
      const rows = await inventoryRows({ client: prisma });
      return rows
        .filter((row) => ids.includes((row as Record<string, any>).masterProductId
          ?? (row as Record<string, any>).id))
        .map((row) => toProductIdentity(row as Record<string, any>));
    }),
    findByCodes: vi.fn(async () => []),
    findByBarcodes: vi.fn(async () => []),
    findByNormalizedBarcodes: vi.fn(async () => []),
    findByNormalizedNames: vi.fn(async () => []),
    listActiveForMatching: vi.fn(async () => {
      const rows = await inventoryRows({ client: prisma });
      return rows.map((row) => toProductIdentity(row as Record<string, any>));
    }),
    search: vi.fn(async () => {
      const rows = await inventoryRows({ client: prisma });
      return rows.map((row) => toProductIdentity(row as Record<string, any>));
    }),
  };
}

function withPublishedInventory(prisma: unknown) {
  const client = prisma as Record<string, any>;
  const wrap = (store: Record<string, any>) => {
    const originalFindMany = store.sellpiaInventorySku?.findMany
      ?? vi.fn().mockResolvedValue([]);
    store.sellpiaInventorySku = {
      ...store.sellpiaInventorySku,
      findMany: async (query: Record<string, any>) => {
          const rows = await originalFindMany(query);
          return rows.map((row: Record<string, any>) => query.select?.lastImportRunId
            ? {
                id: row.id,
                currentStock: row.currentStock ?? 100,
                isActive: row.isActive ?? true,
                lastImportRunId: row.lastImportRunId ?? 'inventory-run',
              }
            : {
                name: '',
                optionName: null,
                barcode: null,
                purchasePrice: null,
                salePrice: null,
                isActive: true,
                masterProductId: null,
                ...row,
              });
      },
    };
    store.sellpiaInventoryState ??= {
      findUnique: vi.fn().mockResolvedValue({
        verifiedGeneration: 1n,
        lastVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
        lastCompletedImportRunId: 'inventory-run',
      }),
    };
    store.sourceImportRun ??= {
      findFirst: vi.fn().mockResolvedValue({ id: 'inventory-run' }),
    };
    return store;
  };
  const wrapped = wrap(client);
  if (typeof client.$transaction === 'function') {
    const originalTransaction = client.$transaction.bind(client);
    client.$transaction = (operation: (transaction: unknown) => unknown) =>
      originalTransaction((transaction: Record<string, any>) =>
        operation(wrap(transaction)));
  } else {
    client.$transaction = (operation: (transaction: unknown) => unknown) =>
      operation(wrapped);
  }
  return wrapped;
}

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
          options: [],
        }),
      },
      masterProduct: { findMany },
    } as never);

    const result = await repository.getProductCandidateContext(
      organizationId,
      'listing-1',
      'needle',
    );

    expect(result?.candidates).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

});

describe('ChannelProductMatchingRepositoryAdapter matching counts', () => {
  it('uses a confirmed Rocket CSV Sellpia barcode to configure an unambiguous single-unit option', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
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
          id: '00000000-0000-4000-8000-000000000101',
          code: 'SP-001',
          name: 'Rocket 단품',
          optionName: null,
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
        masterProductId: 'master-product',
        quantity: 1,
      },
    });
  });

  it('does not use a confirmed Rocket CSV barcode when the Sellpia name is incompatible', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'rocket-listing',
            channelName: 'Rocket 키즈 식판',
            displayName: 'Rocket 키즈 식판',
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
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: '00000000-0000-4000-8000-000000000101',
          code: 'SP-001',
          name: '전혀 다른 상품',
          optionName: null,
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('infers a Rocket CSV pack deduction quantity from its listing and option title', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
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
          id: '00000000-0000-4000-8000-000000000101',
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
        masterProductId: 'master-product',
        quantity: 12,
      },
    });
  });

  it('preserves an existing single-SKU recipe when the title implies another quantity', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
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
                masterProductId: '00000000-0000-4000-8000-000000000101',
                quantity: 1,
              }],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([{
          id: '00000000-0000-4000-8000-000000000101',
          code: 'SP-001',
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { updateMany },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('preserves an existing single-SKU recipe without channel-specific evidence', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
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
                masterProductId: '00000000-0000-4000-8000-000000000101',
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
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('uses the same exact-barcode single-unit rule for a Wing option', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
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
          id: '00000000-0000-4000-8000-000000000101',
          code: 'SP-001',
          name: 'Wing 단품',
          optionName: null,
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
        masterProductId: 'master-product',
        quantity: 1,
      }),
    }));
  });

  it('does not use a provider barcode when the Sellpia name is incompatible', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'wing-listing',
            channelName: '키즈 식판',
            displayName: '키즈 식판',
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
          id: '00000000-0000-4000-8000-000000000101',
          code: 'SP-001',
          name: '전혀 다른 상품',
          optionName: null,
          barcode: '8801234567890',
          masterProductId: 'master-product',
        }]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks a provider code and compatible barcode that resolve to different SKUs', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
        channelListing: {
          findMany: vi.fn().mockResolvedValue([{
            id: 'wing-listing',
            channelName: '키즈 식판',
            displayName: '키즈 식판',
            rawJson: {},
            masterProductId: null,
            options: [{
              id: 'wing-option',
              itemName: '기본 옵션',
              sellerSku: 'SP-CODE',
              modelNumber: null,
              barcode: '8801234567890',
              inventoryComponents: [],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000102',
            code: 'SP-CODE',
            name: '키즈 식판',
            optionName: null,
            barcode: null,
            masterProductId: 'master-product',
          },
          {
            id: '00000000-0000-4000-8000-000000000103',
            code: 'SP-BARCODE',
            name: '키즈 식판',
            optionName: null,
            barcode: '8801234567890',
            masterProductId: 'master-product',
          },
        ]) },
        channelListingOptionInventoryComponent: { create },
      })),
    } as never);

    await expect(repository.autoMatch({ organizationId, channelAccountId: 'account-1' }))
      .resolves.toEqual({ evaluatedListings: 1, matchedListings: 0, configuredOptions: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('infers a Wing pack deduction quantity from its listing and option title', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'component-1' });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        masterProductAbcFormulaState: {
          upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
        },
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
          id: '00000000-0000-4000-8000-000000000101',
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
        masterProductId: 'master-product',
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
    expect(query.select.options).not.toHaveProperty('where');
    expect(query.select.options.select).toMatchObject({
      id: true,
      externalOptionId: true,
      itemName: true,
      sellerSku: true,
      barcode: true,
      modelNumber: true,
      salePrice: true,
      status: true,
      updatedAt: true,
    });
    expect(query.select.options.select).not.toHaveProperty('rawJson');
    expect(query.select.options.select).not.toHaveProperty('attributesJson');
    expect(query.select.options.select.inventoryComponents.select).toMatchObject({
      id: true,
      masterProductId: true,
      quantity: true,
    });
    expect(query.select.options.select.inventoryComponents.select)
      .not.toHaveProperty('sellpiaInventorySku');
  });

  it('preserves availability identity and pricing fields from the projected option row', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing({
            masterProductId: null,
            masterProduct: null,
            options: [unlinkedOption({
              modelNumber: 'MODEL-1',
              salePrice: 12_345,
            })],
          }),
        ]),
      },
    } as never);

    const rows = await repository.listAvailabilityRows(organizationId, {});

    expect(rows[0]).toMatchObject({
      option: {
        modelNumber: 'MODEL-1',
        salePrice: 12_345,
      },
      inventoryComponents: [],
    });
  });

  it('keeps browser, basics and partially published detail identities in availability targets', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: { findMany },
    } as never);

    await repository.listAvailabilityRows(organizationId, {});

    const query = findMany.mock.calls[0]![0];
    expect(query.where.OR).toEqual(expect.arrayContaining([
      {
        options: {
          some: {
            organizationId,
            isActive: true,
            OR: [
              { rawJson: { path: ['source'], equals: 'coupang_catalog_browser' } },
              { rawJson: { path: ['source'], equals: 'coupang_catalog_basics' } },
              { rawJson: { path: ['source'], equals: 'coupang_catalog_details' } },
            ],
          },
        },
      },
    ]));
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

type OptionFixture = {
  id: string;
  externalOptionId: string;
  itemName: string;
  sellerSku: string | null;
  barcode: string | null;
  modelNumber: string | null;
  salePrice: number | null;
  status: string | null;
  updatedAt: Date;
  inventoryComponents: ReturnType<typeof component>[];
};

function unlinkedOption(overrides: {
  status?: string | null;
  modelNumber?: string | null;
  salePrice?: number | null;
} = {}): OptionFixture {
  return {
    id: 'option-unlinked',
    externalOptionId: 'option-unlinked',
    itemName: 'Unlinked option',
    sellerSku: null,
    barcode: null,
    modelNumber: overrides.modelNumber ?? null,
    salePrice: overrides.salePrice ?? null,
    status: overrides.status ?? null,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    inventoryComponents: [],
  };
}

function linkedOption(inventoryComponents: ReturnType<typeof component>[]): OptionFixture {
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
    masterProductId: 'inventory-1',
    quantity,
    sellpiaInventorySku: {
      id: 'inventory-1',
      code: 'SP-001',
      name: 'Inventory product',
      optionName: null,
      barcode: null,
      purchasePrice: null,
      salePrice: null,
      currentStock,
      isActive,
      masterProductId: null,
    },
  };
}
