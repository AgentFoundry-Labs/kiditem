import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsRepositoryAdapter } from './product-operations.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const sellingMasterProductId = '00000000-0000-4000-8000-000000000002';

describe('ProductOperationsRepositoryAdapter', () => {
  it('uses the latest channel snapshot to project selling channel products', async () => {
    const prisma = {
      channelListingDailySnapshot: { groupBy: vi.fn().mockResolvedValue([]) },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          channelListing('판매중지', '판매중', 'Coupang Wing'),
          channelListing('판매중', '판매중지', 'Coupang Rocket'),
        ]),
      },
    };
    const repository = new ProductOperationsRepositoryAdapter(prisma as never);

    const result = await repository.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'active',
      adStatus: 'all',
    });

    expect(result.sellingChannelProducts).toEqual([{
      channelAccountId: '00000000-0000-4000-8000-000000000011',
      channel: 'coupang',
      channelAccountName: 'Coupang Rocket',
    }]);
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        channelAccount: {
          is: expect.objectContaining({ status: 'active' }),
        },
      }),
    }));
  });

  it('projects only Product Hub fields for channel listings and options', async () => {
    const masterProductFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      channelListingDailySnapshot: { groupBy: vi.fn().mockResolvedValue([]) },
      masterProduct: { findMany: masterProductFindMany },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const repository = new ProductOperationsRepositoryAdapter(prisma as never);

    await repository.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
      adStatus: 'all',
    });

    const query = masterProductFindMany.mock.calls[0]?.[0] as {
      include: {
        channelListings: {
          select: {
            channelAccount: unknown;
            channelListingDailySnapshots: unknown;
            options: {
              select: {
                inventoryComponents: {
                  select: {
                    sellpiaInventorySku: unknown;
                  };
                };
              };
            };
          };
        };
      };
    };
    const listingSelect = query.include.channelListings.select;
    expect(listingSelect).toEqual(expect.objectContaining({
      id: true,
      channelAccountId: true,
      externalId: true,
      displayName: true,
      status: true,
      isActive: true,
    }));
    expect(listingSelect).not.toHaveProperty('rawJson');
    expect(listingSelect.channelAccount).toEqual({
      select: { id: true, channel: true, name: true },
    });
    expect(listingSelect.channelListingDailySnapshots).toEqual(expect.objectContaining({
      select: expect.objectContaining({
        businessDate: true,
        trafficVisitors: true,
        trafficViews: true,
        trafficCartAdds: true,
        trafficOrders: true,
        trafficSalesQty: true,
        trafficRevenue: true,
        metaJson: true,
      }),
    }));

    const optionSelect = listingSelect.options.select;
    expect(optionSelect).toEqual(expect.objectContaining({
      id: true,
      externalOptionId: true,
      itemName: true,
      sellerSku: true,
      barcode: true,
      status: true,
      isActive: true,
    }));
    expect(optionSelect).not.toHaveProperty('rawJson');
    expect(optionSelect).not.toHaveProperty('attributesJson');
    expect(optionSelect.inventoryComponents).toEqual(expect.objectContaining({
      select: expect.objectContaining({
        id: true,
        sellpiaInventorySkuId: true,
        quantity: true,
        sellpiaInventorySku: {
          select: {
            id: true,
            code: true,
            name: true,
            optionName: true,
            barcode: true,
          },
        },
      }),
    }));
  });

  it('keeps Product Hub list mapping fields after projection', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const masterProductFindMany = vi.fn().mockResolvedValue([{
      id: 'master-product-1',
      code: 'MP-1',
      name: 'Umbrella',
      description: null,
      category: 'toy',
      brand: 'Brand',
      tags: ['rain'],
      imageUrls: ['https://example.test/umbrella.png'],
      abcGrade: null,
      profitTag: 'normal',
      adTier: null,
      adBudgetLimit: null,
      healthScore: 80,
      healthUpdatedAt: null,
      isActive: true,
      createdAt,
      updatedAt,
      abcEvaluation: null,
      originChannelListing: null,
      inventorySkus: [{ id: 'sku-1' }],
      channelListings: [{
        id: 'listing-1',
        channelAccountId: 'account-1',
        externalId: 'external-1',
        displayName: 'Umbrella listing',
        status: 'listed',
        isActive: true,
        channelAccount: {
          id: 'account-1',
          channel: 'coupang',
          name: 'Coupang',
        },
        channelListingDailySnapshots: [],
        options: [{
          id: 'option-1',
          externalOptionId: 'vendor-option-1',
          itemName: 'Blue',
          sellerSku: 'seller-sku-1',
          barcode: '880000000001',
          status: '판매중',
          isActive: true,
          inventoryComponents: [{
            id: 'component-1',
            sellpiaInventorySkuId: 'sku-1',
            quantity: 2,
            sellpiaInventorySku: {
              id: 'sku-1',
              code: 'SKU-1',
              name: 'Umbrella blue',
              optionName: 'Blue',
              barcode: '880000000001',
            },
          }],
        }],
      }],
    }]);
    const prisma = {
      channelListingDailySnapshot: { groupBy: vi.fn().mockResolvedValue([]) },
      masterProduct: { findMany: masterProductFindMany },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const repository = new ProductOperationsRepositoryAdapter(prisma as never);

    const result = await repository.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
      adStatus: 'all',
    });

    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'master-product-1',
      code: 'MP-1',
      name: 'Umbrella',
      category: 'toy',
      imageUrls: ['https://example.test/umbrella.png'],
      inventorySkuIds: ['sku-1'],
      activeChannelProducts: [{
        channelAccountId: 'account-1',
        channel: 'coupang',
        channelAccountName: 'Coupang',
      }],
      inventoryOptions: [{
        id: 'option-1',
        externalOptionId: 'vendor-option-1',
        itemName: 'Blue',
        sellerSku: 'seller-sku-1',
        barcode: '880000000001',
        status: '판매중',
        isActive: true,
        inventoryComponents: [{
          id: 'component-1',
          sellpiaInventorySkuId: 'sku-1',
          code: 'SKU-1',
          name: 'Umbrella blue',
          optionName: 'Blue',
          barcode: '880000000001',
          quantity: 2,
        }],
      }],
      channelCount: 1,
      channelStatus: 'listed',
    }));
  });
});

function channelListing(
  snapshotStatus: string,
  rawStatus: string,
  accountName: string,
) {
  return {
    id: `listing-${accountName}`,
    isActive: true,
    status: 'active',
    rawJson: { saleStatus: rawStatus },
    channelAccount: {
      id: '00000000-0000-4000-8000-000000000011',
      channel: 'coupang',
      name: accountName,
    },
    channelListingDailySnapshots: [{ saleStatus: snapshotStatus }],
    options: [{ status: '판매중', inventoryComponents: [] }],
  };
}
