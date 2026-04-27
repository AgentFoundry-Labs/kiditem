import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelSyncService } from '../services/channel-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';
import { getSellerProduct, getSellerProducts } from '../adapters/coupang/products';

vi.mock('../adapters/coupang/products', () => ({
  getSellerProducts: vi.fn(),
  getSellerProduct: vi.fn(),
}));

const getSellerProductsMock = vi.mocked(getSellerProducts);
const getSellerProductMock = vi.mocked(getSellerProduct);

type SellerProductListResponse = Awaited<ReturnType<typeof getSellerProducts>>;
type SellerProductDetailResponse = Awaited<ReturnType<typeof getSellerProduct>>;

function listOk(
  content: Array<{ sellerProductId: number | string; sellerProductName?: string; statusName?: string }>,
  nextToken?: string,
): SellerProductListResponse {
  return {
    code: 'SUCCESS',
    message: 'OK',
    data: {
      nextToken,
      content: content.map((c) => ({
        sellerProductId: Number(c.sellerProductId),
        sellerProductName: c.sellerProductName ?? '',
        statusName: c.statusName,
      })),
    },
  } as SellerProductListResponse;
}

function detailOk(payload: {
  sellerProductId: number | string;
  sellerProductName?: string;
  statusName?: string;
  deliveryChargeType?: string;
  freeShipOverAmount?: number;
  returnCharge?: number;
  deliveryInfo?: Record<string, unknown>;
  items?: Array<{
    vendorItemId: number | string;
    itemName?: string;
    salePrice?: number;
  }>;
}): SellerProductDetailResponse {
  return {
    code: 'SUCCESS',
    message: 'OK',
    data: {
      sellerProductId: Number(payload.sellerProductId),
      sellerProductName: payload.sellerProductName ?? '',
      statusName: payload.statusName,
      deliveryChargeType: payload.deliveryChargeType,
      freeShipOverAmount: payload.freeShipOverAmount,
      returnCharge: payload.returnCharge,
      deliveryInfo: payload.deliveryInfo,
      items: payload.items?.map((i) => ({
        vendorItemId: Number(i.vendorItemId),
        itemName: i.itemName ?? '',
        originalPrice: 0,
        salePrice: i.salePrice ?? 0,
      })),
    },
  } as SellerProductDetailResponse;
}

