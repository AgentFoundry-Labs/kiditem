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
import { MarketplaceRegistrationRepositoryAdapter } from '../adapter/out/repository/marketplace-registration.repository.adapter';
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
    externalVendorSku?: string;
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
        externalVendorSku: i.externalVendorSku,
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
  let channelAccountId: string;
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
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: 'Primary Wing',
        externalAccountId: 'PRODUCT-SYNC-PRIMARY',
        isPrimary: true,
        status: 'active',
      },
    });
    channelAccountId = account.id;
  });

  afterEach(() => {
    vi.mocked(coupangPort.getSellerProducts).mockReset();
    vi.mocked(coupangPort.getSellerProduct).mockReset();
  });

  async function seedListing(externalId: string) {
    return prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId,
        externalId,
      },
      select: { id: true, channelAccountId: true },
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
    expect(await readMappingGeneration()).toBe(1n);

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
    expect(await readMappingGeneration()).toBe(1n);

    const [deliveryInfoState] = await prisma.$queryRaw<Array<{ isNull: boolean }>>`
      SELECT delivery_info IS NULL AS "isNull"
        FROM channel_listings
       WHERE id = ${listing.id}::uuid
    `;
    expect(deliveryInfoState?.isNull).toBe(true);
  });

  it('advances mapping generation when a previously inactive provider option becomes active', async () => {
    const listing = await seedListing('205');
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: '9205',
        isActive: false,
      },
    });
    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 205, statusName: 'APPROVED' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(detailOk({
      sellerProductId: 205,
      items: [{ vendorItemId: 9205, itemName: 'Reactivated', salePrice: 1_000 }],
    }));

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: option.id },
    })).resolves.toMatchObject({ isActive: true, itemName: 'Reactivated' });
    expect(await readMappingGeneration()).toBe(1n);
  });

  it('advances listing identity generation when registration creates or reactivates a linkless listing', async () => {
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-linkless',
        sourcePlatform: 'test',
        name: 'Linkless registration',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const input = {
      organizationId,
      sourceCandidateId: candidate.id,
      channelAccountId,
      submissionKey: 'registration-linkless-key',
      externalListingId: '245',
      displayName: 'Linkless registration',
    };

    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input));
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input));
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.channelListing.update({
      where: { id: registered.listingId },
      data: { isActive: false },
    });
    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input));
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('reactivates an inactive registration option and advances identity generation once', async () => {
    const [product, sku, candidate] = await Promise.all([
      prisma.masterProduct.create({
        data: {
          organizationId,
          code: 'KI-REGISTER-INACTIVE-OPTION',
          name: 'Inactive registration option',
        },
      }),
      prisma.sellpiaInventorySku.create({
        data: {
          organizationId,
          code: 'KI-REGISTER-INACTIVE-OPTION-SKU',
          name: 'Inactive option SKU',
        },
      }),
      prisma.sourcingCandidate.create({
        data: {
          organizationId,
          sourceUrl: 'https://example.com/register-inactive-option',
          sourcePlatform: 'test',
          name: 'Inactive registration option',
        },
      }),
    ]);
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const input = {
      organizationId,
      sourceCandidateId: candidate.id,
      channelAccountId,
      submissionKey: 'registration-inactive-option-key',
      externalListingId: '246',
      displayName: 'Inactive registration option',
      masterProductId: product.id,
      optionLinks: [{
        externalOptionId: 'INACTIVE-OPTION',
        sellpiaInventorySkuId: sku.id,
        quantity: 1,
      }],
    };

    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input));
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.channelListingOption.update({
      where: { id: option.id },
      data: { isActive: false },
    });
    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input));

    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: option.id },
    })).resolves.toMatchObject({ isActive: true });
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('promotes the KidItem-first provisional option to vendorItemId without losing its direct inventory recipe', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-SYNC',
        name: 'Registered sync',
      },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-SYNC-BLUE',
        name: 'Blue',
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-sync',
        sourcePlatform: 'test',
        name: 'Registered sync',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-key',
        externalListingId: '250',
        displayName: 'Registered sync',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'BLUE-LOGICAL',
          sellpiaInventorySkuId: sku.id,
          quantity: 2,
        }],
      }));
    expect(await readMappingGeneration()).toBe(1n);
    const provisional = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    expect(provisional).toMatchObject({
      externalOptionId: 'BLUE-LOGICAL',
      sellerSku: 'registration-key',
    });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: provisional.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-key',
        externalListingId: '250',
        displayName: 'Registered sync',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'BLUE-LOGICAL',
          sellpiaInventorySkuId: sku.id,
          quantity: 2,
        }],
      }));
    expect(await readMappingGeneration()).toBe(1n);

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 250, statusName: 'APPROVED' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(detailOk({
      sellerProductId: 250,
      items: [{
        vendorItemId: 9250,
        externalVendorSku: 'registration-key',
        itemName: 'Blue approved',
        salePrice: 10_500,
      }],
    }));

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    const activeOptions = await prisma.channelListingOption.findMany({
      where: { listingId: registered.listingId, isActive: true },
    });
    expect(activeOptions).toHaveLength(1);
    expect(activeOptions[0]).toMatchObject({
      id: provisional.id,
      externalOptionId: '9250',
      sellerSku: 'registration-key',
      itemName: 'Blue approved',
      salePrice: 10_500,
    });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: provisional.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('transfers a provisional recipe to the provider option once and advances mapping generation once', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-TRANSFER',
        name: 'Registered transfer',
      },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-TRANSFER-BLUE',
        name: 'Blue',
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-transfer',
        sourcePlatform: 'test',
        name: 'Registered transfer',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-transfer-key',
        externalListingId: '252',
        displayName: 'Registered transfer',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'BLUE-LOGICAL',
          sellpiaInventorySkuId: sku.id,
          quantity: 2,
        }],
      }));
    const provisional = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    const actual = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: registered.listingId,
        externalOptionId: '9252',
        isActive: true,
      },
    });
    expect(await readMappingGeneration()).toBe(1n);

    const list = listOk([{ sellerProductId: 252, statusName: 'APPROVED' }]);
    vi.mocked(coupangPort.getSellerProducts)
      .mockResolvedValueOnce(list)
      .mockResolvedValueOnce(list);
    vi.mocked(coupangPort.getSellerProduct)
      .mockResolvedValueOnce(detailOk({
        sellerProductId: 252,
        items: [{
          vendorItemId: 9252,
          externalVendorSku: 'registration-transfer-key',
          itemName: 'Blue approved',
          salePrice: 10_500,
        }],
      }))
      .mockResolvedValueOnce(detailOk({
        sellerProductId: 252,
        items: [{
          vendorItemId: 9252,
          externalVendorSku: 'registration-transfer-key',
          itemName: 'Blue approved again',
          salePrice: 10_500,
        }],
      }));

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: actual.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: provisional.id },
    })).resolves.toMatchObject({ isActive: false });
    expect(await readMappingGeneration()).toBe(2n);

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('keeps an earlier identity change when an inactive actual option has no recipe to transfer', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-INACTIVE-ACTUAL',
        name: 'Inactive actual',
      },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-INACTIVE-ACTUAL-SKU',
        name: 'Inactive actual SKU',
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-inactive-actual',
        sourcePlatform: 'test',
        name: 'Inactive actual',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-inactive-actual-key',
        externalListingId: '254',
        displayName: 'Inactive actual',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'INACTIVE-ACTUAL-LOGICAL',
          sellpiaInventorySkuId: sku.id,
          quantity: 1,
        }],
      }));
    const provisional = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    await prisma.channelListingOptionInventoryComponent.deleteMany({
      where: { channelListingOptionId: provisional.id },
    });
    const actual = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: registered.listingId,
        externalOptionId: '9254',
        isActive: false,
      },
    });

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 254, statusName: 'APPROVED' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(detailOk({
      sellerProductId: 254,
      items: [{
        vendorItemId: 9254,
        externalVendorSku: 'registration-inactive-actual-key',
        itemName: 'Inactive actual approved',
        salePrice: 10_500,
      }],
    }));

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: actual.id },
    })).resolves.toMatchObject({ isActive: true });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: provisional.id },
    })).resolves.toMatchObject({ isActive: false });
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('rolls back provisional recipe transfer and mapping generation when the increment overflows', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-TRANSFER-ROLLBACK',
        name: 'Registered transfer rollback',
      },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-TRANSFER-ROLLBACK-BLUE',
        name: 'Blue',
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-transfer-rollback',
        sourcePlatform: 'test',
        name: 'Registered transfer rollback',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-transfer-rollback-key',
        externalListingId: '253',
        displayName: 'Registered transfer rollback',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'BLUE-LOGICAL',
          sellpiaInventorySkuId: sku.id,
          quantity: 2,
        }],
      }));
    const provisional = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    const actual = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: registered.listingId,
        externalOptionId: '9253',
        isActive: true,
      },
    });
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.upsert({
      where: { organizationId },
      create: { organizationId, mappingGeneration: maximum },
      update: { mappingGeneration: maximum },
    });

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 253, statusName: 'APPROVED' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(detailOk({
      sellerProductId: 253,
      items: [{
        vendorItemId: 9253,
        externalVendorSku: 'registration-transfer-rollback-key',
        itemName: 'Blue approved',
        salePrice: 10_500,
      }],
    }));

    const result = await service.syncProducts(organizationId);
    expect(result).toMatchObject({ synced: 0, errors: 1 });
    await expect(prisma.channelListingOptionInventoryComponent.findFirst({
      where: { channelListingOptionId: actual.id },
    })).resolves.toBeNull();
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: provisional.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: sku.id, quantity: 2 });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: provisional.id },
    })).resolves.toMatchObject({ isActive: true });
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId },
    })).resolves.toMatchObject({
      activeFormulaVersionId: null,
      activatedAt: null,
      revision: 0,
      mappingGeneration: maximum,
    });
  });

  it('keeps an existing actual option recipe, retires the conflicting provisional option, and advances identity generation', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-CONFLICT',
        name: 'Registered conflict',
      },
    });
    const [provisionalSku, actualSku] = await Promise.all([
      prisma.sellpiaInventorySku.create({ data: {
        organizationId,
        code: 'KI-REGISTER-CONFLICT-PROVISIONAL',
        name: 'Provisional',
      } }),
      prisma.sellpiaInventorySku.create({ data: {
        organizationId,
        code: 'KI-REGISTER-CONFLICT-ACTUAL',
        name: 'Actual',
      } }),
    ]);
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-conflict',
        sourcePlatform: 'test',
        name: 'Registered conflict',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-conflict-key',
        externalListingId: '251',
        displayName: 'Registered conflict',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'PROVISIONAL-LOGICAL',
          sellpiaInventorySkuId: provisionalSku.id,
          quantity: 2,
        }],
      }));
    const provisional = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    const actual = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: registered.listingId,
        externalOptionId: '9251',
        isActive: true,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId,
        channelListingOptionId: actual.id,
        sellpiaInventorySkuId: actualSku.id,
        quantity: 3,
      },
    });

    vi.mocked(coupangPort.getSellerProducts).mockResolvedValueOnce(
      listOk([{ sellerProductId: 251, statusName: 'APPROVED' }]),
    );
    vi.mocked(coupangPort.getSellerProduct).mockResolvedValueOnce(detailOk({
      sellerProductId: 251,
      items: [{
        vendorItemId: 9251,
        externalVendorSku: 'registration-conflict-key',
        itemName: 'Manual actual approved',
        salePrice: 11_500,
      }],
    }));

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: actual.id },
    })).resolves.toMatchObject({
      isActive: true,
      sellerSku: 'registration-conflict-key',
      itemName: 'Manual actual approved',
      salePrice: 11_500,
    });
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: actual.id },
    })).resolves.toMatchObject({ sellpiaInventorySkuId: actualSku.id, quantity: 3 });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: provisional.id },
    })).resolves.toMatchObject({
      isActive: false,
    });
    await expect(prisma.channelListingOption.count({
      where: { listingId: registered.listingId, isActive: true },
    })).resolves.toBe(1);
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('rolls back initial registration links when mapping generation cannot advance', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-ROLLBACK',
        name: 'Registered rollback',
      },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId,
        code: 'KI-REGISTER-ROLLBACK-BLUE',
        name: 'Blue',
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: 'https://example.com/register-rollback',
        sourcePlatform: 'test',
        name: 'Registered rollback',
      },
    });
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: { organizationId, mappingGeneration: maximum },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    await expect(prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
        channelAccountId,
        submissionKey: 'registration-rollback-key',
        externalListingId: '254',
        displayName: 'Registered rollback',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'BLUE-LOGICAL',
          sellpiaInventorySkuId: sku.id,
          quantity: 2,
        }],
      }))).rejects.toThrow();

    const [listingCount, optionCount, state] = await Promise.all([
      prisma.channelListing.count({
        where: { organizationId, externalId: '254' },
      }),
      prisma.channelListingOption.count({
        where: { organizationId, sellerSku: 'registration-rollback-key' },
      }),
      prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId },
      }),
    ]);
    expect(listingCount).toBe(0);
    expect(optionCount).toBe(0);
    expect(state).toMatchObject({
      activeFormulaVersionId: null,
      activatedAt: null,
      revision: 0,
      mappingGeneration: maximum,
    });
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
        data: { isActive: false },
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
    expect(after?.isActive).toBe(false);
    expect(after?.channelName).toBeNull();
    const options = await prisma.channelListingOption.findMany({ where: { listingId: listing.id } });
    expect(options).toHaveLength(0);
    expect(await readMappingGeneration()).toBeNull();
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

  async function readMappingGeneration(): Promise<bigint | null> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? null;
  }
});
