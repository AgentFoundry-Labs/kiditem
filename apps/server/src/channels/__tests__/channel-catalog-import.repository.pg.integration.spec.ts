import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { ChannelCatalogImportService } from '../application/service/channel-catalog-import.service';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ParsedWingCatalogRow } from '../application/service/coupang-wing-workbook.parser';

const WING_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_WING_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const ROCKET_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const NAVER_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ORG_WING_ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';

describe('ChannelCatalogImportRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelCatalogImportRepositoryAdapter;
  let service: ChannelCatalogImportService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ChannelCatalogImportRepositoryAdapter(prisma as unknown as PrismaService);
    service = new ChannelCatalogImportService(repository);
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
    const inventoryBefore = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-STOCK-SENTINEL',
        name: 'Sellpia stock sentinel',
        currentStock: 37,
      },
    });

    const result = await importCatalog(rows, fileHash('representative'), WING_ACCOUNT_ID, [
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
      prisma.sellpiaInventorySku.findUniqueOrThrow({
        where: { id: inventoryBefore.id },
      }),
      ]);

    expect(products).toHaveLength(1_225);
    expect(skus).toHaveLength(2_241);
    expect(new Set(products.map((row) => row.id))).toHaveLength(1_225);
    expect(new Set(skus.map((row) => row.id))).toHaveLength(2_241);
    expect(products.every((row) => row.channelAccount.channel === 'coupang')).toBe(true);
    expect(skus.every((row) => row.productVariantId === null)).toBe(true);
    expect(products.every((row) => row.masterProductId === null)).toBe(true);
    expect(skus.every((row) => row.sellerSku === null && row.salePrice === null)).toBe(true);
    expect(result.changes).toEqual({
      createdProductCount: 1_225,
      updatedProductCount: 0,
      createdSkuCount: 2_241,
      updatedSkuCount: 0,
      skippedRowCount: 3,
    });
    expect(result.run.rowCount).toBe(2_241);
    expect(inventoryAfter).toEqual(inventoryBefore);
  });

  it('requires an active account in the organization and rejects non-Wing channels before claiming', async () => {
    await expect(
      service.importCoupangWing(
        importInput({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      fileHash: fileHash('wrong-organization'),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    for (const channelAccountId of [ROCKET_ACCOUNT_ID, NAVER_ACCOUNT_ID]) {
      await expect(
        service.importCoupangWing(
          importInput({
        channelAccountId,
        fileHash: fileHash(`wrong-channel-${channelAccountId}`),
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await prisma.channelAccount.update({
      where: { id: WING_ACCOUNT_ID },
      data: { status: 'inactive' },
    });
    await expect(
      service.importCoupangWing(
        importInput({
      fileHash: fileHash('inactive-account'),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await prisma.sourceImportRun.count()).toBe(0);
  });

  it.each([null, '   '])(
    'rejects a Coupang account whose canonical external identity is %j before claiming',
    async (externalAccountId) => {
      await prisma.channelAccount.update({
        where: { id: WING_ACCOUNT_ID },
        data: { externalAccountId },
      });

      await expect(
        service.importCoupangWing(
          importInput({ fileHash: fileHash(`missing-identity-${String(externalAccountId)}`) }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await prisma.sourceImportRun.count()).toBe(0);
      expect(await prisma.channelListing.count()).toBe(0);
      expect(await prisma.channelListingOption.count()).toBe(0);
    },
  );

  it('rejects a Coupang account whose vendorId conflicts with its canonical external identity', async () => {
    await prisma.channelAccount.update({
      where: { id: WING_ACCOUNT_ID },
      data: { vendorId: 'different-vendor' },
    });

    await expect(
      service.importCoupangWing(
        importInput({ fileHash: fileHash('conflicting-account-identities') }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await prisma.sourceImportRun.count()).toBe(0);
    expect(await prisma.channelListing.count()).toBe(0);
    expect(await prisma.channelListingOption.count()).toBe(0);
  });

  it('revalidates the canonical account identity when publishing a claimed import', async () => {
    const claimed = await repository.claimCoupangWingImport({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      fileName: 'wing.xlsx',
      fileHash: fileHash('identity-removed-after-claim'),
      rowCount: 1,
    });
    if (claimed.kind !== 'started') throw new Error('expected a started import claim');

    await prisma.channelAccount.update({
      where: { id: WING_ACCOUNT_ID },
      data: { externalAccountId: null },
    });

    await expect(
      repository.upsertCoupangWingCatalog({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        runId: claimed.runId,
        attemptToken: claimed.attemptToken,
        rows: [makeRow(0)],
        skippedRows: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.channelListing.count()).toBe(0);
    expect(await prisma.channelListingOption.count()).toBe(0);
    await expect(
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: claimed.runId } }),
    ).resolves.toMatchObject({ status: 'running' });
  });

  it('scopes product, SKU, and same-hash idempotency keys by ChannelAccount', async () => {
    const rows = [makeRow(0, { externalProductId: 'P-SHARED', externalSkuId: 'S-SHARED' })];
    const hash = fileHash('same-file-different-account');

    const [first, second] = await Promise.all([
      importCatalog(rows, hash, WING_ACCOUNT_ID),
      importCatalog(rows, hash, SECOND_WING_ACCOUNT_ID),
    ]);
    const [products, skus, runs] = await Promise.all([
      prisma.channelListing.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'P-SHARED' },
        orderBy: { channelAccountId: 'asc' },
      }),
      prisma.channelListingOption.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          externalOptionId: 'S-SHARED',
        },
        orderBy: { listing: { channelAccountId: 'asc' } },
      }),
      prisma.sourceImportRun.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID, fileHash: hash },
        orderBy: { publicationSequence: 'asc' },
      }),
    ]);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(second.run.id).not.toBe(first.run.id);
    expect(products).toHaveLength(2);
    expect(skus).toHaveLength(2);
    expect(new Set(products.map((row) => row.id))).toHaveLength(2);
    expect(new Set(skus.map((row) => row.id))).toHaveLength(2);
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.publicationSequence)).toEqual([1n, 2n]);
  });

  it('deactivates only unseen account identities and reuses them when they reappear', async () => {
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-RETURN',
          externalSkuId: 'S-RETURN',
        }),
      ],
      fileHash('identity-first'),
      WING_ACCOUNT_ID,
    );
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-RETURN',
          externalSkuId: 'S-RETURN',
        }),
      ],
      fileHash('identity-second-account'),
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

    const absentPublication = await importCatalog(
      [
        makeRow(1, {
          externalProductId: 'P-NEW',
          externalSkuId: 'S-NEW',
        }),
      ],
      fileHash('identity-absent'),
      WING_ACCOUNT_ID,
    );

    const [inactiveProduct, inactiveSku, otherAccountProduct, otherAccountSku] = await Promise.all([
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

    expect(inactiveProduct).toMatchObject({
      id: productBefore.id,
      isActive: false,
      lastImportRunId: absentPublication.run.id,
    });
    expect(inactiveSku).toMatchObject({
      id: skuBefore.id,
      isActive: false,
      lastImportRunId: absentPublication.run.id,
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
      fileHash('identity-returned'),
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
      lastImportRunId: returnedPublication.run.id,
    });
    expect(skuAfter).toMatchObject({
      id: skuBefore.id,
      isActive: true,
      itemName: '다시 들어온 옵션',
      lastImportRunId: returnedPublication.run.id,
    });
  });

  it('uses recoverable skipped identities without deactivating an incomplete snapshot dimension', async () => {
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
    await importCatalog(completeRows, fileHash('partial-skip-seed'));

    const missingSkuPublication = await importCatalog(
      [completeRows[0]],
      fileHash('partial-skip-product-identity'),
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
      'P-SKU-PARENT': false,
      'P-UNSEEN': false,
      'P-VALID': true,
    });
    expect(skusAfterMissingSku).toEqual({
      'S-PRODUCT-RECOVERED': true,
      'S-SKU-RECOVERED': true,
      'S-UNSEEN': true,
      'S-VALID': true,
    });

    await importCatalog(completeRows, fileHash('partial-skip-reactivate'));
    const missingProductPublication = await importCatalog(
      [completeRows[0]],
      fileHash('partial-skip-sku-identity'),
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
      'S-PRODUCT-RECOVERED': false,
      'S-SKU-RECOVERED': true,
      'S-UNSEEN': false,
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
    const hash = fileHash('cross-account-parent');

    const result = await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-ACCOUNT-B',
          externalSkuId: 'S-CROSS-ACCOUNT',
        }),
      ],
      hash,
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
    expect(result).toMatchObject({
      duplicate: false,
      changes: { createdProductCount: 1, createdSkuCount: 1 },
    });
    expect(
      await prisma.sourceImportRun.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: SECOND_WING_ACCOUNT_ID,
          fileHash: hash,
        },
      }),
    ).toMatchObject({ status: 'completed', publicationSequence: 1n });
  });

  it('updates metadata/raw JSON while preserving stable IDs, confirmed links, prices, seller SKUs, and recipes', async () => {
    const initialRows = [
      makeRow(0, { externalProductId: 'P-KEEP', externalSkuId: 'S-SINGLE' }),
      makeRow(1, { externalProductId: 'P-KEEP', externalSkuId: 'S-FOUR' }),
      makeRow(2, { externalProductId: 'P-KEEP', externalSkuId: 'S-MIXED' }),
      makeRow(3, { externalProductId: 'P-KEEP', externalSkuId: 'S-ABSENT' }),
    ];
    await importCatalog(initialRows, fileHash('metadata-first'));
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
    const inventorySkus = await prisma.sellpiaInventorySku.createManyAndReturn({
      data: [0, 1].map((index) => ({
        organizationId: TEST_ORGANIZATION_ID,
        code: `SP-INVENTORY-${index}`,
        name: `component ${index}`,
        currentStock: index,
      })),
    });
    const linkedProduct = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-PRESERVED',
        name: 'Preserved product link',
        abcGrade: 'A',
        profitTag: 'operator-authored',
        adTier: 'scale',
        adBudgetLimit: 55_000,
        healthScore: 91,
      },
    });
    const linkedVariants = await prisma.productVariant.createManyAndReturn({
      data: initialRows.map((row, index) => ({
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: linkedProduct.id,
        code: `KI-PRESERVED-${index}`,
        name: row.externalSkuId!,
        isDefault: index === 0,
      })),
    });
    await prisma.channelListing.update({
      where: { id: productBefore.id },
      data: {
        masterProductId: linkedProduct.id,
      },
    });
    const contentBefore = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'channel_listing',
        channelListingId: productBefore.id,
        displayName: '등록상품 콘텐츠',
        normalizedTitle: 'registered-content',
        createdByUserId: TEST_USER_ID,
      },
    });
    const skuByExternalId = new Map(skusBefore.map((sku) => [sku.externalOptionId, sku]));
    const preservation = [
      ['S-SINGLE', linkedVariants[0]!.id, 'SELLER-SINGLE', 10_000],
      ['S-FOUR', linkedVariants[1]!.id, 'SELLER-FOUR', 20_000],
      ['S-MIXED', linkedVariants[2]!.id, 'SELLER-MIXED', 30_000],
      ['S-ABSENT', linkedVariants[3]!.id, 'SELLER-ABSENT', 40_000],
    ] as const;
    for (const [
      externalOptionId,
      productVariantId,
      sellerSku,
      salePrice,
    ] of preservation) {
      await prisma.channelListingOption.update({
        where: { id: skuByExternalId.get(externalOptionId)!.id },
        data: {
          productVariantId,
          sellerSku,
          salePrice,
          status: externalOptionId === 'S-ABSENT' ? 'absent-status' : 'old-status',
        },
      });
    }
    await prisma.productVariantComponent.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: linkedVariants[0]!.id,
          sellpiaInventorySkuId: inventorySkus[0]!.id,
          quantity: 1,
          source: 'manual',
          confirmedBy: TEST_USER_ID,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: linkedVariants[1]!.id,
          sellpiaInventorySkuId: inventorySkus[0]!.id,
          quantity: 4,
          source: 'manual',
          confirmedBy: TEST_USER_ID,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: linkedVariants[2]!.id,
          sellpiaInventorySkuId: inventorySkus[0]!.id,
          quantity: 2,
          source: 'manual',
          confirmedBy: TEST_USER_ID,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: linkedVariants[2]!.id,
          sellpiaInventorySkuId: inventorySkus[1]!.id,
          quantity: 3,
          source: 'manual',
          confirmedBy: TEST_USER_ID,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: linkedVariants[3]!.id,
          sellpiaInventorySkuId: inventorySkus[1]!.id,
          quantity: 1,
          source: 'manual',
          confirmedBy: TEST_USER_ID,
        },
      ],
    });
    const componentsBefore = await prisma.productVariantComponent.findMany({
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
    const second = await importCatalog(changedRows, fileHash('metadata-second'));

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
      prisma.productVariantComponent.findMany({ orderBy: { id: 'asc' } }),
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
      lastImportRunId: second.run.id,
      isActive: true,
      masterProductId: linkedProduct.id,
    });
    expect(new Set(skusAfter.map((sku) => sku.id))).toEqual(
      new Set(skusBefore.filter((sku) => sku.externalOptionId !== 'S-ABSENT').map((sku) => sku.id)),
    );
    for (const sku of skusAfter) {
      const preserved = preservation.find(([externalId]) => externalId === sku.externalOptionId)!;
      expect(sku).toMatchObject({
        productVariantId: preserved[1],
        sellerSku: preserved[2],
        salePrice: preserved[3],
        lastImportRunId: second.run.id,
        isActive: true,
        rawJson: expect.objectContaining({ revision: 2 }),
      });
    }
    expect(componentsAfter).toEqual(componentsBefore);
    expect(absentAfter).toMatchObject({
      id: skuByExternalId.get('S-ABSENT')!.id,
      productVariantId: linkedVariants[3]!.id,
      sellerSku: 'SELLER-ABSENT',
      salePrice: 40_000,
      status: 'absent-status',
      isActive: false,
      lastImportRunId: second.run.id,
    });
    expect(contentAfter).toEqual(contentBefore);
    expect(linkedProductAfter).toMatchObject({
      abcGrade: 'A',
      profitTag: 'operator-authored',
      adTier: 'scale',
      adBudgetLimit: 55_000,
      healthScore: 91,
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
      fileHash('original-parent'),
    );
    const before = await prisma.channelListingOption.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        listing: { channelAccountId: WING_ACCOUNT_ID },
        externalOptionId: 'S-STABLE',
      },
      include: { listing: true },
    });
    const rejectedHash = fileHash('changed-parent');

    await expect(
      importCatalog(
        [
      makeRow(1, { externalProductId: 'P-NEW', externalSkuId: 'S-STABLE' }),
          makeRow(2, {
            externalProductId: 'P-ALSO-NEW',
            externalSkuId: 'S-NEW',
          }),
        ],
        rejectedHash,
      ),
    ).rejects.toThrow('different parent');

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
    expect(
      await prisma.sourceImportRun.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, fileHash: rejectedHash },
      }),
    ).toMatchObject({ status: 'failed', publicationSequence: null });
  });

  it('returns a completed same-hash/account import as a no-op', async () => {
    const hash = fileHash('duplicate');
    const first = await importCatalog([makeRow(0)], hash);
    const before = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });

    const duplicate = await importCatalog(
      [makeRow(0, { optionName: 'must not write', skuStatus: 'changed' })],
      hash,
    );
    const after = await prisma.channelListingOption.findFirstOrThrow({
      where: { id: before.id },
    });

    expect(duplicate).toMatchObject({
      duplicate: true,
      changes: zeroChanges(),
    });
    expect(duplicate.run.id).toBe(first.run.id);
    expect(after).toEqual(before);
    expect(await prisma.sourceImportRun.count()).toBe(1);
  });

  it('keeps fresh runs running, reclaims stale/failed runs by CAS, and rotates tokens', async () => {
    const hash = fileHash('stale-running');
    const oldToken = randomUUID();
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: WING_ACCOUNT_ID,
        fileName: 'wing.xlsx',
        fileHash: hash,
        status: 'running',
        rowCount: 1,
        createdBy: TEST_USER_ID,
        attemptToken: oldToken,
        updatedAt: new Date(Date.now() - 29 * 60 * 1_000),
      },
    });

    expect(await claim(hash)).toEqual({ kind: 'running' });
    await prisma.sourceImportRun.update({
      where: { id: run.id },
      data: { updatedAt: new Date(Date.now() - 31 * 60 * 1_000) },
    });
    const claims = await Promise.all([claim(hash), claim(hash)]);
    expect(claims.map((value) => value.kind).sort()).toEqual(['running', 'started']);
    const reclaimed = claims.find((value) => value.kind === 'started');
    if (reclaimed?.kind !== 'started') throw new Error('expected stale claim');
    expect(reclaimed).toMatchObject({ runId: run.id });
    expect(reclaimed.attemptToken).not.toBe(oldToken);

    const failedHash = fileHash('failed-retry');
    const failedToken = randomUUID();
    const failedRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: WING_ACCOUNT_ID,
        fileName: 'wing.xlsx',
        fileHash: failedHash,
        status: 'failed',
        rowCount: 1,
        createdBy: TEST_USER_ID,
        attemptToken: failedToken,
      },
    });
    const retry = await claim(failedHash);
    expect(retry).toMatchObject({ kind: 'started', runId: failedRun.id });
    if (retry.kind !== 'started') throw new Error('expected failed retry');
    expect(retry.attemptToken).not.toBe(failedToken);
  });

  it('rejects a stale worker token on write/fail after account-scoped reclamation', async () => {
    const hash = fileHash('fenced-worker');
    const workerAToken = randomUUID();
    const run = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: WING_ACCOUNT_ID,
        fileName: 'wing.xlsx',
        fileHash: hash,
        status: 'running',
        rowCount: 1,
        createdBy: TEST_USER_ID,
        attemptToken: workerAToken,
        updatedAt: new Date(Date.now() - 31 * 60 * 1_000),
      },
    });
    const workerB = await claim(hash);
    if (workerB.kind !== 'started') throw new Error('expected worker B reclaim');

    await expect(
      repository.upsertCoupangWingCatalog({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: workerAToken,
      rows: [makeRow(0, { externalSkuId: 'S-WORKER-A' })],
      skippedRows: [],
      }),
    ).rejects.toThrow();
    await repository.markImportFailed(TEST_ORGANIZATION_ID, WING_ACCOUNT_ID, run.id, workerAToken);
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject(
      { status: 'running', attemptToken: workerB.attemptToken },
    );
    expect(await prisma.channelListing.count()).toBe(0);

    const completed = await repository.upsertCoupangWingCatalog({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: workerB.attemptToken,
      rows: [makeRow(0, { externalSkuId: 'S-WORKER-B' })],
      skippedRows: [],
    });
    const lateWorkerA = await repository.upsertCoupangWingCatalog({
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: WING_ACCOUNT_ID,
      runId: run.id,
      attemptToken: workerAToken,
      rows: [makeRow(0, { externalSkuId: 'S-WORKER-A' })],
      skippedRows: [],
    });
    expect(completed.duplicate).toBe(false);
    expect(lateWorkerA).toMatchObject({
      duplicate: true,
      changes: zeroChanges(),
    });
    expect(
      await prisma.channelListingOption.findMany({
      select: { externalOptionId: true },
      }),
    ).toEqual([{ externalOptionId: 'S-WORKER-B' }]);
  });

  it('rolls back mid-write failures, marks only the run failed, and never changes another organization', async () => {
    await importCatalog(
      [
        makeRow(0, {
          externalProductId: 'P-BEFORE',
          externalSkuId: 'S-BEFORE',
        }),
      ],
      fileHash('before-failure'),
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
      rawJson: index === 500 ? { cannotSerialize: BigInt(1) } : { index },
      }),
    );
    const hash = fileHash('mid-write-failure');

    await expect(importCatalog(failingRows, hash)).rejects.toThrow();

    expect(await prisma.channelListing.findMany({ orderBy: { id: 'asc' } })).toEqual(
      beforeProducts,
    );
    expect(await prisma.channelListingOption.findMany({ orderBy: { id: 'asc' } })).toEqual(
      beforeSkus,
    );
    expect(
      await prisma.sourceImportRun.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: WING_ACCOUNT_ID,
        fileHash: hash,
      },
      }),
    ).toMatchObject({ status: 'failed' });
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

  function importCatalog(
    rows: ParsedWingCatalogRow[],
    hash: string,
    channelAccountId = WING_ACCOUNT_ID,
    skippedRows: Array<{
      rowNumber: number;
      reason: 'missing_product_id' | 'missing_sku_id';
      externalProductId: string | null;
      externalSkuId: string | null;
    }> = [],
  ) {
    return service.importCoupangWing({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId,
      fileName: 'wing.xlsx',
      fileHash: hash,
      headers: ['등록상품ID', '옵션 ID'],
      rows,
      skippedRows,
    });
  }

  function claim(hash: string) {
    return repository.claimCoupangWingImport({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: WING_ACCOUNT_ID,
      fileName: 'wing.xlsx',
      fileHash: hash,
      rowCount: 1,
    });
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
});

function importInput(
  overrides: Partial<Parameters<ChannelCatalogImportService['importCoupangWing']>[0]> = {},
): Parameters<ChannelCatalogImportService['importCoupangWing']>[0] {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    channelAccountId: WING_ACCOUNT_ID,
    fileName: 'wing.xlsx',
    fileHash: fileHash('default-input'),
    headers: ['등록상품ID', '옵션 ID'],
    rows: [makeRow(0)],
    skippedRows: [],
    ...overrides,
  };
}

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
    rawJson: { index },
    ...overrides,
  };
}

function fileHash(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}

function zeroChanges() {
  return {
    createdProductCount: 0,
    updatedProductCount: 0,
    createdSkuCount: 0,
    updatedSkuCount: 0,
    skippedRowCount: 0,
  };
}
