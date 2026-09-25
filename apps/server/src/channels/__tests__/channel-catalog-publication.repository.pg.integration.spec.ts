import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { makeWingCatalogOperations } from '../../test-helpers/wing-catalog-operations';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelSkuAvailabilityService } from '../application/service/listing/channel-sku-availability.service';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../products/application/service/product-availability.usecase';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { freezeProductRegistrationPayload } from '../domain/registration/registration-submission-payload';
import type { CoupangCatalogBasicProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import type { Prisma, PrismaClient } from '@prisma/client';

const channelIntegrity = new ChannelIntegrityAdapter();

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

/** 목록 kind(`channels.wing_catalog_list`)의 finalize가 지키는 반영 규칙 — 실제 실행 계약과 PG로 돌린다. */
describe('Wing catalog list publication over the operation contract (PG integration)', () => {
  let prisma: PrismaClient;
  let wing: ReturnType<typeof makeWingCatalogOperations>;
  let availability: ChannelSkuAvailabilityService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    availability = new ChannelSkuAvailabilityService(
      new ChannelProductMatchingRepositoryAdapter(
        prismaService,
        new ProductTransactionalReadRepositoryAdapter(),
        new ProductSourceReadRepositoryAdapter(prismaService),
        makeChannelRecipes(prisma),
      ),
      new ProductAvailabilityUseCase(
        new ProductAvailabilityRepositoryAdapter(prismaService),
      ),
    );
    wing = makeWingCatalogOperations(prisma);
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
    expect(result).toMatchObject({ status: 'succeeded', result: { listedProductCount: 1, detailTargetProductIds: ['P-1'] } });

    const listing = await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: 'P-1',
      },
      include: {
        options: { include: { inventoryComponents: true } },
      },
    });

    expect(listing).toMatchObject({
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
    const contentWorkspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, channelListingId: listing.id, ownerType: 'channel_listing', isDeleted: false },
      include: { currentThumbnailAsset: true },
    });
    expect(contentWorkspace.currentThumbnailAsset).toMatchObject({
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

    await expect(publish(randomUUID(), [product('P-1', 'S-1')])).resolves.toMatchObject({ status: 'succeeded' });
    expect(await prisma.channelListing.count()).toBe(1);
    expect(await prisma.channelListingOption.count()).toBe(1);
  });

  it('preserves confirmed components and operator safety stock on recollection without starting stock actions', async () => {
    await publish(randomUUID(), [product('P-1', 'S-1'), product('P-2', 'S-2')]);
    const before = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-1' },
      include: { options: true },
    });
    const absentBefore = await prisma.channelListing.findFirstOrThrow({
      where: { channelAccountId: ACCOUNT_ID, externalId: 'P-2' },
      include: { options: true },
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
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: before.options[0]!.id,
        masterProductId: inventorySku.id,
        quantity: 2,
      },
    });

    expect(before.options[0]!.safetyStock).toBe(0);
    await availability.updateSafetyStock(TEST_ORGANIZATION_ID, before.options[0]!.id, 4);
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
      displayName: '수정된 노출명',
      isActive: true,
    });
    expect(after.options[0]).toMatchObject({
      id: before.options[0]!.id,
      safetyStock: 4,
      inventoryComponents: [
        expect.objectContaining({
          masterProductId: inventorySku.id,
          quantity: 2,
        }),
      ],
    });
    // KID-348: 목록에서 빠진 상품은 삭제 확인 전까지 그대로 둔다.
    expect(absentAfter.isActive).toBe(true);
    expect(absentAfter.options[0]?.isActive).toBe(true);
    expect(await prisma.productRegistrationExecution.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).toBe(0);
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
      adapterPayload: {
        vendorItemCode: 'KID12345678',
        sellpiaMatch: {
          sellpiaInventorySkuId: component.id,
          quantity: 2,
          code: 'SP-REGISTERED-BUNDLE',
        },
        wingProduct: {
          variants: [{ vendorItemCode: 'KID12345678' }],
        },
      },
    }, channelIntegrity.sha256);
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: await createRegistrationTarget(prisma, ACCOUNT_ID),
        channelAccountId: ACCOUNT_ID,
        channelListingId: listing.id,
        executionKind: 'register',
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
  });

  it.each([
    { recipePresentBeforeDeletion: true, expectedMappingStatus: 'needs_review' as const },
    { recipePresentBeforeDeletion: false, expectedMappingStatus: 'unmatched' as const },
  ])(
    'keeps a deleted registered source unresolved across later catalog captures (%j)',
    async ({ recipePresentBeforeDeletion, expectedMappingStatus }) => {
      const sellerSku = 'KID87654321';
      const sourceCode = 'SP-DELETED-BUNDLE';
      await publish(randomUUID(), [product('P-DELETED', 'S-DELETED')]);
      const listing = await prisma.channelListing.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          externalId: 'P-DELETED',
        },
        include: { options: true },
      });
      const option = listing.options[0]!;
      const source = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00000003',
          sourceAccountKey: 'kiditem',
          sourceProductCode: sourceCode,
          sourceOptionCode: '',
          name: 'Deleted registered bundle component',
          currentStock: 4,
        },
      });
      const execution = await createFrozenRegistrationExecution({
        prisma,
        channelAccountId: ACCOUNT_ID,
        channelListingId: listing.id,
        masterProductId: source.id,
        sourceCode,
        sellerSku,
      });

      if (recipePresentBeforeDeletion) {
        await publish(randomUUID(), [product('P-DELETED', 'S-DELETED', { sellerSku })]);
      }
      const beforeOption = await prisma.channelListingOption.findUniqueOrThrow({
        where: { id: option.id },
        include: { inventoryComponents: true },
      });
      expect(beforeOption.inventoryComponents).toHaveLength(recipePresentBeforeDeletion ? 1 : 0);
      const executionBefore = await registrationExecutionSnapshot(execution.id);

      await prisma.masterProduct.delete({ where: { id: source.id } });
      await expect(
        publish(randomUUID(), [product('P-DELETED', 'S-DELETED', { sellerSku })]),
      ).resolves.toMatchObject({ status: 'succeeded' });

      const replacement = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00000004',
          sourceAccountKey: 'kiditem',
          sourceProductCode: sourceCode,
          sourceOptionCode: '',
          name: 'Replacement with the same source code',
          currentStock: 99,
        },
      });
      await expect(
        publish(randomUUID(), [product('P-DELETED', 'S-DELETED', { sellerSku })]),
      ).resolves.toMatchObject({ status: 'succeeded' });

      const afterOption = await prisma.channelListingOption.findUniqueOrThrow({
        where: { id: option.id },
        include: { inventoryComponents: true },
      });
      expect(afterOption).toMatchObject({ sellerSku, kidItemCode: sellerSku });
      expect(afterOption.inventoryComponents.map(({ masterProductId, quantity }) => ({
        masterProductId,
        quantity,
      }))).toEqual(recipePresentBeforeDeletion
        ? [{ masterProductId: source.id, quantity: 2 }]
        : []);
      expect(afterOption.inventoryComponents).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ masterProductId: replacement.id }),
      ]));

      const [availabilityItem] = await availability.findByChannelSkuIds(
        TEST_ORGANIZATION_ID,
        [option.id],
      );
      expect(availabilityItem).toMatchObject({
        sku: { mappingStatus: expectedMappingStatus, sellableStock: null },
      });
      expect(availabilityItem?.sku.sellableStock).not.toBe(0);
      if (recipePresentBeforeDeletion) {
        expect(availabilityItem).toMatchObject({
          recipeStatus: 'review_required',
          components: [{
            masterProductId: source.id,
            currentStock: null,
            componentCapacity: null,
          }],
          warnings: ['inventory_unavailable'],
        });
      } else {
        expect(availabilityItem).toMatchObject({
          recipeStatus: 'unmatched',
          components: [],
          warnings: [],
        });
      }
      await expect(registrationExecutionSnapshot(execution.id))
        .resolves.toEqual(executionBefore);
    },
  );

  it('publishes a new identical capture without duplicating canonical identities', async () => {
    const first = await publish(randomUUID(), [product('P-1', 'S-1')]);
    const repeated = await publish(randomUUID(), [product('P-1', 'S-1')]);

    expect(repeated.id).not.toBe(first.id);
    expect(repeated.status).toBe('succeeded');
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

    // KID-348: 목록 단계는 목록에서 빠진 상품을 끄지 않으므로 식별이 바뀌지 않는다.
    await publish(randomUUID(), [product('P-1', 'S-1')]);
    await expect(mappingGeneration()).resolves.toBe(2n);

    await publish(randomUUID(), [product('P-1', 'S-1'), product('P-2', 'S-2')]);
    await expect(mappingGeneration()).resolves.toBe(2n);

    await expect(publish(randomUUID(), [product('P-3', 'S-1')])).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(mappingGeneration()).resolves.toBe(2n);
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

  /** 목록 kind 하나를 끝까지 돌린다. 연쇄(상세)는 이 규칙들과 무관해 돌리지 않는다. */
  async function publish(_key: string, products: ReturnType<typeof product>[]) {
    return wing.runList(ACCOUNT_ID, products);
  }

  async function mappingGeneration(): Promise<bigint> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? 0n;
  }

  async function registrationExecutionSnapshot(executionId: string) {
    return prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: executionId },
      select: {
        id: true,
        requestHash: true,
        submissionPayloadJson: true,
        submissionPayloadHash: true,
        status: true,
        providerOutcome: true,
        providerSubmissionId: true,
        externalListingId: true,
        resultJson: true,
      },
    });
  }
});

