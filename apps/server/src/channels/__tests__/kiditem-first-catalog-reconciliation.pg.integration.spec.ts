import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelCatalogPublicationRepositoryAdapter } from '../adapter/out/repository/channel-catalog-publication.repository.adapter';
import { ChannelSyncRepositoryAdapter } from '../adapter/out/repository/channel-sync.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from '../adapter/out/repository/marketplace-registration.repository.adapter';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
  type SellerProductDetailResponse,
  type SellerProductListResponse,
} from '../application/port/out/provider/coupang-provider.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from '../application/port/out/repository/channel-sync.repository.port';
import { ChannelAccountService } from '../application/service/channel-account.service';
import { ChannelSyncService } from '../application/service/channel-sync.service';
import type { PrismaClient } from '@prisma/client';

describe('KidItem-first catalog reconciliation (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelSyncService;
  let publisher: ChannelCatalogPublicationRepositoryAdapter;
  let coupang: CoupangProviderPort;
  let channelAccountId: string;
  const organizationId = TEST_ORGANIZATION_ID;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    coupang = {
      getDeliveryCompanies: vi.fn(() => []),
      getSellerProducts: vi.fn(),
      getSellerProduct: vi.fn(),
      getOrderSheets: vi.fn(),
      confirmOrderSheets: vi.fn(),
      uploadInvoice: vi.fn(),
      approveReturn: vi.fn(),
    };
    const module = await Test.createTestingModule({
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
              vendorId: 'KIDITEM-FIRST-CATALOG',
              status: 'active',
            }),
          },
        },
        { provide: COUPANG_PROVIDER_PORT, useValue: coupang },
      ],
    }).compile();
    service = module.get(ChannelSyncService);
    publisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as unknown as PrismaService,
      new AiCatalogMediaPublicationRepositoryAdapter(),
    );
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
        name: 'KidItem-first Wing',
        externalAccountId: 'KIDITEM-FIRST-CATALOG',
        vendorId: 'KIDITEM-FIRST-CATALOG',
        isPrimary: true,
        status: 'active',
      },
    });
    channelAccountId = account.id;
  });

  afterEach(() => {
    vi.mocked(coupang.getSellerProducts).mockReset();
    vi.mocked(coupang.getSellerProduct).mockReset();
  });

  it('restores the exact variant link after full catalog publication deactivates its provisional option', async () => {
    const registration = await createRegistration({
      externalListingId: '252',
      submissionKey: 'full-catalog-registration-key',
      variantCount: 1,
    });

    await publishFullCatalog({
      externalListingId: '252',
      externalOptionId: '9252',
      sellerSku: 'full-catalog-registration-key',
      snapshotHash: 'c'.repeat(64),
    });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: registration.provisionalId },
    })).resolves.toMatchObject({ isActive: false });
    const actualBeforeSync = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId,
        listingId: registration.listingId,
        externalOptionId: '9252',
      },
    });
    expect(actualBeforeSync).toMatchObject({
      isActive: true,
      sellerSku: 'full-catalog-registration-key',
      productVariantId: null,
    });

    mockProductDetail({
      externalListingId: '252',
      externalOptionId: '9252',
      sellerSku: 'full-catalog-registration-key',
    });
    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });

    const activeOptions = await prisma.channelListingOption.findMany({
      where: { organizationId, listingId: registration.listingId, isActive: true },
    });
    expect(activeOptions).toEqual([
      expect.objectContaining({
        id: actualBeforeSync.id,
        externalOptionId: '9252',
        sellerSku: 'full-catalog-registration-key',
        productVariantId: registration.variantIds[0],
      }),
    ]);
  });

  it('fails safely when multiple inactive provisional links share the deterministic seller SKU', async () => {
    const registration = await createRegistration({
      externalListingId: '253',
      submissionKey: 'ambiguous-registration-key',
      variantCount: 2,
    });
    const secondProvisional = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: registration.listingId,
        externalOptionId: 'SECOND-LOGICAL',
        sellerSku: 'ambiguous-registration-key',
        productVariantId: registration.variantIds[1],
        isActive: true,
      },
    });

    await publishFullCatalog({
      externalListingId: '253',
      externalOptionId: '9253',
      sellerSku: 'ambiguous-registration-key',
      snapshotHash: 'd'.repeat(64),
    });
    mockProductDetail({
      externalListingId: '253',
      externalOptionId: '9253',
      sellerSku: 'ambiguous-registration-key',
    });

    const result = await service.syncProducts(organizationId);
    expect(result).toMatchObject({ synced: 0, errors: 1 });
    expect(result.details).toEqual([
      expect.stringContaining('Ambiguous KidItem-first provisional options'),
    ]);
    const actual = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId,
        listingId: registration.listingId,
        externalOptionId: '9253',
      },
    });
    expect(actual).toMatchObject({ isActive: true, productVariantId: null });
    await expect(prisma.channelListingOption.findMany({
      where: {
        organizationId,
        id: { in: [registration.provisionalId, secondProvisional.id] },
      },
      orderBy: { id: 'asc' },
    })).resolves.toEqual([
      expect.objectContaining({ isActive: false, productVariantId: expect.any(String) }),
      expect.objectContaining({ isActive: false, productVariantId: expect.any(String) }),
    ]);
  });

  it('does not adopt a same-listing seller SKU link without KidItem-first source identity', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: 'NON-REGISTRATION-PRODUCT',
        name: 'Non-registration product',
        variants: {
          create: {
            code: 'NON-REGISTRATION-VARIANT',
            name: 'Non-registration variant',
            isDefault: true,
          },
        },
      },
      include: { variants: true },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId,
        externalId: '254',
        masterProductId: product.id,
        isActive: true,
      },
    });
    const unrelatedLink = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: 'UNRELATED-LOGICAL',
        sellerSku: 'non-registration-key',
        productVariantId: product.variants[0]!.id,
        isActive: true,
      },
    });
    const actual = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: '9254',
        isActive: true,
      },
    });
    mockProductDetail({
      externalListingId: '254',
      externalOptionId: '9254',
      sellerSku: 'non-registration-key',
    });

    await expect(service.syncProducts(organizationId)).resolves.toMatchObject({
      synced: 1,
      errors: 0,
    });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: actual.id },
    })).resolves.toMatchObject({
      sellerSku: 'non-registration-key',
      productVariantId: null,
      isActive: true,
    });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: unrelatedLink.id },
    })).resolves.toMatchObject({
      productVariantId: product.variants[0]!.id,
      isActive: true,
    });
  });

  async function createRegistration(input: {
    externalListingId: string;
    submissionKey: string;
    variantCount: number;
  }) {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId,
        code: `KI-CATALOG-${input.externalListingId}`,
        name: `KidItem catalog ${input.externalListingId}`,
        variants: {
          create: Array.from({ length: input.variantCount }, (_, index) => ({
            code: `KI-CATALOG-${input.externalListingId}-${index + 1}`,
            name: `Option ${index + 1}`,
            isDefault: index === 0,
          })),
        },
      },
      include: { variants: { orderBy: { code: 'asc' } } },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId,
        sourceUrl: `https://example.com/catalog-${input.externalListingId}`,
        sourcePlatform: 'test',
        name: `KidItem catalog ${input.externalListingId}`,
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
        submissionKey: input.submissionKey,
        externalListingId: input.externalListingId,
        displayName: `KidItem catalog ${input.externalListingId}`,
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'FIRST-LOGICAL',
          productVariantId: product.variants[0]!.id,
        }],
      }));
    const provisional = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId,
        listingId: registered.listingId,
        sellerSku: input.submissionKey,
      },
    });
    return {
      listingId: registered.listingId,
      provisionalId: provisional.id,
      variantIds: product.variants.map((variant) => variant.id),
    };
  }

  async function publishFullCatalog(input: {
    externalListingId: string;
    externalOptionId: string;
    sellerSku: string;
    snapshotHash: string;
  }) {
    const collectionRun = await prisma.channelScrapeRun.create({
      data: {
        organizationId,
        channelAccountId,
        clientRunKey: randomUUID(),
        channel: 'coupang',
        source: 'coupang_wing_catalog_browser',
        pageType: 'catalog_full_snapshot',
        status: 'running',
        parserVersion: 'kiditem-first-test-v1',
        metaJson: { phase: 'ready_to_finalize' },
      },
    });
    return publisher.publish({
      organizationId,
      userId: TEST_USER_ID,
      channelAccountId,
      collectionRunId: collectionRun.id,
      snapshotHash: input.snapshotHash,
      products: [{
        ordinal: 0,
        product: catalogProduct(input),
      }],
    });
  }

  function mockProductDetail(input: {
    externalListingId: string;
    externalOptionId: string;
    sellerSku: string;
  }) {
    vi.mocked(coupang.getSellerProducts).mockResolvedValueOnce(
      listOk(input.externalListingId),
    );
    vi.mocked(coupang.getSellerProduct).mockResolvedValueOnce(
      detailOk(input),
    );
  }
});