describe('Product sync (PG integration, Wave C1)', () => {
  let prisma: PrismaClient;
  let service: ChannelSyncService;
  const companyId = TEST_COMPANY_ID;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ChannelSyncService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(() => {
    getSellerProductsMock.mockReset();
    getSellerProductMock.mockReset();
  });

  async function seedListing(externalId: string) {
    const master = await prisma.masterProduct.create({
      data: {
        companyId,
        code: `M-${externalId}`,
        name: `Master ${externalId}`,
        optionCounter: 0,
      },
    });
    return prisma.channelListing.create({
      data: {
        companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId,
      },
      select: { id: true, masterId: true },
    });
  }

  it('refreshes existing listing fields from seller-product detail and stores Coupang status mapped', async () => {
    const listing = await seedListing('100');

    getSellerProductsMock.mockResolvedValueOnce(
      listOk([{ sellerProductId: 100, sellerProductName: 'Stale Name', statusName: 'APPROVED' }]),
    );
    getSellerProductMock.mockResolvedValueOnce(
      detailOk({
        sellerProductId: 100,
        sellerProductName: 'Fresh Name',
        statusName: 'APPROVED',
        deliveryChargeType: 'FREE',
        freeShipOverAmount: 30000,
        returnCharge: 2500,
        deliveryInfo: { code: 'DEFAULT' },
        items: [],
      }),
    );

    const result = await service.syncProducts(companyId);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);

    const refreshed = await prisma.channelListing.findUnique({ where: { id: listing.id } });
    expect(refreshed?.channelName).toBe('Fresh Name');
    expect(refreshed?.status).toBe('active');
    expect(refreshed?.deliveryChargeType).toBe('FREE');
    expect(refreshed?.freeShipOverAmount).toBe(30000);
    expect(refreshed?.returnCharge).toBe(2500);
    expect(refreshed?.deliveryInfo).toEqual({ code: 'DEFAULT' });
  });

  it('vendorItemId populates ChannelListingOption.externalOptionId on first sync (create) and updates on re-run (no duplicate)', async () => {
    const listing = await seedListing('200');
    const list = listOk([{ sellerProductId: 200, statusName: 'APPROVED' }]);

    getSellerProductsMock.mockResolvedValueOnce(list).mockResolvedValueOnce(list);
    getSellerProductMock
      .mockResolvedValueOnce(
        detailOk({
          sellerProductId: 200,
          items: [
            { vendorItemId: 9001, itemName: 'Pink', salePrice: 10000 },
            { vendorItemId: 9002, itemName: 'Black', salePrice: 11000 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        detailOk({
          sellerProductId: 200,
          items: [
            { vendorItemId: 9001, itemName: 'Pink (refreshed)', salePrice: 10500 },
            { vendorItemId: 9002, itemName: 'Black', salePrice: 11000 },
          ],
        }),
      );

    const r1 = await service.syncProducts(companyId);
    expect(r1.synced).toBe(1);
    expect(r1.errors).toBe(0);

    const afterFirst = await prisma.channelListingOption.findMany({
      where: { listingId: listing.id },
      orderBy: { externalOptionId: 'asc' },
    });
    expect(afterFirst.map((o) => o.externalOptionId)).toEqual(['9001', '9002']);
    expect(afterFirst[0].itemName).toBe('Pink');
    expect(afterFirst[0].salePrice).toBe(10000);
    expect(afterFirst[0].optionId).toBeNull();

    const r2 = await service.syncProducts(companyId);
    expect(r2.synced).toBe(1);
    expect(r2.errors).toBe(0);

    const afterSecond = await prisma.channelListingOption.findMany({
      where: { listingId: listing.id },
      orderBy: { externalOptionId: 'asc' },
    });
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[0].id).toBe(afterFirst[0].id);
    expect(afterSecond[1].id).toBe(afterFirst[1].id);
    expect(afterSecond[0].itemName).toBe('Pink (refreshed)');
    expect(afterSecond[0].salePrice).toBe(10500);
  });

  it('skips and reports sellerProductId without an existing ChannelListing — does not create master', async () => {
    getSellerProductsMock.mockResolvedValueOnce(
      listOk([{ sellerProductId: 999, sellerProductName: 'New Listing' }]),
    );
    const result = await service.syncProducts(companyId);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details?.[0]).toContain('Listing 999');
    expect(result.details?.[0]).toContain('no matching ChannelListing');
    // Detail call must be skipped — no point fetching options for unmatched listings.
    expect(getSellerProductMock).not.toHaveBeenCalled();

    const masters = await prisma.masterProduct.findMany({ where: { companyId } });
    expect(masters).toHaveLength(0);
    const listings = await prisma.channelListing.findMany({ where: { companyId } });
    expect(listings).toHaveLength(0);
  });

  it('paginates seller-products via nextToken and processes both pages', async () => {
    const listingA = await seedListing('300');
    const listingB = await seedListing('301');

    getSellerProductsMock
      .mockResolvedValueOnce(listOk([{ sellerProductId: 300 }], 'nt-abc'))
      .mockResolvedValueOnce(listOk([{ sellerProductId: 301 }]));
    getSellerProductMock
      .mockResolvedValueOnce(detailOk({ sellerProductId: 300, items: [] }))
      .mockResolvedValueOnce(detailOk({ sellerProductId: 301, items: [] }));

    const result = await service.syncProducts(companyId);
    expect(result.synced).toBe(2);
    expect(result.errors).toBe(0);
    expect(listingA.id).not.toBe(listingB.id);
  });

  it('throws inside transaction when Coupang item is missing vendorItemId; option upserts roll back, listing field changes do too', async () => {
    const listing = await seedListing('400');

    getSellerProductsMock.mockResolvedValueOnce(
      listOk([{ sellerProductId: 400, sellerProductName: 'Old Name' }]),
    );
    getSellerProductMock.mockResolvedValueOnce(
      detailOk({
        sellerProductId: 400,
        sellerProductName: 'New Name',
        statusName: 'APPROVED',
        items: [
          { vendorItemId: 5001, itemName: 'OK Item', salePrice: 1000 },
          { vendorItemId: 0, itemName: 'BROKEN' },
        ],
      }),
    );

    const result = await service.syncProducts(companyId);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.details?.[0]).toContain('Listing 400');
    expect(result.details?.[0]).toContain('vendorItemId');

    const after = await prisma.channelListing.findUnique({ where: { id: listing.id } });
    // tx rolled back → channelName must NOT be updated to "New Name".
    expect(after?.channelName).toBeNull();

    const options = await prisma.channelListingOption.findMany({ where: { listingId: listing.id } });
    expect(options).toHaveLength(0);
  });

  it('list endpoint ERROR aborts the run with a single recorded error', async () => {
    getSellerProductsMock.mockResolvedValueOnce({
      code: 'ERROR',
      message: 'rate limited',
      data: undefined,
    } as SellerProductListResponse);
    const result = await service.syncProducts(companyId);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.details?.[0]).toContain('rate limited');
    expect(getSellerProductMock).not.toHaveBeenCalled();
  });
});
