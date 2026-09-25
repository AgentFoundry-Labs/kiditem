import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import type { ParsedWingCatalogWorkbook } from '../application/port/out/documents/channel-document.models';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelSkuAvailabilityService } from '../application/service/listing/channel-sku-availability.service';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../products/application/service/product-availability.usecase';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { freezeProductRegistrationPayload } from '../domain/registration/registration-submission-payload';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ParsedWingCatalogRow } from '../adapter/out/documents/coupang-wing/workbook.parser';
import type { ChannelDocumentsPort } from '../application/port/out/documents/channel-documents.port';
import { ChannelsDocumentsAdapter } from '../adapter/out/documents/channel-documents.adapter';
import type { OperationView } from '@kiditem/shared/operation';
import { makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { makeWingCatalogOperations } from '../../test-helpers/wing-catalog-operations';

const channelIntegrity = new ChannelIntegrityAdapter();

const WING_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_WING_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const ROCKET_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const NAVER_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ORG_WING_ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';

/**
 * [쿠팡상품정보] 엑셀 = `channels.wing_catalog_excel` 실행 하나(KID-351). 업로드가 begin(fileHash) → workbook 청크 →
 * finish를 밟고, finalize가 finish 트랜잭션 안에서 반영한다. 파서는 이 트랜잭션 테스트 밖이라 행을 그대로 돌려주는
 * 가짜 문서 포트를 쓴다(외부 경계).
 */
describe('Wing catalog workbook over the operation contract (PG integration)', () => {
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
    wing = makeWingCatalogOperations(prisma, { documents: fakeWorkbookParser });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedAccounts();
  });

  it('imports the representative 1,225-parent/2,241-SKU shape with three skips and no stock mutation', async () => {
    const rows = representativeRows();
    const inventoryBefore = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID-STOCK',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SP-STOCK-SENTINEL',
        sourceOptionCode: '',
        name: 'Sellpia stock sentinel',
        currentStock: 37,
      },
    });

    const result = await importCatalog(rows, WING_ACCOUNT_ID, [
        {
          rowNumber: 56,
          reason: 'missing_sku_id' as const,
          externalProductId: 'P-0005',
          externalSkuId: null,
        },
        {
          rowNumber: 2_213,
          reason: 'missing_sku_id' as const,
          externalProductId: 'P-1191',
          externalSkuId: null,
        },
        {
          rowNumber: 2_248,
          reason: 'missing_sku_id' as const,
          externalProductId: 'P-0000',
          externalSkuId: null,
        },
    ]);

    const [products, skus, inventoryAfter] = await Promise.all([
        prisma.channelListing.findMany({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            channelAccountId: WING_ACCOUNT_ID,
            isActive: true,
          },
          include: { channelAccount: true },
        }),
        prisma.channelListingOption.findMany({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            listing: { channelAccountId: WING_ACCOUNT_ID },
          },
        }),
      prisma.masterProduct.findUniqueOrThrow({
        where: { id: inventoryBefore.id },
      }),
      ]);

    expect(products).toHaveLength(1_225);
    expect(skus).toHaveLength(2_241);
    expect(new Set(products.map((row) => row.id))).toHaveLength(1_225);
    expect(new Set(skus.map((row) => row.id))).toHaveLength(2_241);
    expect(products.every((row) => row.channelAccount.channel === 'coupang')).toBe(true);
    expect(skus.every((row) => row.sellerSku === null && row.salePrice === null)).toBe(true);
    expect(result.changes).toEqual({
      createdProductCount: 1_225,
      updatedProductCount: 0,
      createdSkuCount: 2_241,
      updatedSkuCount: 0,
      skippedRowCount: 3,
    });
        expect(inventoryAfter).toEqual(inventoryBefore);
  });

  it('links a later workbook capture to the frozen registered bundle code without allocating another code', async () => {
    const row = makeRow(0, {
      externalProductId: 'P-REGISTERED',
      externalSkuId: 'S-REGISTERED',
    });
    await importCatalog([row]);
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        externalId: 'P-REGISTERED',
      },
      include: { options: true },
    });
    const component = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID00000002',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SP-WORKBOOK-BUNDLE',
        sourceOptionCode: '',
        name: 'Workbook registered bundle component',
        currentStock: 4,
      },
    });
    const frozen = freezeProductRegistrationPayload({
      adapterPayload: {
        vendorItemCode: 'KID12345678',
        sellpiaMatch: {
          sellpiaInventorySkuId: component.id,
          quantity: 2,
          code: 'SP-WORKBOOK-BUNDLE',
        },
        wingProduct: { variants: [{ vendorItemCode: 'KID12345678' }] },
      },
    }, channelIntegrity.sha256);
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: await createRegistrationTarget(prisma, WING_ACCOUNT_ID, component.id, 'KID12345678'),
        channelAccountId: WING_ACCOUNT_ID,
        channelListingId: listing.id,
        executionKind: 'register',
        idempotencyKey: randomUUID(),
        requestHash: frozen.hash,
        submissionPayloadJson: frozen.payload as unknown as Prisma.InputJsonValue,
        submissionPayloadHash: frozen.hash,
        status: 'succeeded',
        providerOutcome: 'succeeded',
        providerSubmissionId: 'provider-workbook-bundle',
        externalListingId: 'P-REGISTERED',
        resultJson: { externalListingId: 'P-REGISTERED' },
      },
    });
    await prisma.channelListingOption.update({
      where: { id: listing.options[0]!.id },
      data: { sellerSku: 'KID12345678' },
    });

    await importCatalog([row]);

    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: listing.options[0]!.id },
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
    'keeps a deleted registered source unresolved across later workbook captures (%j)',
    async ({ recipePresentBeforeDeletion, expectedMappingStatus }) => {
      const sellerSku = 'KID87654320';
      const sourceCode = 'SP-DELETED-WORKBOOK';
      const row = makeRow(0, {
        externalProductId: 'P-DELETED',
        externalSkuId: 'S-DELETED',
      });
      await importCatalog([row]);
      const listing = await prisma.channelListing.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: WING_ACCOUNT_ID,
          externalId: 'P-DELETED',
        },
        include: { options: true },
      });
      const option = listing.options[0]!;
      const source = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00000005',
          sourceAccountKey: 'kiditem',
          sourceProductCode: sourceCode,
          sourceOptionCode: '',
          name: 'Deleted workbook bundle component',
          currentStock: 4,
        },
      });
      const execution = await createFrozenRegistrationExecution({
        prisma,
        channelAccountId: WING_ACCOUNT_ID,
        channelListingId: listing.id,
        masterProductId: source.id,
        sourceCode,
        sellerSku,
      });
      await prisma.channelListingOption.update({
        where: { id: option.id },
        data: { sellerSku },
      });

      if (recipePresentBeforeDeletion) {
        await importCatalog([row]);
      }
      const beforeOption = await prisma.channelListingOption.findUniqueOrThrow({
        where: { id: option.id },
        include: { inventoryComponents: true },
      });
      expect(beforeOption.inventoryComponents).toHaveLength(recipePresentBeforeDeletion ? 1 : 0);
      const executionBefore = await registrationExecutionSnapshot(execution.id);

      await prisma.masterProduct.delete({ where: { id: source.id } });
      await expect(
        importCatalog([row]),
      ).resolves.toMatchObject({ operation: { status: 'succeeded' } });

      const replacement = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID00000006',
          sourceAccountKey: 'kiditem',
          sourceProductCode: sourceCode,
          sourceOptionCode: '',
          name: 'Replacement with the same workbook source code',
          currentStock: 99,
        },
      });
      await expect(
        importCatalog([row]),
      ).resolves.toMatchObject({ operation: { status: 'succeeded' } });

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

  it('requires an active Wing account in the organization before begin, so nothing is opened', async () => {
    const bytes = workbookBytes({ headers: ['등록상품ID', '옵션 ID'], rows: [makeRow(0)], skippedRows: [] });
    await expect(wing.uploadWorkbook(WING_ACCOUNT_ID, bytes, undefined, OTHER_ORGANIZATION_ID))
      .rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    for (const channelAccountId of [ROCKET_ACCOUNT_ID, NAVER_ACCOUNT_ID]) {
      await expect(wing.uploadWorkbook(channelAccountId, bytes)).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_INVALID' });
    }
    await prisma.channelAccount.update({ where: { id: WING_ACCOUNT_ID }, data: { status: 'inactive' } });
    await expect(wing.uploadWorkbook(WING_ACCOUNT_ID, bytes)).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    expect(await prisma.operation.count()).toBe(0);
  });

  it.each([null, '   '])(
    'rejects a Coupang account whose vendor and external identities are both missing (%j)',
    async (externalAccountId) => {
      await prisma.channelAccount.update({
        where: { id: WING_ACCOUNT_ID },
        data: { externalAccountId, vendorId: null },
      });
      await expect(importCatalog([makeRow(0)])).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_INVALID' });
      expect(await prisma.operation.count()).toBe(0);
      expect(await prisma.channelListing.count()).toBe(0);
      expect(await prisma.channelListingOption.count()).toBe(0);
    },
  );

  it('uses vendorId when a legacy external account alias differs', async () => {
    await prisma.channelAccount.update({
      where: { id: WING_ACCOUNT_ID },
      data: { externalAccountId: 'legacy-wing-alias', vendorId: 'vendor-primary' },
    });
    await expect(importCatalog([makeRow(0)])).resolves.toMatchObject({ operation: { status: 'succeeded' } });
    expect(await prisma.channelListing.count()).toBe(1);
    expect(await prisma.channelListingOption.count()).toBe(1);
  });

  it('dedupes the same file per ChannelAccount: the same bytes publish once per account and a re-upload is refused', async () => {
    const bytes = workbookBytes({
      headers: ['등록상품ID', '옵션 ID'],
      rows: [makeRow(0, { externalProductId: 'P-SHARED', externalSkuId: 'S-SHARED' })],
      skippedRows: [],
    });
    const first = await wing.uploadWorkbook(WING_ACCOUNT_ID, bytes);
    const second = await wing.uploadWorkbook(SECOND_WING_ACCOUNT_ID, bytes);
    expect(first.operation).toMatchObject({ kind: 'channels.wing_catalog_excel', status: 'succeeded', lockKeys: [] });
    expect(second.operation.id).not.toBe(first.operation.id);
    expect(await prisma.channelListing.count({ where: { externalId: 'P-SHARED' } })).toBe(2);
    expect(await prisma.channelListingOption.count({ where: { externalOptionId: 'S-SHARED' } })).toBe(2);

    const before = await prisma.channelListingOption.findMany({ orderBy: { id: 'asc' } });
    await expect(wing.uploadWorkbook(WING_ACCOUNT_ID, bytes)).rejects.toMatchObject({
      code: 'DB_CONFLICT',
      details: { reason: 'file_already_applied', existing: { operationId: first.operation.id } },
    });
    expect(await prisma.channelListingOption.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  // KID-348: 엑셀은 목록에 없는 상품을 끄지 않는다. 사라진 상품은 브라우저 동기화의 삭제 확인으로만 바뀐다.
  it('keeps unseen account identities active and reuses them when they reappear', async () => {
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-RETURN',
          externalSkuId: 'S-RETURN',
        }),
      ],
      WING_ACCOUNT_ID,
    );
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-RETURN',
          externalSkuId: 'S-RETURN',
        }),
      ],
      SECOND_WING_ACCOUNT_ID,
    );

    const productBefore = await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        externalId: 'P-RETURN',
      },
    });
    const skuBefore = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: WING_ACCOUNT_ID },
        externalOptionId: 'S-RETURN',
      },
    });

    await importCatalog(
      [
        makeRow(1, {
          externalProductId: 'P-NEW',
          externalSkuId: 'S-NEW',
        }),
      ],
      WING_ACCOUNT_ID,
    );

    const [unseenProduct, unseenSku, otherAccountProduct, otherAccountSku] = await Promise.all([
      prisma.channelListing.findUniqueOrThrow({
        where: { id: productBefore.id },
      }),
      prisma.channelListingOption.findUniqueOrThrow({
        where: { id: skuBefore.id },
      }),
      prisma.channelListing.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: SECOND_WING_ACCOUNT_ID,
          externalId: 'P-RETURN',
        },
      }),
      prisma.channelListingOption.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          listing: { channelAccountId: SECOND_WING_ACCOUNT_ID },
          externalOptionId: 'S-RETURN',
        },
      }),
    ]);

    expect(unseenProduct).toMatchObject({
      id: productBefore.id,
      isActive: true,
      lastOperationId: productBefore.lastOperationId,
    });
    expect(unseenSku).toMatchObject({
      id: skuBefore.id,
      isActive: true,
      lastOperationId: skuBefore.lastOperationId,
    });
    expect(otherAccountProduct.isActive).toBe(true);
    expect(otherAccountSku.isActive).toBe(true);

    const returnedPublication = await importCatalog(
      [
        makeRow(2, {
          externalProductId: 'P-RETURN',
          externalSkuId: 'S-RETURN',
          registeredName: '다시 들어온 등록상품',
          optionName: '다시 들어온 옵션',
        }),
      ],
      WING_ACCOUNT_ID,
    );
    const [productAfter, skuAfter] = await Promise.all([
      prisma.channelListing.findUniqueOrThrow({
        where: { id: productBefore.id },
      }),
      prisma.channelListingOption.findUniqueOrThrow({
        where: { id: skuBefore.id },
      }),
    ]);

    expect(productAfter).toMatchObject({
      id: productBefore.id,
      isActive: true,
      channelName: '다시 들어온 등록상품',
      lastOperationId: returnedPublication.operation.id,
    });
    expect(skuAfter).toMatchObject({
      id: skuBefore.id,
      isActive: true,
      itemName: '다시 들어온 옵션',
      lastOperationId: returnedPublication.operation.id,
    });
  });

  it('counts skipped rows and deactivates nothing the workbook left out (KID-348)', async () => {
    const completeRows = [
      makeRow(0, {
        externalProductId: 'P-VALID',
        externalSkuId: 'S-VALID',
      }),
      makeRow(1, {
        externalProductId: 'P-PRODUCT-RECOVERED',
        externalSkuId: 'S-PRODUCT-RECOVERED',
      }),
      makeRow(2, {
        externalProductId: 'P-SKU-PARENT',
        externalSkuId: 'S-SKU-RECOVERED',
      }),
      makeRow(3, {
        externalProductId: 'P-UNSEEN',
        externalSkuId: 'S-UNSEEN',
      }),
    ];
    await importCatalog(completeRows);

    const missingSkuPublication = await importCatalog(
      [completeRows[0]],
      WING_ACCOUNT_ID,
      [{
        rowNumber: 6,
        reason: 'missing_sku_id',
        externalProductId: 'P-PRODUCT-RECOVERED',
        externalSkuId: null,
      }],
    );
    const productsAfterMissingSku = await activeProductsByExternalId();
    const skusAfterMissingSku = await activeSkusByExternalId();

    expect(missingSkuPublication.changes.skippedRowCount).toBe(1);
    expect(productsAfterMissingSku).toEqual({
      'P-PRODUCT-RECOVERED': true,
      'P-SKU-PARENT': true,
      'P-UNSEEN': true,
      'P-VALID': true,
    });
    expect(skusAfterMissingSku).toEqual({
      'S-PRODUCT-RECOVERED': true,
      'S-SKU-RECOVERED': true,
      'S-UNSEEN': true,
      'S-VALID': true,
    });

    await importCatalog(completeRows);
    const missingProductPublication = await importCatalog(
      [completeRows[0]],
      WING_ACCOUNT_ID,
      [{
        rowNumber: 7,
        reason: 'missing_product_id',
        externalProductId: null,
        externalSkuId: 'S-SKU-RECOVERED',
      }],
    );
    const productsAfterMissingProduct = await activeProductsByExternalId();
    const skusAfterMissingProduct = await activeSkusByExternalId();

    expect(missingProductPublication.changes.skippedRowCount).toBe(1);
    expect(productsAfterMissingProduct).toEqual({
      'P-PRODUCT-RECOVERED': true,
      'P-SKU-PARENT': true,
      'P-UNSEEN': true,
      'P-VALID': true,
    });
    expect(skusAfterMissingProduct).toEqual({
      'S-PRODUCT-RECOVERED': true,
      'S-SKU-RECOVERED': true,
      'S-UNSEEN': true,
      'S-VALID': true,
    });
  });

  it('derives SKU account ownership exclusively from the parent listing during publication', async () => {
    const firstAccountParent = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        externalId: 'P-ACCOUNT-A',
      },
    });
    const firstAccountSku = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: firstAccountParent.id,
        externalOptionId: 'S-CROSS-ACCOUNT',
      },
    });

    const result = await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-ACCOUNT-B',
          externalSkuId: 'S-CROSS-ACCOUNT',
        }),
      ],
      SECOND_WING_ACCOUNT_ID,
    );

    expect(
      await prisma.channelListingOption.findUniqueOrThrow({
        where: { id: firstAccountSku.id },
      }),
    ).toMatchObject({
      listingId: firstAccountParent.id,
    });
    const secondAccountSku = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        externalOptionId: 'S-CROSS-ACCOUNT',
        listing: {
          channelAccountId: SECOND_WING_ACCOUNT_ID,
          externalId: 'P-ACCOUNT-B',
        },
      },
      include: { listing: true },
    });
    expect(secondAccountSku).toMatchObject({
      externalOptionId: 'S-CROSS-ACCOUNT',
      listing: {
        channelAccountId: SECOND_WING_ACCOUNT_ID,
        externalId: 'P-ACCOUNT-B',
      },
    });
    expect(secondAccountSku.id).not.toBe(firstAccountSku.id);
    expect(result.changes).toMatchObject({ createdProductCount: 1, createdSkuCount: 1 });
  });

  it('updates metadata/raw JSON while preserving stable IDs, confirmed links, prices, seller SKUs, and recipes', async () => {
    const initialRows = [
      makeRow(0, { externalProductId: 'P-KEEP', externalSkuId: 'S-SINGLE' }),
      makeRow(1, { externalProductId: 'P-KEEP', externalSkuId: 'S-FOUR' }),
      makeRow(2, { externalProductId: 'P-KEEP', externalSkuId: 'S-MIXED' }),
      makeRow(3, { externalProductId: 'P-KEEP', externalSkuId: 'S-ABSENT' }),
    ];
    await importCatalog(initialRows);
    const productBefore = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'P-KEEP' },
    });
    const skusBefore = await prisma.channelListingOption.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: WING_ACCOUNT_ID },
      },
      orderBy: { externalOptionId: 'asc' },
    });
    const inventorySkus = await prisma.masterProduct.createManyAndReturn({
      data: [0, 1].map((index) => ({
        organizationId: TEST_ORGANIZATION_ID,
        code: `KID-CMP-${index}`,
        sourceAccountKey: 'kiditem',
        sourceProductCode: `SP-INVENTORY-${index}`,
        sourceOptionCode: '',
        name: `component ${index}`,
        currentStock: index,
      })),
    });
    const linkedProduct = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KID-PRES',
        sourceAccountKey: 'fixture',
        sourceProductCode: 'KI-PRESERVED',
        sourceOptionCode: '',
        name: 'Preserved product link',
      },
    });
    const contentBefore = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'channel_listing',
        channelListingId: productBefore.id,
        createdByUserId: TEST_USER_ID,
      },
    });
    const skuByExternalId = new Map(skusBefore.map((sku) => [sku.externalOptionId, sku]));
    const preservation = [
      ['S-SINGLE', 'SELLER-SINGLE', 10_000],
      ['S-FOUR', 'SELLER-FOUR', 20_000],
      ['S-MIXED', 'SELLER-MIXED', 30_000],
      ['S-ABSENT', 'SELLER-ABSENT', 40_000],
    ] as const;
    for (const [
      externalOptionId,
      sellerSku,
      salePrice,
    ] of preservation) {
      await prisma.channelListingOption.update({
        where: { id: skuByExternalId.get(externalOptionId)!.id },
        data: {
          sellerSku,
          salePrice,
          status: externalOptionId === 'S-ABSENT' ? 'absent-status' : 'old-status',
        },
      });
    }
    await prisma.channelListingOptionInventoryComponent.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: skuByExternalId.get('S-SINGLE')!.id,
          masterProductId: inventorySkus[0]!.id,
          quantity: 1,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: skuByExternalId.get('S-FOUR')!.id,
          masterProductId: inventorySkus[0]!.id,
          quantity: 4,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: skuByExternalId.get('S-MIXED')!.id,
          masterProductId: inventorySkus[0]!.id,
          quantity: 2,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: skuByExternalId.get('S-MIXED')!.id,
          masterProductId: inventorySkus[1]!.id,
          quantity: 3,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: skuByExternalId.get('S-ABSENT')!.id,
          masterProductId: inventorySkus[1]!.id,
          quantity: 1,
        },
      ],
    });
    const componentsBefore = await prisma.channelListingOptionInventoryComponent.findMany({
      orderBy: { id: 'asc' },
    });

    const changedRows = initialRows.slice(0, 3).map((row, index) =>
      makeRow(index, {
      externalProductId: row.externalProductId,
      externalSkuId: row.externalSkuId,
      registeredName: '변경된 등록상품명',
      displayName: '변경된 노출상품명',
      category: '변경 카테고리',
      manufacturer: '변경 제조사',
      brand: '변경 브랜드',
      productStatus: '변경 승인상태',
      optionName: `변경 옵션 ${index}`,
      skuStatus: `변경 판매상태 ${index}`,
      modelNumber: `CHANGED-${index}`,
      barcode: `00000000000${index}`,
      rawJson: { revision: 2, externalSkuId: row.externalSkuId },
      }),
    );
    const second = await importCatalog(changedRows);

    const [
      productAfter,
      skusAfter,
      componentsAfter,
      absentAfter,
      contentAfter,
      linkedProductAfter,
    ] = await Promise.all(
      [
      prisma.channelListing.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'P-KEEP' },
      }),
      prisma.channelListingOption.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          listing: { channelAccountId: WING_ACCOUNT_ID },
          externalOptionId: { in: ['S-SINGLE', 'S-FOUR', 'S-MIXED'] },
        },
        orderBy: { externalOptionId: 'asc' },
      }),
      prisma.channelListingOptionInventoryComponent.findMany({ orderBy: { id: 'asc' } }),
      prisma.channelListingOption.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          listing: { channelAccountId: WING_ACCOUNT_ID },
          externalOptionId: 'S-ABSENT',
        },
      }),
        prisma.contentWorkspace.findUniqueOrThrow({
          where: { id: contentBefore.id },
        }),
        prisma.masterProduct.findUniqueOrThrow({
          where: { id: linkedProduct.id },
        }),
      ],
    );

    expect(productAfter).toMatchObject({
      id: productBefore.id,
      channelName: '변경된 등록상품명',
      displayName: '변경된 노출상품명',
      category: '변경 카테고리',
      manufacturer: '변경 제조사',
      brand: '변경 브랜드',
      status: '변경 승인상태',
      lastOperationId: second.operation.id,
      isActive: true,
    });
    expect(new Set(skusAfter.map((sku) => sku.id))).toEqual(
      new Set(skusBefore.filter((sku) => sku.externalOptionId !== 'S-ABSENT').map((sku) => sku.id)),
    );
    for (const sku of skusAfter) {
      const preserved = preservation.find(([externalId]) => externalId === sku.externalOptionId)!;
      expect(sku).toMatchObject({
        sellerSku: preserved[1],
        salePrice: preserved[2],
        lastOperationId: second.operation.id,
        isActive: true,
        // KID-349: 엑셀은 옵션 raw의 catalogExcel 구역만 바꾼다.
        rawJson: expect.objectContaining({
          catalogExcel: expect.objectContaining({ row: expect.objectContaining({ revision: '2' }) }),
        }),
      });
    }
    expect(componentsAfter).toEqual(componentsBefore);
    expect(absentAfter).toMatchObject({
      id: skuByExternalId.get('S-ABSENT')!.id,
      sellerSku: 'SELLER-ABSENT',
      salePrice: 40_000,
      status: 'absent-status',
      // KID-348: 엑셀에서 빠진 옵션은 끄지 않는다.
      isActive: true,
    });
    expect(absentAfter.lastOperationId).not.toBe(second.operation.id);
    expect(contentAfter).toEqual(contentBefore);
    expect(linkedProductAfter).toMatchObject({
      id: linkedProduct.id,
      code: 'KID-PRES',
      sourceAccountKey: 'fixture',
      sourceProductCode: 'KI-PRESERVED',
      sourceOptionCode: '',
      name: 'Preserved product link',
    });
  });

  it('keeps the stored Wing registration date and browser sections when a workbook import writes its own section', async () => {
    const identities = [
      { externalProductId: 'P-REGISTERED', externalSkuId: 'S-REGISTERED' },
      { externalProductId: 'P-UNREGISTERED', externalSkuId: 'S-UNREGISTERED' },
    ];
    await importCatalog(
      identities.map((identity, index) => makeRow(index, identity)),
    );
    // Only the browser catalog's inventory-list stage observes the date.
    await prisma.channelListing.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'P-REGISTERED' },
      data: { rawJson: { source: 'coupang_catalog_basics', createdOn: '2026-04-01 11:32:06' } },
    });

    await importCatalog(
      identities.map((identity, index) => makeRow(index, { ...identity, rawJson: { revision: 2 } })),
    );

    await expect(prisma.channelListing.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: WING_ACCOUNT_ID },
      select: { externalId: true, rawJson: true },
      orderBy: { externalId: 'asc' },
    })).resolves.toEqual([
      {
        externalId: 'P-REGISTERED',
        rawJson: {
          source: 'coupang_wing_catalog',
          externalProductId: 'P-REGISTERED',
          saleStatus: '판매중',
          productStatus: '승인완료',
          createdOn: '2026-04-01 11:32:06',
          catalogExcel: { observedAt: expect.any(String), row: { revision: '2' }, searchTags: [], exposedProductId: null, adult: null },
        },
      },
      {
        externalId: 'P-UNREGISTERED',
        rawJson: {
          source: 'coupang_wing_catalog',
          externalProductId: 'P-UNREGISTERED',
          saleStatus: '판매중',
          productStatus: '승인완료',
          catalogExcel: { observedAt: expect.any(String), row: { revision: '2' }, searchTags: [], exposedProductId: null, adult: null },
        },
      },
    ]);
  });

  it('keeps observed listing facts the reimported workbook leaves blank', async () => {
    const identity = { externalProductId: 'P-BLANK', externalSkuId: 'S-BLANK' };
    await importCatalog([makeRow(0, identity)]);

    // 윙 엑셀은 칸이 비어 나올 수 있다. 비었다는 것은 "몰에서 사라졌다"가 아니다.
    await importCatalog(
      [makeRow(0, {
        ...identity,
        displayName: null,
        category: null,
        manufacturer: null,
        brand: null,
        productStatus: null,
      })],
    );

    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'P-BLANK' },
      select: {
        displayName: true,
        category: true,
        manufacturer: true,
        brand: true,
        status: true,
      },
    })).resolves.toEqual({
      displayName: '노출 상품 0',
      category: '카테고리 0',
      manufacturer: '제조사 0',
      brand: '브랜드 0',
      status: '승인완료',
    });
  });

  it('rejects moving an existing external SKU to another parent and rolls back the whole import', async () => {
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-ORIGINAL',
          externalSkuId: 'S-STABLE',
        }),
      ],
    );
    const before = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: WING_ACCOUNT_ID },
        externalOptionId: 'S-STABLE',
      },
      include: { listing: true },
    });

    await expect(
      importCatalog(
        [
      makeRow(1, { externalProductId: 'P-NEW', externalSkuId: 'S-STABLE' }),
          makeRow(2, {
            externalProductId: 'P-ALSO-NEW',
            externalSkuId: 'S-NEW',
          }),
        ],
      ),
    ).rejects.toThrow('cannot move to another parent');

    const after = await prisma.channelListingOption.findFirstOrThrow({
      where: { id: before.id },
      include: { listing: true },
    });
    expect(after.listing.externalId).toBe('P-ORIGINAL');
    expect(
      await prisma.channelListing.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
      },
      }),
    ).toBe(1);
    // 반영이 실패한 실행은 failed로 닫혀 계정 잠금이 바로 풀린다.
    await expect(latestExcelOperation()).resolves.toMatchObject({ status: 'failed', errorCode: expect.any(String), lockKeys: [] });
  });

  it('keeps the previous complete snapshot when the latest attempt fails', async () => {
    await importCatalog(
      [
        makeRow(0, { externalProductId: 'P-ONE', externalSkuId: 'S-ONE' }),
        makeRow(1, { externalProductId: 'P-TWO', externalSkuId: 'S-TWO' }),
      ],
    );

    // 옵션을 다른 부모로 옮기려는 파일은 통째로 거절된다.
    await expect(importCatalog(
      [makeRow(2, { externalProductId: 'P-THREE', externalSkuId: 'S-ONE' })],
    )).rejects.toThrow('cannot move to another parent');

    await expect(prisma.channelListing.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: WING_ACCOUNT_ID },
      select: { externalId: true, isActive: true },
      orderBy: { externalId: 'asc' },
    })).resolves.toEqual([
      { externalId: 'P-ONE', isActive: true },
      { externalId: 'P-TWO', isActive: true },
    ]);
    // 실패한 시도가 이전 완료를 최신 완료 자리에서 밀어내지 않는다.
    const listed = await wing.operations.list(TEST_ORGANIZATION_ID, { kinds: ['channels.wing_catalog_excel'], status: 'succeeded', limit: 5 });
    expect(listed.operations).toHaveLength(1);
  });

  it('publishes a complete import without starting a transmission or a calculation', async () => {
    await importCatalog([makeRow(0)]);

    // 몰로 나가는 모든 제출은 등록 실행 울타리를 지난다. 품절 전송도 마찬가지다.
    await expect(prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    // 원천 수집이 발행된 계산을 대신 만들지 않는다 (ADR-0009).
    await expect(prisma.masterProductAbcEvaluation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
  });

  it('advances mapping generation for active identity changes but not metadata-only or rejected import', async () => {
    await importCatalog([makeRow(0, {
      externalProductId: 'P-1',
      externalSkuId: 'S-1',
    })]);
    await expect(mappingGeneration()).resolves.toBe(1n);

    await importCatalog([makeRow(0, {
      externalProductId: 'P-1',
      externalSkuId: 'S-1',
      displayName: '메타데이터만 변경',
    })]);
    await expect(mappingGeneration()).resolves.toBe(1n);

    await importCatalog([makeRow(0, {
      externalProductId: 'P-2',
      externalSkuId: 'S-2',
    })]);
    await expect(mappingGeneration()).resolves.toBe(2n);

    await expect(importCatalog([makeRow(0, {
      externalProductId: 'P-3',
      externalSkuId: 'S-2',
    })])).rejects.toThrow('cannot move to another parent');
    await expect(mappingGeneration()).resolves.toBe(2n);
    await expect(prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: OTHER_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    })).resolves.toBeNull();
  });

  it('refuses a workbook while the account browser sync holds the account, naming that operation', async () => {
    const listing = await wing.operations.begin(TEST_ORGANIZATION_ID, {
      kind: 'channels.wing_catalog_list',
      scope: { channelAccountId: WING_ACCOUNT_ID },
    }, { userId: TEST_USER_ID });
    await expect(importCatalog([makeRow(0)])).rejects.toMatchObject({
      code: 'OPERATION_IN_PROGRESS',
      details: { operationId: listing.operation.id },
    });
    // 다른 계정은 막지 않는다.
    await expect(importCatalog([makeRow(0)], SECOND_WING_ACCOUNT_ID)).resolves.toMatchObject({ operation: { status: 'succeeded' } });
  });

  it('rolls back mid-write failures, closes only the operation failed, and never changes another organization', async () => {
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-BEFORE',
          externalSkuId: 'S-BEFORE',
        }),
      ],
    );
    await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ORG_WING_ACCOUNT_ID,
        externalId: 'P-OTHER',
        channelName: 'other organization sentinel',
      },
    });
    const beforeProducts = await prisma.channelListing.findMany({
      orderBy: { id: 'asc' },
    });
    const beforeSkus = await prisma.channelListingOption.findMany({
      orderBy: { id: 'asc' },
    });
    const failingRows = Array.from({ length: 501 }, (_, index) =>
      makeRow(index, {
      externalProductId: `P-FAIL-${String(index).padStart(4, '0')}`,
      externalSkuId: `S-FAIL-${String(index).padStart(4, '0')}`,
      // 두 번째 upsert 묶음(500건 단위)에서 PostgreSQL jsonb가 NUL 문자를 거절한다.
      ...(index === 500 ? { registeredName: 'NUL \u0000 name' } : {}),
      rawJson: { index },
      }),
    );

    await expect(importCatalog(failingRows)).rejects.toThrow();

    expect(await prisma.channelListing.findMany({ orderBy: { id: 'asc' } })).toEqual(
      beforeProducts,
    );
    expect(await prisma.channelListingOption.findMany({ orderBy: { id: 'asc' } })).toEqual(
      beforeSkus,
    );
    await expect(latestExcelOperation()).resolves.toMatchObject({ status: 'failed', lockKeys: [] });
    expect(
      await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ORG_WING_ACCOUNT_ID,
        externalId: 'P-OTHER',
      },
      }),
    ).toMatchObject({ channelName: 'other organization sentinel' });
  });

  async function seedAccounts(): Promise<void> {
    await prisma.channelAccount.createMany({
      data: [
        {
          id: WING_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Wing primary',
          externalAccountId: 'wing-primary',
          status: 'active',
        },
        {
          id: SECOND_WING_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Wing secondary',
          externalAccountId: 'wing-secondary',
          status: 'active',
        },
        {
          id: ROCKET_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'rocket',
          name: 'Future Rocket',
          externalAccountId: 'rocket-future',
          status: 'active',
        },
        {
          id: NAVER_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'naver',
          name: 'Naver',
          externalAccountId: 'naver',
          status: 'active',
        },
        {
          id: OTHER_ORG_WING_ACCOUNT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Other organization Wing',
          externalAccountId: 'other-wing',
          status: 'active',
        },
      ],
    });
  }

  async function importCatalog(
    rows: ParsedWingCatalogRow[],
    channelAccountId = WING_ACCOUNT_ID,
    skippedRows: Array<{
      rowNumber: number;
      reason: 'missing_product_id' | 'missing_sku_id';
      externalProductId: string | null;
      externalSkuId: string | null;
    }> = [],
  ): Promise<{ operation: OperationView; changes: Record<string, unknown> }> {
    const { operation } = await wing.uploadWorkbook(
      channelAccountId,
      workbookBytes({ headers: ['등록상품ID', '옵션 ID'], rows, skippedRows }),
    );
    return { operation, changes: operation.result ?? {} };
  }

  async function latestExcelOperation(): Promise<OperationView | undefined> {
    const { operations } = await wing.operations.list(TEST_ORGANIZATION_ID, { kinds: ['channels.wing_catalog_excel'], limit: 1 });
    return operations[0];
  }

  async function activeProductsByExternalId(): Promise<Record<string, boolean>> {
    const rows = await prisma.channelListing.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
      },
      select: { externalId: true, isActive: true },
      orderBy: { externalId: 'asc' },
    });
    return Object.fromEntries(rows.map((row) => [row.externalId, row.isActive]));
  }

  async function activeSkusByExternalId(): Promise<Record<string, boolean>> {
    const rows = await prisma.channelListingOption.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: WING_ACCOUNT_ID },
      },
      select: { externalOptionId: true, isActive: true },
      orderBy: { externalOptionId: 'asc' },
    });
    return Object.fromEntries(
      rows.map((row) => [row.externalOptionId, row.isActive]),
    );
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

