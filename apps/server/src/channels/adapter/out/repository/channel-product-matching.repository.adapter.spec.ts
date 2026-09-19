import { describe, expect, it, vi } from 'vitest';
import {
  ChannelProductMatchingRepositoryAdapter as ChannelProductMatchingRepositoryAdapterImpl,
} from './channel-product-matching.repository.adapter';
import type {
  ProductChannelOptionRecipeMutation,
} from '../../../../products/application/port/in/product-channel-option-recipe-mutation.port';

class ChannelProductMatchingRepositoryAdapter
  extends ChannelProductMatchingRepositoryAdapterImpl {
  constructor(prisma: unknown) {
    super(withPublishedInventory(prisma) as never, {
      applyPreservingRecipesInTransaction: async (
        transaction: object,
        input: {
          organizationId: string;
          mutations: readonly ProductChannelOptionRecipeMutation[];
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
                sellpiaInventorySkuId: component.sellpiaInventorySkuId,
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
        quantity: 1,
      },
    });
  });

  /**
   * 같은 상품은 몰마다 같은 제목으로 올린다(사장님 2026-09-19). 셀피아 이름과 달라 못 찾는 몰 상품도, 다른 몰에서 같은
   * 제목으로 이미 이어진 레시피가 한 가지면 그대로 잇는다 — 몰에 적힌 코드가 다른 상품이면 잇지 않는다.
   */
  it('links an unmatched listing to the single recipe of a same-title listing in another mall', async () => {
    const skuId = '00000000-0000-4000-8000-000000000201';
    const title = '[펜시네] 주사위 열쇠고리 파티선물 답례품';
    const run = async (sellerSku: string | null) => {
      const create = vi.fn().mockResolvedValue({ id: 'component-1' });
      const findMany = vi.fn(async (query: { where: Record<string, any>; select: Record<string, any> }) => {
        if (query.where.options) return [{ id: 'listing-gmarket' }];
        if (query.select.id === true && Object.keys(query.select).length === 1) return [{ id: 'listing-onch' }];
        if (query.where.id?.in?.includes('listing-gmarket')) {
          return [{ id: 'listing-gmarket', displayName: title, options: [{ inventoryComponents: [{ sellpiaInventorySkuId: skuId, quantity: 1 }] }] }];
        }
        return [{
          id: 'listing-onch',
          displayName: title,
          channelName: title,
          rawJson: null,
          masterProductId: null,
          options: [{ id: 'option-onch', itemName: null, sellerSku, modelNumber: null, barcode: null, inventoryComponents: [] }],
        }];
      });
      const repository = new ChannelProductMatchingRepositoryAdapter({
        $transaction: vi.fn(async (callback) => callback({
          $queryRaw: vi.fn().mockResolvedValue([]),
          masterProductAbcFormulaState: { upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }) },
          channelListing: { findMany, findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
          masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
          sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([
            { id: skuId, code: '10482-1', name: '3500애니멀회전주사위키링', optionName: null, barcode: null, masterProductId: 'master-product' },
            { id: '00000000-0000-4000-8000-000000000202', code: '10406-1', name: '2500머그컵딸깍키링', optionName: null, barcode: null, masterProductId: 'master-product' },
          ]) },
          channelListingOptionInventoryComponent: { create },
        })),
      } as never);
      await repository.autoMatch({ organizationId, channelAccountId: 'account-onch' });
      return create;
    };

    const linked = await run(null);
    expect(linked).toHaveBeenCalledWith({
      data: { organizationId, channelListingOptionId: 'option-onch', sellpiaInventorySkuId: skuId, quantity: 1 },
    });
    // 몰에 적힌 셀피아 코드가 다른 상품(머그컵 키링)이면 제목으로 덮지 않는다.
    const conflicting = await run('10406-1');
    expect(conflicting).not.toHaveBeenCalled();
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
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
                sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
                quantity: 1,
              }],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
                sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
                quantity: 1,
              }],
            }],
          }]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sellpiaManualMatchAlias: { findMany: vi.fn().mockResolvedValue([]) },
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        // 자동 매칭은 활성 마스터 상품을 가리키는 제안만 적용한다(KID-246).
        masterProduct: { findMany: vi.fn().mockResolvedValue([{ id: 'master-product' }]) },
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
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000101',
        quantity: 10,
      },
    });
  });

  it('does not use record lifecycle state to omit channel products or options from the matching queue', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: 'listing-1' }])
      .mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: { findMany },
    } as never);

    await repository.listQueue(organizationId, {});

    // 조건은 번호만 읽는 첫 쿼리에, 옵션 · 구성품 모양은 묶음으로 불러오는 쿼리에 있다.
    const [idQuery, query] = findMany.mock.calls.map((call) => call[0]);
    expect(idQuery.where).not.toHaveProperty('isActive');
    expect(JSON.stringify(idQuery.where)).not.toContain('"isActive":true');
    expect(idQuery.select).toEqual({ id: true });
    expect(query.where).toEqual({ organizationId, id: { in: ['listing-1'] } });
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
      sellpiaInventorySkuId: true,
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

  /**
   * 리스팅 16,081 · 옵션 17,098 에서 한 번에 관계까지 읽은 쿼리가 PostgreSQL 파라미터 한도를 넘어 품절 관리 미리보기가
   * 500 이 났다(2026-09-19, Prisma P2029). 번호를 먼저 순서대로 읽고 2,000개씩 불러와 그 순서로 되돌린다.
   */
  it('loads availability listings in id batches under the parameter limit and keeps the ordered read', async () => {
    const ids = Array.from({ length: 4_500 }, (_, index) => `listing-${index}`);
    const base = listing({ masterProductId: null, masterProduct: null, options: [unlinkedOption({})] });
    const findMany = vi.fn(async (query: { select: Record<string, unknown>; where: { id?: { in: string[] } } }) => {
      if (query.select.id === true && !query.select.options) return ids.map((id) => ({ id }));
      // 묶음은 순서를 뒤집어 돌려준다 — 결과는 첫 쿼리의 순서여야 한다.
      return [...query.where.id!.in].reverse().map((id) => ({ ...base, id }));
    });
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback({ channelListing: { findMany } })),
    } as never);

    const rows = await repository.listAvailabilityRows(organizationId, {});

    const batches = findMany.mock.calls.slice(1).map((call) => call[0].where.id!.in);
    expect(batches.map((batch) => batch.length)).toEqual([2_000, 2_000, 500]);
    expect(rows.map((row) => row.listing.id)).toEqual(ids);
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
    sellpiaInventorySkuId: 'inventory-1',
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