function catalogProduct(input: {
  externalListingId: string;
  externalOptionId: string;
  sellerSku: string;
}) {
  return {
    externalProductId: input.externalListingId,
    registeredName: `Registered ${input.externalListingId}`,
    displayName: `Displayed ${input.externalListingId}`,
    category: '완구',
    manufacturer: '제조사',
    brand: '브랜드',
    productStatus: '승인완료',
    options: [{
      externalOptionId: input.externalOptionId,
      optionName: '기본',
      skuStatus: '판매중',
      salePrice: 12_900,
      sellerSku: input.sellerSku,
      modelNumber: 'MODEL-1',
      barcode: '001234567890',
      attributes: [],
      media: [],
      raw: { source: 'fixture-option' },
    }],
    media: [],
    raw: { externalProductId: input.externalListingId },
  };
}

function listOk(sellerProductId: string): SellerProductListResponse {
  return {
    code: 'SUCCESS',
    message: 'OK',
    data: {
      content: [{
        sellerProductId: Number(sellerProductId),
        sellerProductName: `Product ${sellerProductId}`,
      }],
    },
  };
}

function detailOk(input: {
  externalListingId: string;
  externalOptionId: string;
  sellerSku: string;
}): SellerProductDetailResponse {
  return {
    code: 'SUCCESS',
    message: 'OK',
    data: {
      sellerProductId: Number(input.externalListingId),
      sellerProductName: `Product ${input.externalListingId}`,
      items: [{
        vendorItemId: Number(input.externalOptionId),
        externalVendorSku: input.sellerSku,
        itemName: 'Approved option',
        originalPrice: 0,
        salePrice: 12_900,
      }],
    },
  };
}
