import { describe, expect, it, vi } from 'vitest';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';

describe('SellpiaProductInventoryReader display-media enrichment', () => {
  it('batches one ordered request per destination variant and retains the returned image', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const findDisplayMedia = vi.fn(async () => new Map([['variant-1', {
      url: 'https://cdn.example/exact.jpg',
      source: 'channel_catalog' as const,
      channel: 'coupang',
      channelListingId: 'listing-origin',
      externalOptionId: 'option-origin',
    }]]));
    const destinationFindMany = vi.fn(async () => [{
      sellpiaInventorySkuId: skuId,
      quantity: 1,
      productVariant: variant(),
    }]);
    const reader = new SellpiaProductInventoryReader({
      sellpiaInventorySku: {
        findMany: vi.fn(async () => [{ id: skuId, code: 'SKU-1', barcode: null, isActive: true }]),
      },
      productVariantComponent: {
        findMany: destinationFindMany,
      },
    } as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, activeCommitmentQuantity: 0, availableStock: 10, isActive: true, generation: '1' }],
      })),
    } as never, { findDisplayMedia });

    const result = await reader.project('org-1', [{
      key: 'SKU-1',
      evidence: { productCode: 'SKU-1', optionCode: '', barcode: null },
      completeMonthly: [{ yearMonth: '2026-06', orderQty: 1 }],
    }]);

    expect(findDisplayMedia).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requests: [{
        key: 'variant-1',
        candidates: [
          { channelListingId: 'listing-origin', externalOptionId: 'option-origin' },
          { channelListingId: 'listing-primary', externalOptionId: 'option-primary' },
          { channelListingId: 'listing-naver', externalOptionId: 'option-naver' },
        ],
      }],
    });
    expect(result.projection.byProductKey.get('SKU-1')?.inventoryResolution).toMatchObject({
      status: 'matched',
      destinations: [{
        abcGrade: 'B',
        displayImage: { url: 'https://cdn.example/exact.jpg' },
      }],
    });
    expect(destinationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        productVariant: {
          is: expect.objectContaining({
            organizationId: 'org-1',
            isActive: true,
            masterProduct: {
              is: expect.objectContaining({ organizationId: 'org-1', isActive: true }),
            },
          }),
        },
      }),
    }));
    expect(destinationFindMany.mock.calls[0]?.[0]).not.toHaveProperty(
      'select.productVariant.select.channelListingOptions.where.listing.is.channelAccount.is.channel',
    );
  });

  it('logs media failure and preserves the inventory projection with null images', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const reader = new SellpiaProductInventoryReader({
      sellpiaInventorySku: { findMany: vi.fn(async () => [{ id: skuId, code: 'SKU-1', barcode: null, isActive: true }]) },
      productVariantComponent: { findMany: vi.fn(async () => [{ sellpiaInventorySkuId: skuId, quantity: 1, productVariant: variant() }]) },
    } as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, activeCommitmentQuantity: 0, availableStock: 10, isActive: true, generation: '1' }],
      })),
    } as never, { findDisplayMedia: vi.fn(async () => { throw new Error('unavailable'); }) });
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

function variant() {
  return {
    id: 'variant-1', code: 'VAR-1', name: 'Variant',
    masterProduct: {
      id: 'master-1', code: 'MASTER-1', name: 'Master', abcGrade: 'B',
      originChannelListingId: 'listing-origin',
    },
    channelListingOptions: [
      option('listing-primary', 'option-primary', 'B', true),
      option('listing-origin', 'option-origin', 'A', false),
      option('listing-naver', 'option-naver', 'C', false, 'naver'),
    ],
  };
}

function option(
  listingId: string,
  externalOptionId: string,
  externalId: string,
  isPrimary: boolean,
  channel = 'coupang',
) {
  return {
    organizationId: 'org-1', productVariantId: 'variant-1', externalOptionId, isActive: true,
    listing: {
      id: listingId, organizationId: 'org-1', masterProductId: 'master-1', externalId, isActive: true,
      channelAccount: { organizationId: 'org-1', channel, status: 'active', isPrimary },
    },
  };
}