async function createFrozenRegistrationExecution(input: {
  prisma: PrismaClient;
  channelAccountId: string;
  channelListingId: string;
  masterProductId: string;
  sourceCode: string;
  sellerSku: string;
}) {
  const frozen = freezeProductRegistrationPayload({
    adapterPayload: {
      vendorItemCode: input.sellerSku,
      sellpiaMatch: {
        sellpiaInventorySkuId: input.masterProductId,
        quantity: 2,
        code: input.sourceCode,
      },
      wingProduct: { variants: [{ vendorItemCode: input.sellerSku }] },
    },
  }, channelIntegrity.sha256);
  const execution = await input.prisma.productRegistrationExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      registrationTargetId: await createRegistrationTarget(input.prisma, input.channelAccountId),
      channelAccountId: input.channelAccountId,
      channelListingId: input.channelListingId,
      executionKind: 'register',
      idempotencyKey: randomUUID(),
      requestHash: frozen.hash,
      submissionPayloadJson: frozen.payload as unknown as Prisma.InputJsonValue,
      submissionPayloadHash: frozen.hash,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      providerSubmissionId: `provider-${input.sourceCode}`,
      externalListingId: 'P-DELETED',
      resultJson: { externalListingId: 'P-DELETED' },
    },
  });
  return { id: execution.id };
}

async function createRegistrationTarget(prisma: PrismaClient, channelAccountId: string): Promise<string> {
  const salesProduct = await prisma.salesProduct.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, code: 'KID90000000', name: '등록 근거 상품',
  } });
  const target = await prisma.registrationTarget.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, channelAccountId, salesProductId: salesProduct.id,
  } });
  return target.id;
}

function product(
  externalProductId: string,
  externalOptionId: string,
  overrides: { displayName?: string | null; sellerSku?: string | null } = {},
): CoupangCatalogBasicProductV1 {
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