function representativeRows(): ParsedWingCatalogRow[] {
  return Array.from({ length: 2_241 }, (_, index) => {
    const parentIndex = index < 1_225 ? index : index % 1_225;
    return makeRow(index, {
      externalProductId: `P-${String(parentIndex).padStart(4, '0')}`,
      externalSkuId: `S-${String(index).padStart(5, '0')}`,
      registeredName: `상품 ${parentIndex}`,
      displayName: `노출 상품 ${parentIndex}`,
      category: `카테고리 ${parentIndex % 10}`,
      manufacturer: `제조사 ${parentIndex % 5}`,
      brand: `브랜드 ${parentIndex % 7}`,
      productStatus: '승인완료',
    });
  });
}

function makeRow(
  index: number,
  overrides: Partial<ParsedWingCatalogRow> = {},
): ParsedWingCatalogRow {
  return {
    rowNumber: index + 5,
    externalProductId: `P-${String(index).padStart(4, '0')}`,
    registeredName: `상품 ${index}`,
    displayName: `노출 상품 ${index}`,
    category: `카테고리 ${index % 10}`,
    manufacturer: `제조사 ${index % 5}`,
    brand: `브랜드 ${index % 7}`,
    productStatus: '승인완료',
    externalSkuId: `S-${String(index).padStart(5, '0')}`,
    optionName: `옵션 ${index}`,
    skuStatus: '판매중',
    modelNumber: `MODEL-${index}`,
    barcode: `000${String(index).padStart(9, '0')}`,
    attributesJson: [],
    searchTags: [],
    exposedProductId: null,
    adult: null,
    rawJson: { index },
    ...overrides,
  };
}


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
      registrationTargetId: await createRegistrationTarget(input.prisma, input.channelAccountId, input.masterProductId, input.sellerSku),
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


