import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelCatalogPublicationRepositoryAdapter } from '../adapter/out/repository/channel-catalog-publication.repository.adapter';
import { ChannelCatalogCollectionRepositoryAdapter } from '../adapter/out/repository/channel-catalog-collection.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeUseCase } from '../application/usecase/channel-option-recipe.usecase';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { freezeProductRegistrationPayload } from '../domain/registration-submission-payload';
import {
  ChannelCatalogCollectionService,
  hashCatalogChunkPayload,
} from '../application/service/channel-catalog-collection.service';
import type {
  CoupangCatalogProductV1,
  PutCoupangCatalogChunkRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { Prisma, PrismaClient } from '@prisma/client';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('ChannelCatalogPublicationRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let collection: ChannelCatalogCollectionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    const recipes = new ChannelOptionRecipeUseCase(
      new ChannelOptionRecipeRepositoryAdapter(
        prisma as unknown as PrismaService,
        new ProductTransactionalReadRepositoryAdapter(),
      ),
    );
    const publisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as unknown as PrismaService,
      new AiCatalogMediaPublicationRepositoryAdapter(),
      alerts,
      recipes,
    );
    collection = new ChannelCatalogCollectionService(
      new ChannelCatalogCollectionRepositoryAdapter(
        prisma as unknown as PrismaService,
        alerts,
        publisher,
      ),
      publisher,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: 'vendor-primary',
        vendorId: 'vendor-primary',
      },
    });
  });

  it('publishes channel identities and media without creating operating products', async () => {
    const result = await publish(randomUUID(), [product('P-1', 'S-1')]);

    const listing = await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: 'P-1',
      },
      include: {
        options: { include: { inventoryComponents: true } },
        contentWorkspaces: {
          include: {
            currentThumbnailSelection: { include: { contentAsset: true } },
          },
        },
      },
    });

    expect(result).toMatchObject({
      duplicate: false,
      changes: {
        createdProductCount: 1,
        createdSkuCount: 1,
      },
    });
    expect(listing).toMatchObject({
      masterProductId: null,
      displayName: 'P-1 노출상품',
      isActive: true,
    });
    expect(listing.options).toEqual([
      expect.objectContaining({
        externalOptionId: 'S-1',
        itemName: '기본',
        inventoryComponents: [],
      }),
    ]);
    expect(await prisma.masterProduct.count()).toBe(0);
    expect(listing.contentWorkspaces[0]?.currentThumbnailSelection?.contentAsset).toMatchObject({
      url: 'https://example.com/P-1.jpg',
    });
  });

  it('publishes scraper data when vendorId differs from a legacy external alias', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: {
        externalAccountId: 'legacy-wing-alias',
        vendorId: 'vendor-primary',
      },
    });

    await expect(publish(randomUUID(), [product('P-1', 'S-1')])).resolves.toMatchObject({
      duplicate: false,
      changes: {
        createdProductCount: 1,
        createdSkuCount: 1,
      },
    });
  });

  it('preserves a confirmed product link and direct option components on recollection', async () => {
    await publish(randomUUID(), [product('P-1', 'S-1'), product('P-2', 'S-2')]);
    const before = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-1' },
      include: { options: true },
    });
    const absentBefore = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-2' },
      include: { options: true },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-1',
        sourceAccountKey: 'fixture',
        sourceProductCode: 'KI-1',
        sourceOptionCode: '',
        name: '운영 상품',
      },
    });
    const inventorySku = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID-COMP',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SP-1',
        sourceOptionCode: '',
        name: '실재고',
        currentStock: 20,
      },
    });
    await prisma.channelListing.update({
      where: { id: before.id },
      data: { masterProductId: master.id },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: before.options[0]!.id,
        masterProductId: inventorySku.id,
        quantity: 2,
      },
    });

    await publish(randomUUID(), [product('P-1', 'S-1', { displayName: '수정된 노출명' })]);

    const after = await prisma.channelListing.findUniqueOrThrow({
      where: { id: before.id },
      include: { options: { include: { inventoryComponents: true } } },
    });
    const absentAfter = await prisma.channelListing.findUniqueOrThrow({
      where: { id: absentBefore.id },
      include: { options: true },
    });
    expect(after).toMatchObject({
      masterProductId: master.id,
      displayName: '수정된 노출명',
      isActive: true,
    });
    expect(after.options[0]).toMatchObject({
      id: before.options[0]!.id,
      inventoryComponents: [
        expect.objectContaining({
          masterProductId: inventorySku.id,
          quantity: 2,
        }),
      ],
    });
    expect(absentAfter.isActive).toBe(false);
    expect(absentAfter.options[0]?.isActive).toBe(false);
  });

  it('links a later catalog capture to the frozen registered bundle code without allocating another code', async () => {
    await publish(randomUUID(), [product('P-REGISTERED', 'S-REGISTERED')]);
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: ACCOUNT_ID, externalId: 'P-REGISTERED' },
      include: { options: true },
    });
    const option = listing.options[0]!;
    const component = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00000001',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SP-REGISTERED-BUNDLE',
        sourceOptionCode: '',
        name: 'Registered bundle component',
        currentStock: 4,
      },
    });
    const frozen = freezeProductRegistrationPayload({
      registrationInput: {
        kidItemCode: 'KID12345678',
        sellpiaMatch: {
          sellpiaInventorySkuId: component.id,
          quantity: 2,
          code: 'SP-REGISTERED-BUNDLE',
        },
        wingProduct: {
          variants: [{ vendorItemCode: 'KID12345678' }],
        },
      },
    });
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: randomUUID(),
        channelAccountId: ACCOUNT_ID,
        channelListingId: listing.id,
        executionKind: 'external_wing',
        idempotencyKey: randomUUID(),
        requestHash: frozen.hash,
        submissionPayloadJson: frozen.payload as unknown as Prisma.InputJsonValue,
        submissionPayloadHash: frozen.hash,
        status: 'succeeded',
        providerOutcome: 'succeeded',
        providerSubmissionId: 'provider-registered-bundle',
        externalListingId: 'P-REGISTERED',
        resultJson: { externalListingId: 'P-REGISTERED' },
      },
    });

    await publish(randomUUID(), [product('P-REGISTERED', 'S-REGISTERED', {
      sellerSku: 'KID12345678',
    })]);

    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: option.id },
      include: { inventoryComponents: true },
    })).resolves.toMatchObject({
      sellerSku: 'KID12345678',
      kidItemCode: 'KID12345678',
      inventoryComponents: [{ masterProductId: component.id, quantity: 2 }],
    });
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: listing.id },
    })).resolves.toMatchObject({ masterProductId: component.id });
  });

  it('publishes a new identical capture without duplicating canonical identities', async () => {
    const first = await publish(randomUUID(), [product('P-1', 'S-1')]);
    const repeated = await publish(randomUUID(), [product('P-1', 'S-1')]);

    expect(repeated.sourceImportRunId).not.toBe(first.sourceImportRunId);
    expect(repeated.duplicate).toBe(false);
    expect(await prisma.channelListing.count()).toBe(1);
    expect(await prisma.channelListingOption.count()).toBe(1);
  });

  it('advances mapping generation for active identity changes but not metadata-only or rejected publication', async () => {
    await publish(randomUUID(), [product('P-1', 'S-1')]);
    await expect(mappingGeneration()).resolves.toBe(1n);

    await publish(randomUUID(), [product('P-1', 'S-1', { displayName: '메타데이터만 변경' })]);
    await expect(mappingGeneration()).resolves.toBe(1n);

    await publish(randomUUID(), [product('P-1', 'S-1'), product('P-2', 'S-2')]);
    await expect(mappingGeneration()).resolves.toBe(2n);

    await publish(randomUUID(), [product('P-1', 'S-1')]);
    await expect(mappingGeneration()).resolves.toBe(3n);

    await publish(randomUUID(), [product('P-1', 'S-1'), product('P-2', 'S-2')]);
    await expect(mappingGeneration()).resolves.toBe(4n);

    await expect(publish(randomUUID(), [product('P-3', 'S-1')])).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(mappingGeneration()).resolves.toBe(4n);
    await expect(
      prisma.masterProductAbcFormulaState.findUnique({
        where: { organizationId: OTHER_ORGANIZATION_ID },
        select: { mappingGeneration: true },
      }),
    ).resolves.toBeNull();
  });

  it('rejects an external option moving to another parent and rolls back', async () => {
    await publish(randomUUID(), [product('P-1', 'S-1')]);
    await expect(publish(randomUUID(), [product('P-2', 'S-1')])).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(await prisma.channelListing.count({ where: { externalId: 'P-2' } })).toBe(0);
  });

  async function publish(key: string, products: ReturnType<typeof product>[]) {
    const permit = await collection.start({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      idempotencyKey: key,
      request: { collectorVersion: 'wing-inventory-v1' },
    });
    const scope = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      runId: permit.attemptId,
      attemptToken: permit.attemptToken,
    };
    const manifest = {
      totalItems: products.length,
      pageSize: 100,
      expectedPages: 1,
      firstPageFingerprint: 'a'.repeat(64),
    };
    const payloads: PutCoupangCatalogChunkRequest['payload'][] = [
      {
        version: 1,
        kind: 'discovery_page',
        page: 1,
        manifest,
        items: products.map((p, ordinal) => ({
          ordinal,
          externalProductId: p.externalProductId,
          registeredName: p.registeredName,
          primaryImageUrl: null,
          saleStatus: null,
        })),
      },
      {
        version: 1,
        kind: 'product_details',
        startOrdinal: 0,
        products: products.map((p, ordinal) => ({
          ordinal,
          product: p,
        })),
      },
      { version: 1, kind: 'manifest_confirmation', manifest },
    ];
    for (const payload of payloads) {
      await collection.putChunk({
        ...scope,
        kind: payload.kind,
        sequence: 1,
        request: {
          kind: payload.kind,
          sequence: 1,
          payload,
          checksum: hashCatalogChunkPayload(payload),
          itemCount: payload.kind === 'manifest_confirmation' ? 1 : products.length,
        } as PutCoupangCatalogChunkRequest,
      });
    }
    const ready = await collection.getStatus(scope);
    return (
      await collection.finalize({
        ...scope,
        request: { snapshotHash: ready.snapshotHash! },
      })
    ).publication!;
  }

  async function mappingGeneration(): Promise<bigint> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? 0n;
  }
});

function product(
  externalProductId: string,
  externalOptionId: string,
  overrides: { displayName?: string | null; sellerSku?: string | null } = {},
): CoupangCatalogProductV1 {
  return {
    externalProductId,
    registeredName: `${externalProductId} 등록상품`,
    displayName: overrides.displayName ?? `${externalProductId} 노출상품`,
    category: '완구',
    manufacturer: '제조사',
    brand: '브랜드',
    productStatus: '승인완료',
    options: [
      {
        externalOptionId,
        optionName: '기본',
        skuStatus: '판매중',
        salePrice: 12_900,
        sellerSku: overrides.sellerSku ?? `${externalProductId}-SELLER`,
        modelNumber: 'MODEL-1',
        barcode: '001234567890',
        attributes: [{ type: '색상', value: '파랑' }],
        media: [],
        raw: { source: 'fixture-option' },
      },
    ],
    media: [
      {
        sourceUrl: `https://example.com/${externalProductId}.jpg`,
        role: 'primary',
        sortOrder: 0,
        externalOptionId: null,
      },
    ],
    raw: { externalProductId },
  };
}
