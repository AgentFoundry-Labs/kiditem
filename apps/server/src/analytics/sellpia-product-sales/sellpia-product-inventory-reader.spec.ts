import { describe, expect, it, vi } from 'vitest';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';
import { stubMissingProductAbcRead } from '../../products/__tests__/test-helpers/product-abc-read.stub';

describe('SellpiaProductInventoryReader display-media enrichment', () => {
  it('batches one request per destination channel option and retains the returned image', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const findDisplayMedia = vi.fn(async () => new Map([['channel-option-1', {
      url: 'https://cdn.example/exact.jpg',
      source: 'channel_catalog' as const,
      channel: 'coupang',
      channelListingId: 'listing-origin',
      externalOptionId: 'option-origin',
    }]]));
    const destinationFindMany = vi.fn(async (_input: unknown) => [{
      sellpiaInventorySkuId: skuId,
      quantity: 1,
      channelListingOption: channelOption(),
    }]);
    const prisma = {
      masterProductAbcFormulaState: { findUnique: vi.fn(async () => null) },
      sellpiaInventorySku: {
        findMany: vi.fn(async () => [inventoryCandidate(skuId)]),
      },
      masterProduct: { findMany: vi.fn(async () => [masterProduct()]) },
      channelListingOptionInventoryComponent: {
        findMany: destinationFindMany,
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    const inventoryTransactionalRead = {
      readSkuIdentities: vi.fn(async () => [inventoryIdentity(skuId)]),
    };
    const reader = new SellpiaProductInventoryReader(prisma as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, generation: '1' }],
      })),
    } as never, { findDisplayMedia }, stubMissingProductAbcRead(), inventoryTransactionalRead as never);

    const result = await reader.project('org-1', [{
      key: 'SKU-1',
      evidence: { productCode: 'SKU-1', optionCode: '', barcode: null },
      completeMonthly: [{ yearMonth: '2026-06', orderQty: 1 }],
    }]);

    expect(findDisplayMedia).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requests: [{
        key: 'channel-option-1',
        candidates: [{ channelListingId: 'listing-primary', externalOptionId: 'option-primary' }],
      }],
    });
    expect(result.projection.byProductKey.get('SKU-1')?.inventoryResolution).toMatchObject({
      status: 'matched',
      inventoryProduct: { masterProductId: 'master-1', abc: { abcGrade: null } },
      destinations: [{
        abc: { abcGrade: null },
        displayImage: { url: 'https://cdn.example/exact.jpg' },
      }],
    });
    expect(destinationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        channelListingOption: expect.objectContaining({
          organizationId: 'org-1',
          isActive: true,
        }),
      }),
    }));
  });

  it('logs media failure and preserves the inventory projection with null images', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const prisma = {
      masterProductAbcFormulaState: { findUnique: vi.fn(async () => null) },
      sellpiaInventorySku: { findMany: vi.fn(async () => [inventoryCandidate(skuId)]) },
      masterProduct: { findMany: vi.fn(async () => [masterProduct()]) },
      channelListingOptionInventoryComponent: {
        findMany: vi.fn(async () => [{
          sellpiaInventorySkuId: skuId,
          quantity: 1,
          channelListingOption: channelOption(),
        }]),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    const inventoryTransactionalRead = {
      readSkuIdentities: vi.fn(async () => [inventoryIdentity(skuId)]),
    };
    const reader = new SellpiaProductInventoryReader(prisma as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, generation: '1' }],
      })),
    } as never, { findDisplayMedia: vi.fn(async () => { throw new Error('unavailable'); }) }, stubMissingProductAbcRead(), inventoryTransactionalRead as never);
    const warn = vi.spyOn((reader as never as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);

    const result = await reader.project('org-1', [{
      key: 'SKU-1', evidence: { productCode: 'SKU-1', optionCode: '', barcode: null }, completeMonthly: [],
    }]);

    expect(warn).toHaveBeenCalledOnce();
    expect(result.projection.byProductKey.get('SKU-1')?.inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 10, destinations: [{ displayImage: null }],
    });
  });


});

function inventoryCandidate(skuId: string) {
  return {
    id: skuId,
    code: 'SKU-1',
    name: 'Inventory SKU',
    optionName: null,
    barcode: null,
    purchasePrice: null,
    salePrice: null,
    masterProductId: 'master-1',
  };
}

function inventoryIdentity(skuId: string) {
  return {
    sellpiaInventorySkuId: skuId,
    code: 'SKU-1',
    name: 'Inventory SKU',
    optionName: null,
    barcode: null,
    purchasePrice: null,
    salePrice: null,
    masterProductId: 'master-1',
  };
}

function masterProduct() {
  return {
    id: 'master-1',
    code: 'MASTER-1',
    name: 'Master',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function channelOption(): {
  id: string;
  externalOptionId: string;
  itemName: string;
  listing: ReturnType<typeof listing>;
} {
  return {
    id: 'channel-option-1',
    externalOptionId: 'option-primary',
    itemName: 'Variant',
    listing: listing(),
  };
}

function listing() {
  return {
    id: 'listing-primary',
    externalId: 'LISTING-1',
    masterProduct: {
      id: 'master-1', code: 'MASTER-1', name: 'Master', abcGrade: 'B',
      abcEvaluation: null,
    },
    channelAccount: { channel: 'coupang', isPrimary: true },
  };
}