// The workbook codec is outside these transaction tests. Preserve deliberately
// invalid persistence values (including BigInt) used to exercise rollback.
const parsedWorkbooks = new Map<string, ParsedWingCatalogWorkbook>();
// 파일 바이트 운반(base64 조각)은 실제 어댑터, 엑셀 해석만 가짜다.
const fakeWorkbookParser: ChannelDocumentsPort = Object.assign(new ChannelsDocumentsAdapter(), {
  parseWingWorkbook: (bytes: Uint8Array) => parsedWorkbooks.get(new TextDecoder().decode(bytes))!,
});
function workbookBytes(parsed: ParsedWingCatalogWorkbook): Uint8Array {
  const key = randomUUID();
  parsedWorkbooks.set(key, parsed);
  return new TextEncoder().encode(key);
}

async function createRegistrationTarget(
  prisma: PrismaClient,
  channelAccountId: string,
  masterProductId: string,
  optionCode: string,
): Promise<string> {
  const salesProduct = await prisma.salesProduct.create({
    data: { organizationId: TEST_ORGANIZATION_ID, code: `SP-${randomUUID()}`, name: 'Registered bundle' },
  });
  const option = await prisma.salesProductOption.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID, salesProductId: salesProduct.id,
      optionCode, optionKey: '', salePrice: 1000,

    },
  });
  await prisma.salesProductOptionComponent.create({ data: { organizationId: TEST_ORGANIZATION_ID, salesProductOptionId: option.id, masterProductId, quantity: 2 } });
  const target = await prisma.registrationTarget.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId, salesProductId: salesProduct.id,

    },
  });
  await prisma.registrationTargetOption.create({ data: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: target.id, salesProductOptionId: option.id } });
  return target.id;
}
