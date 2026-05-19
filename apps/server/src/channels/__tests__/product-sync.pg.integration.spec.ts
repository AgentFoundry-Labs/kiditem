import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelSyncService } from '../application/service/channel-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
  type SellerProductListResponse,
  type SellerProductDetailResponse,
} from '../application/port/out/provider/coupang-provider.port';
import { ChannelSyncRepositoryAdapter } from '../adapter/out/repository/channel-sync.repository.adapter';
import { CHANNEL_SYNC_REPOSITORY_PORT } from '../application/port/out/repository/channel-sync.repository.port';
import { ChannelAccountService } from '../application/service/channel-account.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

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
  };
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
  };
}

describe('Product sync (PG integration, Wave C1)', () => {
  let prisma: PrismaClient;
  let service: ChannelSyncService;
  let coupangPort: CoupangProviderPort;
  const organizationId = TEST_ORGANIZATION_ID;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    coupangPort = {
      getDeliveryCompanies: vi.fn(() => []),
      getSellerProducts: vi.fn(),
      getSellerProduct: vi.fn(),
      getOrderSheets: vi.fn(),
      confirmOrderSheets: vi.fn(),
      uploadInvoice: vi.fn(),
      approveReturn: vi.fn(),
    };
    const m = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        ChannelSyncRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: CHANNEL_SYNC_REPOSITORY_PORT, useExisting: ChannelSyncRepositoryAdapter },
        {
          provide: ChannelAccountService,
          useValue: {
            getCoupangSettings: vi.fn().mockResolvedValue({
              configured: true,
              vendorId: 'TEST_VENDOR',
              accessKeyMasked: 'TEST********KEY',
              hasAccessKey: true,
              hasSecretKey: true,
              status: 'active',
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            }),
          },
        },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupangPort },
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
    vi.mocked(coupangPort.getSellerProducts).mockReset();
    vi.mocked(coupangPort.getSellerProduct).mockReset();
  });

  async function seedListing(externalId: string) {
    const master = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: `M-${externalId}`,
        name: `Master ${externalId}`,
        optionCounter: 0,
      },
    });
    return prisma.channelListing.create({
      data: {
        organizationId,
        masterId: master.id,
        channel: 'coupang',
        externalId,
      },
      select: { id: true, masterId: true },
    });
  }

  it('refreshes existing listing fields from seller-product detail and stores Coupang status mapped', async () => {
    const listing = await seedListing('100');

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 100, sellerProductName: 'Stale Name', statusName: 'APPROVED' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(
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

    const result = await service.syncProducts(organizationId);
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

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(list).mockResolvedValueOnce(list);
    vi.mocked(coupangPort.getSellerProduct)
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

    const r1 = await service.syncProducts(organizationId);
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

    const r2 = await service.syncProducts(organizationId);
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

    const [deliveryInfoState] = await prisma.$queryRaw<Array<{ isNull: boolean }>>`
      SELECT delivery_info IS NULL AS "isNull"
        FROM channel_listings
       WHERE id = ${listing.id}::uuid
    `;
    expect(deliveryInfoState?.isNull).toBe(true);
  });

  it('skips and reports sellerProductId without an existing ChannelListing — does not create master', async () => {
    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 999, sellerProductName: 'New Listing' }]),
    );
    const result = await service.syncProducts(organizationId);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details?.[0]).toContain('Listing 999');
    expect(result.details?.[0]).toContain('no matching ChannelListing');
    // Detail call must be skipped — no point fetching options for unmatched listings.
    expect(coupangPort.getSellerProduct).not.toHaveBeenCalled();

    const masters = await prisma.masterProduct.findMany({ where: { organizationId } });
    expect(masters).toHaveLength(0);
    const listings = await prisma.channelListing.findMany({ where: { organizationId } });
    expect(listings).toHaveLength(0);
  });

  it('paginates seller-products via nextToken and processes both pages', async () => {
    const listingA = await seedListing('300');
    const listingB = await seedListing('301');

    vi.mocked(coupangPort.getSellerProducts)
      .mockResolvedValueOnce(listOk([{ sellerProductId: 300 }], 'nt-abc'))
      .mockResolvedValueOnce(listOk([{ sellerProductId: 301 }]));
    vi.mocked(coupangPort.getSellerProduct)
      .mockResolvedValueOnce(detailOk({ sellerProductId: 300, items: [] }))
      .mockResolvedValueOnce(detailOk({ sellerProductId: 301, items: [] }));

    const result = await service.syncProducts(organizationId);
    expect(result.synced).toBe(2);
    expect(result.errors).toBe(0);
    expect(listingA.id).not.toBe(listingB.id);
  });

  it('records a detail endpoint non-success response as a listing error and continues', async () => {
    await seedListing('350');
    await seedListing('351');

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 350 }, { sellerProductId: 351 }]),
    );
    vi.mocked(coupangPort.getSellerProduct)
      .mockResolvedValueOnce({
        code: 'FORBIDDEN',
        message: 'invalid credentials',
        data: undefined,
      } as SellerProductDetailResponse)
      .mockResolvedValueOnce(
        detailOk({
          sellerProductId: 351,
          sellerProductName: 'Still Synced',
          statusName: 'APPROVED',
          items: [],
        }),
      );

    const result = await service.syncProducts(organizationId);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.details?.[0]).toContain('Listing 350');
    expect(result.details?.[0]).toContain('FORBIDDEN');

    const synced = await prisma.channelListing.findFirst({
      where: { organizationId, externalId: '351' },
    });
    expect(synced?.channelName).toBe('Still Synced');
    expect(synced?.status).toBe('active');
  });

  it('does not update options when the matched listing is soft-deleted after the precheck', async () => {
    const listing = await seedListing('360');

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 360 }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockImplementationOnce(async () => {
      await prisma.channelListing.update({
        where: { id: listing.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      return detailOk({
        sellerProductId: 360,
        sellerProductName: 'Should Not Apply',
        statusName: 'APPROVED',
        items: [{ vendorItemId: 36001, itemName: 'Late Option', salePrice: 1000 }],
      });
    });

    const result = await service.syncProducts(organizationId);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.details?.[0]).toContain('Listing 360');
    expect(result.details?.[0]).toContain('no longer active');

    const after = await prisma.channelListing.findUnique({ where: { id: listing.id } });
    expect(after?.isDeleted).toBe(true);
    expect(after?.channelName).toBeNull();
    const options = await prisma.channelListingOption.findMany({ where: { listingId: listing.id } });
    expect(options).toHaveLength(0);
  });

  it('throws inside transaction when Coupang item is missing vendorItemId; option upserts roll back, listing field changes do too', async () => {
    const listing = await seedListing('400');

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 400, sellerProductName: 'Old Name' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(
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

    const result = await service.syncProducts(organizationId);
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

  it('list endpoint non-success response aborts the run with a single recorded error', async () => {
    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce({
      code: 'FORBIDDEN',
      message: 'invalid credentials',
      data: undefined,
    } as SellerProductListResponse);
    const result = await service.syncProducts(organizationId);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.details?.[0]).toContain('FORBIDDEN');
    expect(result.details?.[0]).toContain('invalid credentials');
    expect(coupangPort.getSellerProduct).not.toHaveBeenCalled();
  });
});
