import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
  productAbcDisplayStatus,
} from '@kiditem/shared/product-abc';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { CatalogDisplayMediaRepositoryAdapter } from '../../ai/adapter/out/repository/catalog-display-media.repository.adapter';
import { CatalogDisplayMediaService } from '../../ai/application/service/catalog-display-media.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import {
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCollection,
  seedOrderWithLineItems,
} from '../../test-helpers/finance-seeds';
import { addDays, businessDateKey, evidenceCutoffDate, kstDayStart } from '../../common/kst';
import { ProductOperationsRepositoryAdapter } from '../adapter/out/persistence/product-operations.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ProductQueryUseCase } from '../application/usecase/product-query.usecase';
import { ChannelOptionRecipeUseCase } from '../../channels/application/usecase/channel-option-recipe.usecase';
import { ProductAvailabilityRepositoryAdapter } from '../adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../application/usecase/product-availability.usecase';
import { ProductSourceReadRepositoryAdapter } from '../adapter/out/persistence/product-source-read.repository.adapter';
import { ProductSourceReadUseCase } from '../application/usecase/product-source-read.usecase';
import { ProductOperationsDataStatusRepositoryAdapter } from '../adapter/out/persistence/product-operations-data-status.repository.adapter';
import { ProductDataStatusUseCase } from '../application/usecase/product-data-status.usecase';
import { productAbcEvidenceCutoff } from '../domain/product-abc-display-status';
import { MasterProductProfitabilityReadService } from '../../finance/application/service/master-product-profitability-read.service';
import { SellpiaProfitabilitySourceService } from '../../analytics/sellpia-product-sales/sellpia-profitability-source.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

/** Seeded catalog listings predate every Wing traffic attempt a case creates. */
const CATALOG_SEEDED_AT = new Date('2026-08-01T00:00:00.000Z');

describe('ProductOperationsRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ProductQueryUseCase;
  let sellpia: SellpiaProfitabilitySourceService;
  let advertising: ProfitabilityAdImportRepositoryAdapter;
  let dataStatus: ProductDataStatusUseCase;
  let recipes: ChannelOptionRecipeUseCase;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const alerts = new SourceFailureAlerts(prismaService);
    const transactionalRead = new ProductTransactionalReadRepositoryAdapter();
    sellpia = new SellpiaProfitabilitySourceService(
      prismaService,
      alerts,
      transactionalRead,
    );
    advertising = new ProfitabilityAdImportRepositoryAdapter(prismaService, alerts);
    const dataStatusRepository = new ProductOperationsDataStatusRepositoryAdapter(
      prismaService,
      new MasterProductProfitabilityReadService(sellpia, advertising, prismaService, transactionalRead),
      transactionalRead,
    );
    dataStatus = new ProductDataStatusUseCase(dataStatusRepository);
    const inventory = new ProductAvailabilityUseCase(
      new ProductAvailabilityRepositoryAdapter(prismaService),
    );
    service = new ProductQueryUseCase(
      new ProductOperationsRepositoryAdapter(
        prismaService,
        transactionalRead,
        new ProductSourceReadUseCase(
          new ProductSourceReadRepositoryAdapter(prismaService),
        ),
      ),
      inventory,
      {
        findByMasterProductIds: async () => new Map(),
      },
      new CatalogDisplayMediaService(
        new CatalogDisplayMediaRepositoryAdapter(prismaService),
      ),
      dataStatusRepository,
      { readContribution: async () => null } as never,
    );
    recipes = new ChannelOptionRecipeUseCase(
      new ChannelOptionRecipeRepositoryAdapter(prismaService, transactionalRead),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    for (const [organizationId, hash] of [
      [TEST_ORGANIZATION_ID, 'a'.repeat(64)],
      [OTHER_ORGANIZATION_ID, 'b'.repeat(64)],
    ] as const) {
      const verifiedAt = new Date('2026-07-17T00:00:00.000Z');
      const run = await prisma.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: 'sellpia_inventory',
          channelAccountId: null,
          fileName: 'product-operations-inventory.json',
          fileHash: hash,
          status: 'completed',
          rowCount: 0,
          importedAt: verifiedAt,
          lastVerifiedAt: verifiedAt,
          verificationCount: 1,
          freshnessGeneration: 1n,
        },
      });
      await prisma.sellpiaInventoryState.create({
        data: {
          organizationId,
          requestedGeneration: 1n,
          verifiedGeneration: 1n,
          lastVerifiedAt: verifiedAt,
          lastCompletedImportRunId: run.id,
        },
      });
    }
  });

  it('fences source product reads by organization', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'ORG-SCOPED',
      name: 'Organization-scoped product',
    });

    await expect(service.getProduct(OTHER_ORGANIZATION_ID, product.id))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.masterProduct.count({
      where: { organizationId: TEST_ORGANIZATION_ID, id: product.id },
    })).toBe(1);
  });

  it('uses current stock for an existing identity even without a published import run', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'UNPUBLISHED-STOCK',
      name: 'Unpublished stock',
      currentStock: 0,
    });

    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(detail).toMatchObject({
      inventoryUnits: 0,
      inventory: { skuCount: 1, measuredSkuCount: 1 },
    });
    expect(detail).not.toHaveProperty('inventoryStatus');

    const soldOut = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'MEASURED-ZERO',
      name: 'Measured zero',
      currentStock: 0,
    });
    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
      adStatus: 'all',
      inventoryStatus: 'out_of_stock',
    });
    expect(page.items.map(({ id }) => id)).toEqual([soldOut.id, product.id]);
    expect(page.summary.inventoryStatusCounts.out_of_stock).toBe(2);
    expect(page.summary.inventoryStatusCounts.uncollected).toBe(0);
    expect(page.items[0]).toMatchObject({
      inventoryUnits: 0,
      inventory: { skuCount: 1, measuredSkuCount: 1 },
    });
  });

  it('keeps the source-generated code while exposing its linked channel listing', async () => {
    const channelAccountId = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: channelAccountId,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Coupang Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalId: '13712531060',
      },
    });
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'CHANNEL-ORIGIN',
      name: 'Channel-origin product',
    });
    const internalCode = product.code;
    const option = await prisma.channelListingOption.create({
      data: {
        listingId: listing.id,
        organizationId: TEST_ORGANIZATION_ID,
        externalOptionId: '13684204503001',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: product.id,
        quantity: 1,
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
    });
    const listItem = page.items.find((item) => item.id === product.id);
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(listItem).toMatchObject({
      code: internalCode,
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: internalCode,
      },
    });
    expect(page.summary.channelProductCounts).toEqual([{
      channelAccountId,
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
      count: 1,
    }]);
    expect(detail).toMatchObject({
      code: internalCode,
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: internalCode,
      },
      channelListings: [{
        id: listing.id,
        options: [{ id: option.id, externalOptionId: '13684204503001' }],
      }],
    });
  });

  it('derives display images from active matched channel media without persisting them', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Primary Wing',
        status: 'active',
        isPrimary: true,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'DISPLAY-P-1',
        isActive: true,
      },
    });
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'DISPLAY-MP-1',
      name: 'Channel image fallback',
      imageUrls: [],
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'DISPLAY-P-1-O',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: product.id,
        quantity: 1,
      },
    });
    const displayUrl = 'https://cdn.example.com/channel-primary.jpg';
    await attachCatalogPrimaryImage(listing.id, 'coupang', displayUrl);

    const foreignAccount = await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Foreign Wing',
        status: 'active',
        isPrimary: true,
      },
    });
    const foreignProduct = await seedProduct(OTHER_ORGANIZATION_ID, {
      code: 'FOREIGN-DISPLAY-MP',
      name: 'Foreign product',
      imageUrls: [],
    });
    const foreignListing = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: foreignAccount.id,
        externalId: 'DISPLAY-P-1',
        isActive: true,
      },
    });
    const foreignOption = await prisma.channelListingOption.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: foreignListing.id,
        externalOptionId: 'DISPLAY-P-1-O',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelListingOptionId: foreignOption.id,
        masterProductId: foreignProduct.id,
        quantity: 1,
      },
    });
    await attachCatalogPrimaryImage(
      foreignListing.id,
      'coupang',
      'https://cdn.example.com/foreign-channel.jpg',
      OTHER_ORGANIZATION_ID,
    );

    const directProduct = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'DIRECT-DISPLAY-MP',
      name: 'Direct product image',
      imageUrls: ['https://cdn.example.com/operator.jpg'],
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
    });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(byId.get(product.id)).toMatchObject({
      imageUrls: [],
      displayImageUrls: [displayUrl],
    });
    expect(detail).toMatchObject({
      imageUrls: [],
      displayImageUrls: [displayUrl],
    });
    expect(byId.get(directProduct.id)).toMatchObject({
      imageUrls: ['https://cdn.example.com/operator.jpg'],
      displayImageUrls: ['https://cdn.example.com/operator.jpg'],
    });
    expect(page.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayImageUrls: ['https://cdn.example.com/foreign-channel.jpg'],
      }),
    ]));
    expect(await prisma.masterProduct.findUniqueOrThrow({
      where: { id: product.id },
      select: { imageUrls: true },
    })).toEqual({ imageUrls: [] });
  });

  it('summarizes ABC grades across the full result instead of the current page', async () => {
    const first = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'GRADE-A-1',
      name: 'A grade one',
    });
    const second = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'GRADE-A-2',
      name: 'A grade two',
    });
    const third = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'GRADE-B-1',
      name: 'B grade one',
    });
    const unclassified = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'GRADE-NULL-1',
      name: 'Unclassified grade',
    });
    await seedOfficialAbcEvaluations(prisma, [
      { masterProductId: first.id, abcGrade: 'A' },
      { masterProductId: second.id, abcGrade: 'A' },
      { masterProductId: third.id, abcGrade: 'B' },
    ]);
    // A later publication may carry an older official evaluation forward when
    // that product has insufficient new facts. Grade filtering follows the
    // retained owner row, not an exact revision match.
    await prisma.masterProductAbcFormulaState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { publicationRevision: 2, publishedAt: new Date('2026-09-02T00:00:00.000Z') },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 1,
      periodDays: 30,
      activeStatus: 'all',
    });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(4);
    expect(page.summary.abcGradeCounts).toEqual({ A: 2, B: 1, C: 0, unclassified: 1 });
    expect(page.summary.channelProductCounts).toEqual([]);
    expect(page.summary.inventoryStatusCounts).toEqual({
      sellable: 0,
      out_of_stock: 4,
      configuration_required: 0,
      review_required: 0,
      uncollected: 0,
    });
    expect(page.summary.negativeProfitCount).toBe(0);

    const unclassifiedPage = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      abcGrade: 'unclassified',
      activeStatus: 'all',
    });
    expect(unclassifiedPage.total).toBe(1);
    expect(unclassifiedPage.items.map((item) => item.id)).toEqual([unclassified.id]);

    const aGradePage = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      abcGrade: 'A',
      activeStatus: 'all',
    });
    expect(aGradePage.items.map((item) => ({ id: item.id, grade: item.abcGrade })))
      .toEqual(expect.arrayContaining([
        { id: first.id, grade: 'A' },
        { id: second.id, grade: 'A' },
      ]));
    expect(aGradePage.items.every((item) => item.abc.abcGrade === 'A')).toBe(true);
    expect(aGradePage.items.every((item) =>
      item.abc.evaluation?.publicationRevision === 1
      && item.abc.publicationRevision === 2)).toBe(true);
  });

  it('reads one coherent official ABC publication while a replacement is published', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'ABC-PUBLICATION-RACE',
      name: 'Publication race',
    });
    await seedOfficialAbcEvaluations(prisma, [
      { masterProductId: product.id, abcGrade: 'A' },
    ]);

    let replacementPublished = false;
    const extendedPrisma = prisma.$extends({
      query: {
        masterProductAbcFormulaState: {
          async findUnique({ args, query }) {
            const retainedState = await query(args);
            if (replacementPublished) return retainedState;
            replacementPublished = true;
            await prisma.$transaction(async (tx) => {
              await tx.masterProductAbcFormulaState.update({
                where: { organizationId: TEST_ORGANIZATION_ID },
                data: {
                  publicationRevision: 2,
                  publishedAt: new Date('2026-09-02T00:00:00.000Z'),
                },
              });
              await tx.masterProductAbcEvaluation.updateMany({
                where: {
                  organizationId: TEST_ORGANIZATION_ID,
                  masterProductId: product.id,
                },
                data: { abcGrade: 'C', publicationRevision: 2 },
              });
            });
            return retainedState;
          },
        },
      },
    });
    const originalEvidence = new MasterProductProfitabilityReadService(
      sellpia,
      advertising,
      prisma as unknown as PrismaService,
      new ProductTransactionalReadRepositoryAdapter());
    const adapter = new ProductOperationsDataStatusRepositoryAdapter(
      extendedPrisma as unknown as PrismaService,
      originalEvidence,
      new ProductTransactionalReadRepositoryAdapter(),
    );

    const result = await adapter.read(TEST_ORGANIZATION_ID, 30);
    const official = result.products.find(({ masterProductId }) =>
      masterProductId === product.id);

    expect(replacementPublished).toBe(true);
    expect([
      { grade: 'A', publicationRevision: 1 },
      { grade: 'C', publicationRevision: 2 },
    ]).toContainEqual({
      grade: official?.abcGrade ?? null,
      publicationRevision: official?.evaluation?.publicationRevision ?? null,
    });
  });

  it('derives ABC display statuses from current source snapshots and keeps status, grade, and organization filters distinct', async () => {
    const observing = await seedProduct(TEST_ORGANIZATION_ID, { code: 'ABC-OBSERVING', name: 'Observing', currentStock: 1 });
    const ready = await seedProduct(TEST_ORGANIZATION_ID, { code: 'ABC-READY', name: 'Ready', currentStock: 1 });
    const unpublished = await seedProduct(TEST_ORGANIZATION_ID, { code: 'ABC-UNPUBLISHED', name: 'Unpublished', currentStock: 1 });
    const foreign = await seedProduct(OTHER_ORGANIZATION_ID, { code: 'ABC-FOREIGN', name: 'Foreign', currentStock: 1 });
    await seedOfficialAbcEvaluations(
      prisma,
      [{ masterProductId: ready.id, abcGrade: 'B' }],
    );
    await prisma.masterProduct.update({
      where: { id: observing.id },
      data: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
    });
    await prisma.masterProduct.update({
      where: { id: unpublished.id },
      data: { createdAt: new Date('2026-09-02T00:00:00.000Z') },
    });

    const all = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
    });
    expect(all.total).toBe(3);
    expect(all.items.find((item) => item.id === observing.id)?.abc).toMatchObject({
      abcGrade: null,
      evaluation: null,
    });
    expect(all.items.find((item) => item.id === ready.id)?.abc).toMatchObject({
      abcGrade: 'B',
    });
    expect(all.items.find((item) => item.id === unpublished.id)?.abc).toMatchObject({
      abcGrade: null,
      evaluation: null,
    });
    const displayStatusOf = (id: string) => {
      const abc = all.items.find((item) => item.id === id)?.abc;
      return abc ? productAbcDisplayStatus(abc) : null;
    };
    expect([observing.id, ready.id, unpublished.id].map(displayStatusOf))
      .toEqual(['INSUFFICIENT_EVIDENCE', 'READY', 'INSUFFICIENT_EVIDENCE']);
    expect(all.summary).toMatchObject({
      abcGradeCounts: { A: 0, B: 1, C: 0, unclassified: 2 },
    });

    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
    })).resolves.toMatchObject({
      total: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ id: observing.id }),
        expect.objectContaining({ id: unpublished.id }),
      ]),
    });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcCalculationStatus: 'READY',
    })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: ready.id })] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcCalculationStatus: 'SOURCE_UNMAPPED',
    })).resolves.toMatchObject({ total: 0, items: [] });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, { page: 1, limit: 50, periodDays: 30, activeStatus: 'all', abcGrade: 'unclassified' }))
      .resolves.toMatchObject({ total: 2 });
    expect(all.items.map((item) => item.id)).not.toContain(foreign.id);
    expect(all.items.map((item) => item.id)).toContain(unpublished.id);
  });

  it('allows the same source code in different organizations', async () => {
    await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'SHARED-SOURCE',
      name: 'Test product',
    });
    await seedProduct(OTHER_ORGANIZATION_ID, {
      code: 'SHARED-SOURCE',
      name: 'Other product',
    });

    expect(await prisma.masterProduct.count({
      where: {
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'SHARED-SOURCE',
        sourceOptionCode: '',
      },
    })).toBe(2);
  });

  it('projects direct channel-option recipes and deduplicates shared physical stock', async () => {
    const { product, options } = await linkedProductWithOptions('KI-BUNDLE', 2, 7);

    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      [{ masterProductId: product.id, quantity: 1 }],
    );
    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[1]!.id,
      [{ masterProductId: product.id, quantity: 2 }],
    );
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(detail.inventoryUnits).toBe(7);
    expect(detail.inventory).toEqual({ skuCount: 1, measuredSkuCount: 1 });
    expect(detail.channelListings[0]!.options.map((option) => option.capacity).sort()).toEqual([3, 7]);
    const single = detail.channelListings[0]!.options.find(({ id }) => id === options[0]!.id);
    expect(single?.inventoryComponents).toMatchObject([{
      masterProductId: product.id,
      quantity: 1,
      currentStock: 7,
    }]);
    expect(await prisma.masterProduct.findUniqueOrThrow({
      where: { id: product.id },
      select: { id: true },
    })).toEqual({ id: product.id });
  });

  it('preserves a deleted source product reference with null identity and stock without relinking the same code', async () => {
    const { product, options } = await linkedProductWithOptions('KI-DELETED-REF', 1);
    const deletedProduct = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'SP-DELETED-REF',
      name: 'SP-DELETED-REF',
      currentStock: 7,
    });
    await replaceRecipe(TEST_ORGANIZATION_ID, options[0]!.id, [
      { masterProductId: product.id, quantity: 1 },
      { masterProductId: deletedProduct.id, quantity: 2 },
    ]);
    await prisma.masterProduct.delete({ where: { id: deletedProduct.id } });
    await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'SP-DELETED-REF',
      name: 'SP-DELETED-REF replacement',
      currentStock: 99,
    });
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    expect(detail.channelListings[0]!.options[0]).toMatchObject({
      capacity: null,
      inventoryComponents: expect.arrayContaining([expect.objectContaining({ masterProductId: deletedProduct.id, quantity: 2, code: null, name: null, currentStock: null })]),
    });
  });

  it('increments mapping generation once for a committed recipe replacement', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-GENERATION', 1, 7);

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);

    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      [{ masterProductId: product.id, quantity: 2 }],
    );

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    await expect(prisma.masterProductAbcFormulaState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: {
        activeFormulaVersionId: true,
        formulaRevision: true,
        publicationRevision: true,
        mappingGeneration: true,
      },
    })).resolves.toEqual({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      publicationRevision: 0,
      mappingGeneration: 1n,
    });
  });

  it('does not increment mapping generation for an identical recipe replacement', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-NOOP', 1, 7);
    const replacement = [{ masterProductId: product.id, quantity: 2 }];

    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      replacement,
    );
    const first = await prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: options[0]!.id },
      select: { id: true, createdAt: true },
    });
    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);

    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      replacement,
    );

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(1n);
    await expect(prisma.channelListingOptionInventoryComponent.findFirstOrThrow({
      where: { channelListingOptionId: options[0]!.id },
      select: { id: true, createdAt: true },
    })).resolves.toEqual(first);
  });

  it('does not increment mapping generation for a rejected recipe replacement', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-REJECTED', 1);
    const foreignProduct = await seedProduct(OTHER_ORGANIZATION_ID, {
      code: 'KI-MAPPING-FOREIGN',
      name: 'Foreign product',
      currentStock: 7,
    });

    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      [{ masterProductId: foreignProduct.id, quantity: 1 }],
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);
    expect(await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBeNull();
  });

  it('rolls back the recipe and generation when the mapping transaction cannot advance', async () => {
    const { product, options } = await linkedProductWithOptions('KI-MAPPING-ROLLBACK', 1, 7);
    const oldGeneration = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: { organizationId: TEST_ORGANIZATION_ID, mappingGeneration: oldGeneration },
    });

    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      [{ masterProductId: product.id, quantity: 2 }],
    )).rejects.toThrow();

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(oldGeneration);
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: options[0]!.id },
    })).toBe(0);
  });

  it('does not increment mapping generation for product-operation reads', async () => {
    const { product } = await linkedProductWithOptions('KI-MAPPING-READ', 1);

    await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'all',
    });

    expect(await readMappingGeneration(TEST_ORGANIZATION_ID)).toBe(0n);
    expect(await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBeNull();
  });

  it('uses physical stock for option capacity without mutating it', async () => {
    const { product, options } = await linkedProductWithOptions('KI-COMMITTED', 1, 100);
    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      [{ masterProductId: product.id, quantity: 2 }],
    );
    const detail = await service.getProduct(TEST_ORGANIZATION_ID, product.id);

    expect(detail).toMatchObject({
      inventoryUnits: 100,
      inventory: { skuCount: 1, measuredSkuCount: 1 },
      channelListings: [{ options: [{
        capacity: 50,
        inventoryComponents: [{
          currentStock: 100,
          quantity: 2,
        }],
      }] }],
    });
    expect(await prisma.masterProduct.findUniqueOrThrow({
      where: { id: product.id },
      select: { currentStock: true },
    })).toEqual({ currentStock: 100 });
  });

  it('atomically replaces direct recipes and preserves the old recipe on invalid input', async () => {
    const { product, options } = await linkedProductWithOptions('KI-RECIPE', 1, 10);
    const foreign = await seedProduct(OTHER_ORGANIZATION_ID, {
      code: 'INV-FOREIGN',
      name: 'Foreign',
      currentStock: 10,
    });
    const optionId = options[0]!.id;

    await replaceRecipe(
      TEST_ORGANIZATION_ID,
      optionId,
      [{ masterProductId: product.id, quantity: 1 }],
    );
    const replaced = await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    expect(replaced.channelListings[0]!.options[0]).toMatchObject({
      capacity: 10,
      inventoryComponents: [{ masterProductId: product.id, quantity: 1 }],
    });
    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      optionId,
      [{ masterProductId: foreign.id, quantity: 1 }],
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(replaceRecipe(
      OTHER_ORGANIZATION_ID,
      optionId,
      [],
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(await prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: optionId },
      select: { masterProductId: true, quantity: true },
    })).toEqual([{ masterProductId: product.id, quantity: 1 }]);

    const afterRead = await service.getProduct(TEST_ORGANIZATION_ID, product.id);
    expect(afterRead).toMatchObject({
      inventory: { skuCount: 1, measuredSkuCount: 1 },
      channelListings: [{ options: [{
        capacity: 10,
        inventoryComponents: [{ masterProductId: product.id, currentStock: 10 }],
      }] }],
    });
  });

  it('derives the product link when an unlinked listing receives a complete recipe', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'INV-UNLINKED',
      name: 'Inventory product',
      currentStock: 5,
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Unlinked Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'UNLINKED-P',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'UNLINKED-O',
      },
    });

    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      option.id,
      [{ masterProductId: product.id, quantity: 1 }],
    )).resolves.toEqual({ masterProductId: product.id });
    expect(await prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: option.id },
    })).toBe(1);
  });

  it('links several options only when every recipe converges on one inventory product', async () => {
    const first = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'INV-FIRST',
      name: 'First inventory',
      currentStock: 5,
    });
    const second = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'INV-SECOND',
      name: 'Second inventory',
      currentStock: 5,
    });
    const { options } = await linkedProductWithOptions('LEGACY-MIXED', 2);

    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[0]!.id,
      [{ masterProductId: first.id, quantity: 1 }],
    )).resolves.toEqual({ masterProductId: null });
    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[1]!.id,
      [{ masterProductId: second.id, quantity: 1 }],
    )).resolves.toEqual({ masterProductId: null });

    await expect(replaceRecipe(
      TEST_ORGANIZATION_ID,
      options[1]!.id,
      [{ masterProductId: first.id, quantity: 2 }],
    )).resolves.toEqual({ masterProductId: first.id });
  });

  it('uses completed Orders coverage for product sales in the selected closed KST window', async () => {
    const { product, options } = await linkedProductWithOptions('ORDERS-WINDOW', 1, 0, true);
    const cutoff = evidenceCutoffDate();
    const start = addDays(cutoff, -6);
    const order = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'CLOSED-KST-START',
      orderedAt: kstDayStart(start).toISOString(),
      lineItems: [{
        quantity: 2,
        totalPrice: 7000,
        optionId: 'option',
        listingOptionId: options[0]!.id,
      }],
    });
    const outside = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'CURRENT-KST-DAY',
      orderedAt: kstDayStart(addDays(cutoff, 1)).toISOString(),
      lineItems: [{
        quantity: 9,
        totalPrice: 99000,
        optionId: 'option',
        listingOptionId: options[0]!.id,
      }],
    });
    const run = await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: businessDateKey(start),
      endDate: businessDateKey(cutoff),
      orderIds: [order, outside],
    });
    const query = {
      page: 1,
      limit: 50,
      periodDays: 7 as const,
      activeStatus: 'all' as const,
      adStatus: 'all' as const,
    };
    const page = await service.listProducts(TEST_ORGANIZATION_ID, query);
    expect(page.items.find(({ id }) => id === product.id)).toMatchObject({
      orderCount: 1,
      salesQuantity: 2,
      salesAmount: 7000,
      metricsFreshness: {
        orders: {
          ready: true,
          coverageStartDate: businessDateKey(start),
          coverageEndDate: businessDateKey(cutoff),
        },
      },
    });
    await prisma.sourceImportRun.update({
      where: { id: run },
      data: { coverageStartDate: addDays(start, 1) },
    });
    const partial = await service.listProducts(TEST_ORGANIZATION_ID, query);
    expect(partial.items.find(({ id }) => id === product.id)).toMatchObject({
      orderCount: null,
      salesQuantity: null,
      salesAmount: null,
      metricsFreshness: { orders: { ready: false } },
    });
  });

  it('filters advertising by measured spend', async () => {
    const spent = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'ADS-SPENT',
      name: 'Measured advertising',
    });
    const zero = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'ADS-ZERO',
      name: 'Measured no advertising',
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Measured ads',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'ADS-SPENT-LISTING',
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'ADS-SPENT-OPTION',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: listingOption.id,
        masterProductId: spent.id,
        quantity: 1,
      },
    });
    const zeroListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'ADS-ZERO-LISTING',
      },
    });
    const zeroOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: zeroListing.id,
        externalOptionId: 'ADS-ZERO-OPTION',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: zeroOption.id,
        masterProductId: zero.id,
        quantity: 1,
      },
    });
    const cutoff = evidenceCutoffDate();
    const runId = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: account.id,
      generation: 1,
      window: {
        startDate: businessDateKey(addDays(cutoff, -6)),
        endDate: businessDateKey(cutoff),
      },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: businessDateKey(cutoff),
      spend: 5_000,
      runId,
    });
    const query = { activeStatus: 'all', periodDays: 7 };
    const active = await service.listProducts(TEST_ORGANIZATION_ID, {
      ...query,
      adStatus: 'active',
    });
    const inactive = await service.listProducts(TEST_ORGANIZATION_ID, {
      ...query,
      adStatus: 'inactive',
    });

    expect(active.items.map(({ id, adSpend }) => ({ id, adSpend })))
      .toEqual([{ id: spent.id, adSpend: 5_000 }]);
    expect(inactive.items.map(({ id, adSpend }) => ({ id, adSpend })))
      .toEqual([{ id: zero.id, adSpend: 0 }]);
    expect(active.total).toBe(1);
    expect(inactive.total).toBe(1);
  });

  it('ends the advertising window at the evidence cutoff while the sweep holds yesterday as unreported', async () => {
    const { product, listing } = await linkedProductWithOptions('ADS-HELD', 1, 0, true);
    // The newest complete sweep requested 2026-09-06 and held it back.
    const heldSweep = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: listing.channelAccountId,
      generation: 1,
      window: { startDate: '2026-08-30', endDate: '2026-09-05' },
      requestedEndDate: '2026-09-06',
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: '2026-09-05',
      spend: 5_000,
      runId: heldSweep,
    });
    const query = { activeStatus: 'all', periodDays: 7 } as const;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 2026-09-07 12:00 KST: yesterday is 2026-09-06.
      vi.setSystemTime(new Date('2026-09-07T03:00:00.000Z'));
      const held = await service.listProducts(TEST_ORGANIZATION_ID, query);
      expect(held.items.find(({ id }) => id === product.id)).toMatchObject({
        adSpend: 5_000,
        metricsFreshness: {
          advertising: { ready: true, coverageStartDate: '2026-08-30', coverageEndDate: '2026-09-05' },
        },
      });

      // A later sweep that saw yesterday's spend confirms it.
      const reportedSweep = await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        generation: 2,
        window: { startDate: '2026-08-31', endDate: '2026-09-06' },
      });
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        date: '2026-09-06',
        spend: 7_000,
        runId: reportedSweep,
      });
      const reported = await service.listProducts(TEST_ORGANIZATION_ID, query);
      expect(reported.items.find(({ id }) => id === product.id)).toMatchObject({
        adSpend: 7_000,
        metricsFreshness: {
          advertising: { ready: true, coverageStartDate: '2026-08-31', coverageEndDate: '2026-09-06' },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('withholds the ad spend rate while the ad window and the sales window end on different days', async () => {
    const { product, listing, options } = await linkedProductWithOptions('ADS-RATE', 1, 0, true);
    const order = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'ADS-RATE-ORDER',
      orderedAt: '2026-09-03T03:00:00.000Z',
      lineItems: [{
        quantity: 1,
        totalPrice: 20_000,
        optionId: 'option',
        listingOptionId: options[0]!.id,
      }],
    });
    await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: '2026-08-31',
      endDate: '2026-09-06',
      orderIds: [order],
    });
    // The sweep held yesterday (2026-09-06), so ads close a day before sales.
    const heldSweep = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: listing.channelAccountId,
      generation: 1,
      window: { startDate: '2026-08-30', endDate: '2026-09-05' },
      requestedEndDate: '2026-09-06',
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: '2026-09-03',
      spend: 2_000,
      runId: heldSweep,
    });
    const query = {
      page: 1,
      limit: 50,
      periodDays: 7 as const,
      activeStatus: 'all' as const,
      adStatus: 'all' as const,
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 2026-09-07 12:00 KST: both amounts are measured, but over different dates.
      vi.setSystemTime(new Date('2026-09-07T03:00:00.000Z'));
      const held = await service.listProducts(TEST_ORGANIZATION_ID, query);
      expect(held.items.find(({ id }) => id === product.id)).toMatchObject({
        salesAmount: 20_000,
        adSpend: 2_000,
        adSpendRate: null,
        metricsFreshness: {
          advertising: { ready: true, coverageStartDate: '2026-08-30', coverageEndDate: '2026-09-05' },
          orders: { ready: true, coverageStartDate: '2026-08-31', coverageEndDate: '2026-09-06' },
        },
      });

      // A later sweep confirms yesterday, so both windows cover the same dates.
      const reportedSweep = await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        generation: 2,
        window: { startDate: '2026-08-31', endDate: '2026-09-06' },
      });
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        date: '2026-09-03',
        spend: 2_000,
        runId: reportedSweep,
      });
      const reported = await service.listProducts(TEST_ORGANIZATION_ID, query);
      expect(reported.items.find(({ id }) => id === product.id)).toMatchObject({
        salesAmount: 20_000,
        adSpend: 2_000,
        adSpendRate: 10,
        metricsFreshness: {
          advertising: { ready: true, coverageStartDate: '2026-08-31', coverageEndDate: '2026-09-06' },
          orders: { ready: true, coverageStartDate: '2026-08-31', coverageEndDate: '2026-09-06' },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps sales separate from Wing traffic while views and cart adds follow the covered days', async () => {
    const withoutFacts = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-NULL',
      name: 'No facts',
    });
    const withFacts = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-FACTS',
      name: 'With facts',
    });
    const channelAccountId = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: channelAccountId,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalId: 'P-001',
        createdAt: CATALOG_SEEDED_AT,
      },
    });
    await seedListingRecipe(listing, withFacts.id, 'P-001-O');
    const now = new Date();
    const businessDate = productAbcEvidenceCutoff(now);
    const businessDateAtUtc = new Date(`${businessDate}T00:00:00.000Z`);
    const legacyBusinessDateAtUtc = new Date(businessDateAtUtc);
    legacyBusinessDateAtUtc.setUTCDate(legacyBusinessDateAtUtc.getUTCDate() - 1);
    const legacyBusinessDate = legacyBusinessDateAtUtc.toISOString().slice(0, 10);
    const sourceAttemptId = randomUUID();
    await prisma.sourceImportRun.create({
      data: {
        id: sourceAttemptId,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: false,
        qualityReport: { confirmedDates: [businessDate] },
        importedAt: now,
      },
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: businessDateAtUtc,
        trafficViews: 20,
        trafficCartAdds: 2,
        trafficOrders: 3,
        trafficSalesQty: 4,
        trafficRevenue: 40_000,
        trafficObservedAt: now,
        lastObservedAt: now,
        metaJson: {
          'traffic.currentSource': 'wing.traffic',
          'wing.traffic': {
            grain: 'listing_option_sum',
            scope: 'matched_listings',
            periodDays: 1,
            sourceAttemptId,
            businessDate,
          },
        },
      },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: businessDate,
      spend: 5_000,
    });
    // Legacy period-as-day traffic has no accepted provenance and must not affect product totals.
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: legacyBusinessDateAtUtc,
        trafficViews: 900,
        trafficOrders: 90,
        trafficRevenue: 900_000,
        metaJson: {
          source: 'wing.traffic',
          data: {
            periodDays: 7,
            businessDate: legacyBusinessDate,
          },
        },
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(withoutFacts.id)).toMatchObject({
      traffic: null,
      orderCount: null,
      salesAmount: null,
      adSpend: null,
      abcEvaluation: null,
    });
    // Wing confirmed only yesterday, so views and cart adds sum that one day.
    expect(byId.get(withFacts.id)).toMatchObject({
      channelCount: 1,
      traffic: null,
      visitorCount: null,
      viewCount: 20,
      cartAddCount: 2,
      orderCount: null,
      salesQuantity: null,
      salesAmount: null,
      adSpend: null,
      abcEvaluation: null,
    });
    expect(periodBasisStatus(byId.get(withFacts.id)!.metricsFreshness.traffic.basis)).toBe('partial');
    expect(page.summary.negativeProfitCount).toBe(0);

    const dates = Array.from(
      { length: 7 },
      (_, index) => businessDateKey(addDays(businessDateAtUtc, -index)),
    );
    await prisma.sourceImportRun.update({
      where: { id: sourceAttemptId },
      data: {
        qualityReport: {
          confirmedDates: dates,
          providerBackedEmptyDates: dates.filter((date) => date !== businessDate),
        },
      },
    });
    const measured = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });
    expect(measured.items.find(({ id }) => id === withoutFacts.id)).toMatchObject({
      visitorCount: null,
      viewCount: null,
      cartAddCount: null,
    });
    const measuredWithFacts = measured.items.find(({ id }) => id === withFacts.id);
    expect(measuredWithFacts).toMatchObject({
      visitorCount: null,
      viewCount: 20,
      cartAddCount: 2,
      orderCount: null,
      salesQuantity: null,
      salesAmount: null,
      metricsFreshness: { orders: { ready: false } },
    });
    expect(periodBasisStatus(measuredWithFacts!.metricsFreshness.traffic.basis)).toBe('complete');
  });

  it('sums views and cart adds over the covered days of a partial window while orders keep the whole window', async () => {
    const { product, listings } = await productWithWingListings('KI-TRAFFIC-PARTIAL-WINDOW', 1);
    const listing = listings[0]!;
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'KI-TRAFFIC-PARTIAL-WINDOW-O-1',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: product.id,
        quantity: 1,
      },
    });
    const dates = closedWindowDates(14);
    // Wing confirmed every day of the window except yesterday.
    const coveredDates = dates.slice(0, 13);
    const capturedAt = new Date(`${dates[13]}T02:00:00.000Z`);
    const attempt = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: false,
        qualityReport: { confirmedDates: coveredDates },
        importedAt: capturedAt,
      },
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: coveredDates.map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficViews: 7,
        trafficCartAdds: 2,
        trafficObservedAt: capturedAt,
        metaJson: {
          'traffic.currentSource': 'wing.traffic',
          'wing.traffic': { sourceAttemptId: attempt.id, businessDate: date },
        },
      })),
    });
    // Orders cover the same thirteen days and hold one sale inside them.
    const order = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'TRAFFIC-PARTIAL-WINDOW-ORDER',
      orderedAt: kstDayStart(new Date(`${coveredDates[5]}T00:00:00.000Z`)).toISOString(),
      lineItems: [{
        quantity: 1,
        totalPrice: 3_000,
        optionId: 'option',
        listingOptionId: option.id,
      }],
    });
    await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: coveredDates[0]!,
      endDate: coveredDates[12]!,
      orderIds: [order],
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 14,
      activeStatus: 'all',
    });

    const item = page.items.find(({ id }) => id === product.id);
    expect(item).toMatchObject({
      visitorCount: null,
      viewCount: 91,
      cartAddCount: 26,
      orderCount: null,
      salesQuantity: null,
      salesAmount: null,
      metricsFreshness: { orders: { ready: false } },
    });
    // Traffic freshness is the capture time and the basis, with nothing derived from them.
    expect(item?.metricsFreshness.traffic).toEqual({
      capturedAt,
      basis: {
        kind: 'period',
        from: dates[0],
        to: dates[13],
        targetDays: 14,
        includedDates: coveredDates,
        invalidDates: [],
        sources: ['wing_traffic'],
      },
    });
    expect(periodBasisStatus(item!.metricsFreshness.traffic.basis)).toBe('partial');
  });

  it('keeps views and cart adds unmeasured when no day of the window is covered', async () => {
    const { product, listings } = await productWithWingListings('KI-TRAFFIC-NO-COVERED-DAY', 2);
    const dates = closedWindowDates(7);
    const refusedDate = dates[6]!;
    // One of the product's two listings has an uploaded row, so the reader
    // refuses the date instead of counting it as collected.
    await seedCsvTraffic(listings[0]!, [refusedDate], { visitors: 9, views: 50, cartAdds: 5 });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });

    const item = page.items.find(({ id }) => id === product.id);
    expect(item).toMatchObject({
      visitorCount: null,
      viewCount: null,
      cartAddCount: null,
    });
    expect(item?.metricsFreshness.traffic.basis).toEqual({
      kind: 'period',
      from: dates[0],
      to: refusedDate,
      targetDays: 7,
      includedDates: [],
      invalidDates: [refusedDate],
      sources: ['wing_traffic'],
    });
    expect(periodBasisStatus(item!.metricsFreshness.traffic.basis)).toBe('empty');
  });

  it('leaves rows on a refused traffic date out of views and cart adds', async () => {
    const { product, listings } = await productWithWingListings('KI-TRAFFIC-REFUSED-DATE', 2);
    const dates = closedWindowDates(7);
    const coveredDates = dates.slice(0, 6);
    const refusedDate = dates[6]!;
    // Both listings uploaded the first six days. Yesterday only the first one
    // did, so the reader refuses yesterday but still returns that row.
    await seedCsvTraffic(listings[0]!, dates, { visitors: 3, views: 5, cartAdds: 1 });
    await seedCsvTraffic(listings[1]!, coveredDates, { visitors: 1, views: 2, cartAdds: 1 });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });

    const item = page.items.find(({ id }) => id === product.id);
    expect(item).toMatchObject({
      visitorCount: null,
      viewCount: 42,
      cartAddCount: 12,
    });
    expect(item?.metricsFreshness.traffic.basis).toMatchObject({
      includedDates: coveredDates,
      invalidDates: [refusedDate],
    });
    expect(periodBasisStatus(item!.metricsFreshness.traffic.basis)).toBe('partial');
  });

  it('keeps product traffic unmeasured when its listing has no row in a covered window', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-EMPTY-WINDOW',
      name: 'Empty traffic window',
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Empty traffic window Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'TRAFFIC-EMPTY-WINDOW',
        createdAt: CATALOG_SEEDED_AT,
      },
    });
    await seedListingRecipe(listing, product.id, 'TRAFFIC-EMPTY-WINDOW-O');
    const cutoff = productAbcEvidenceCutoff(new Date());
    const cutoffDate = new Date(`${cutoff}T00:00:00.000Z`);
    const confirmedDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(cutoffDate);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    const capturedAt = new Date(`${cutoff}T02:00:00.000Z`);
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: true,
        qualityReport: { confirmedDates },
        importedAt: capturedAt,
      },
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });

    // Only the traffic owner's zero row makes an omitted listing a measured 0.
    const item = page.items.find(({ id }) => id === product.id);
    expect(item).toMatchObject({
      visitorCount: null,
      viewCount: null,
      cartAddCount: null,
      orderCount: null,
      salesQuantity: null,
      salesAmount: null,
      metricsFreshness: {
        traffic: { capturedAt, basis: { from: confirmedDates[0], to: cutoff } },
        orders: { ready: false },
      },
    });
    expect(periodBasisStatus(item!.metricsFreshness.traffic.basis)).toBe('complete');
  });

  it('publishes the traffic owner zero rows of a covered window as measured zero', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-ZERO-WINDOW',
      name: 'Zero traffic window',
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Zero traffic window Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'TRAFFIC-ZERO-WINDOW',
        createdAt: CATALOG_SEEDED_AT,
      },
    });
    await seedListingRecipe(listing, product.id, 'TRAFFIC-ZERO-WINDOW-O');
    const cutoff = productAbcEvidenceCutoff(new Date());
    const confirmedDates = Array.from({ length: 7 }, (_, index) =>
      businessDateKey(addDays(new Date(`${cutoff}T00:00:00.000Z`), index - 6)));
    const capturedAt = new Date(`${cutoff}T02:00:00.000Z`);
    const attempt = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: false,
        qualityReport: { confirmedDates },
        importedAt: capturedAt,
      },
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: confirmedDates.map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficObservedAt: capturedAt,
        metaJson: {
          'traffic.currentSource': 'wing.traffic',
          'wing.traffic': { sourceAttemptId: attempt.id, businessDate: date },
        },
      })),
    });

    const page = await service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'all',
    });

    const item = page.items.find(({ id }) => id === product.id);
    expect(item).toMatchObject({
      visitorCount: null,
      viewCount: 0,
      cartAddCount: 0,
    });
    expect(periodBasisStatus(item!.metricsFreshness.traffic.basis)).toBe('complete');
  });

  it('keeps a missing traffic date distinct from measured zero in the public data status', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-STATUS',
      name: 'Traffic status',
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Traffic status Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'TRAFFIC-STATUS-1',
      },
    });
    const cutoff = productAbcEvidenceCutoff(new Date());
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${cutoff}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    const missingDate = dates[3]!;
    await prisma.channelListingDailySnapshot.createMany({
      data: dates.filter((date) => date !== missingDate).map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficVisitors: 0,
        trafficViews: 0,
        trafficCartAdds: 0,
        trafficOrders: 0,
        trafficSalesQty: 0,
        trafficRevenue: 0,
        trafficObservedAt: new Date(`${date}T02:00:00.000Z`),
        metaJson: { 'traffic.currentSource': 'traffic.csv_upload' },
      })),
    });

    const result = await dataStatus.getStatus(TEST_ORGANIZATION_ID, 7);

    expect(result.sources.traffic).toMatchObject({
      ready: false,
      actualCutoff: cutoff,
    });
  });

  it('does not let one observed listing complete the filtered product population', async () => {
    const observedProduct = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-PARTIAL-1',
      name: 'Observed traffic product',
    });
    const missingProduct = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-PARTIAL-2',
      name: 'Missing traffic product',
    });
    const accounts = await Promise.all(['OBSERVED', 'MISSING'].map((suffix) =>
      prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: `Partial traffic Wing ${suffix}`,
        },
      })));
    const observedListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accounts[0]!.id,
        externalId: 'TRAFFIC-PARTIAL-OBSERVED',
      },
    });
    await seedListingRecipe(observedListing, observedProduct.id, 'TRAFFIC-PARTIAL-OBSERVED-O');
    const missingListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accounts[1]!.id,
        externalId: 'TRAFFIC-PARTIAL-MISSING',
      },
    });
    await seedListingRecipe(missingListing, missingProduct.id, 'TRAFFIC-PARTIAL-MISSING-O');
    const cutoff = productAbcEvidenceCutoff(new Date());
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${cutoff}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: dates.map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: observedListing.id,
        channel: 'coupang',
        externalId: observedListing.externalId,
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficVisitors: 0,
        trafficViews: 0,
        trafficCartAdds: 0,
        trafficOrders: 0,
        trafficSalesQty: 0,
        trafficRevenue: 0,
        trafficObservedAt: new Date(`${date}T02:00:00.000Z`),
        metaJson: { 'traffic.currentSource': 'traffic.csv_upload' },
      })),
    });

    const result = await dataStatus.getStatus(TEST_ORGANIZATION_ID, 7);

    expect(result.sources.traffic).toEqual({
      ready: false,
      requiredCutoff: cutoff,
      actualCutoff: null,
      latestAttempt: null,
      latestComplete: null,
    });
  });

  it('publishes completed provider-backed empty traffic as measured zero in public data status', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-EMPTY',
      name: 'Empty traffic status',
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Empty traffic Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'TRAFFIC-EMPTY-1',
        createdAt: CATALOG_SEEDED_AT,
      },
    });
    await seedListingRecipe(listing, product.id, 'TRAFFIC-EMPTY-1-O');
    const cutoff = productAbcEvidenceCutoff(new Date());
    const confirmedDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${cutoff}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    const importedAt = new Date(`${cutoff}T06:00:00.000Z`);
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: true,
        qualityReport: { confirmedDates },
        importedAt,
      },
    });

    // Hold the independent profitability port's cutoff fixed; Orders and
    // traffic still cross their real PostgreSQL reader boundaries below.
    const profitability = new MasterProductProfitabilityReadService(
      sellpia, advertising, prisma as PrismaService,
      new ProductTransactionalReadRepositoryAdapter());
    const selectedStatus = new ProductDataStatusUseCase(
      new ProductOperationsDataStatusRepositoryAdapter(prisma as PrismaService, {
        load: async (input) => ({ ...await profitability.load(input), actualCutoff: cutoff }),
      }, new ProductTransactionalReadRepositoryAdapter()),
    );
    const result = await selectedStatus.getStatus(TEST_ORGANIZATION_ID, 7);

    expect(result.sources.traffic).toEqual({
      ready: true,
      requiredCutoff: cutoff,
      actualCutoff: cutoff,
      latestAttempt: null,
      latestComplete: { actualCutoff: cutoff, capturedAt: importedAt.toISOString() },
    });
    expect(result.sources.orders).toEqual({
      ready: false,
      requiredCutoff: cutoff,
      actualCutoff: null,
      latestAttempt: null,
      latestComplete: null,
    });
    expect(result.displayDataAsOf).toBeNull();

    const orderRunId = await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: confirmedDates[0]!,
      endDate: cutoff,
      orderIds: [],
    });
    const completed = await selectedStatus.getStatus(TEST_ORGANIZATION_ID, 7);
    expect(completed.sources.orders).toMatchObject({
      ready: true,
      requiredCutoff: cutoff,
      actualCutoff: cutoff,
      latestComplete: { actualCutoff: cutoff },
    });
    expect(completed.displayDataAsOf).toBe(cutoff);

    await prisma.sourceImportRun.update({
      where: { id: orderRunId, organizationId: TEST_ORGANIZATION_ID },
      data: { coverageStartDate: new Date(`${confirmedDates[1]}T00:00:00.000Z`) },
    });
    const partial = await selectedStatus.getStatus(TEST_ORGANIZATION_ID, 7);
    expect(partial.sources.orders).toMatchObject({ ready: false, latestComplete: null });
    expect(partial.displayDataAsOf).toBeNull();
  });

  it('keeps Product readiness when one confirmed date is explicitly empty', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-TRAFFIC-MIXED',
      name: 'Mixed traffic status',
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Mixed traffic Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'TRAFFIC-MIXED-1',
        createdAt: CATALOG_SEEDED_AT,
      },
    });
    await seedListingRecipe(listing, product.id, 'TRAFFIC-MIXED-1-O');
    const cutoff = productAbcEvidenceCutoff(new Date());
    const confirmedDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${cutoff}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    const emptyDate = confirmedDates[0]!;
    const importedAt = new Date(`${cutoff}T06:00:00.000Z`);
    const attempt = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: false,
        qualityReport: {
          confirmedDates,
          providerBackedEmptyDates: [emptyDate],
        },
        importedAt,
      },
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: confirmedDates.slice(1).map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficVisitors: 0,
        trafficViews: 0,
        trafficCartAdds: 0,
        trafficOrders: 0,
        trafficSalesQty: 0,
        trafficRevenue: 0,
        trafficObservedAt: new Date(`${date}T02:00:00.000Z`),
        metaJson: {
          'traffic.currentSource': 'wing.traffic',
          'wing.traffic': { sourceAttemptId: attempt.id },
        },
      })),
    });

    const result = await dataStatus.getStatus(TEST_ORGANIZATION_ID, 7);

    expect(result.sources.traffic).toEqual({
      ready: true,
      requiredCutoff: cutoff,
      actualCutoff: cutoff,
      latestComplete: {
        actualCutoff: cutoff,
        capturedAt: importedAt.toISOString(),
      },
      latestAttempt: null,
    });
  });

  it('filters selling products from sale-status evidence even when traffic is unobserved', async () => {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code: 'KI-SALE-STATUS',
      name: 'Sale status',
      currentStock: 5,
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Sale status Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'SALE-STATUS-1',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'SALE-STATUS-OPTION-1',
        status: '판매중',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId: product.id,
        quantity: 1,
      },
    });
    const status = await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date('2026-09-01T00:00:00.000Z'),
        saleStatus: '판매중',
        trafficObservedAt: null,
      },
    });

    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'active',
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: product.id })],
      total: 1,
    });

    await prisma.channelListingDailySnapshot.update({
      where: { id: status.id },
      data: { saleStatus: '판매중지' },
    });
    await expect(service.listProducts(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      periodDays: 7,
      activeStatus: 'active',
    })).resolves.toMatchObject({ items: [], total: 0 });
  });

  async function seedProduct(
    organizationId: string,
    input: {
      id?: string;
      code: string;
      name: string;
      optionName?: string | null;
      currentStock?: number;
      purchasePrice?: number | null;
      barcode?: string | null;
      imageUrls?: string[];
    },
  ) {
    return seedSourceProduct(prisma, { organizationId, ...input });
  }

  function replaceRecipe(
    organizationId: string,
    channelListingOptionId: string,
    components: readonly { masterProductId: string; quantity: number }[],
  ) {
    return recipes.replaceRecipe({
      organizationId,
      channelListingOptionId,
      components,
    });
  }

  async function seedListingRecipe(
    listing: { id: string },
    masterProductId: string,
    externalOptionId: string,
  ) {
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: option.id,
        masterProductId,
        quantity: 1,
      },
    });
    return option;
  }

  async function linkedProductWithOptions(
    code: string,
    optionCount: number,
    currentStock = 0,
    seedRecipe = false,
  ) {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code,
      name: code,
      currentStock,
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: `${code} Wing`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: `${code}-P`,
      },
    });
    const options = await Promise.all(Array.from({ length: optionCount }, (_, index) =>
      prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `${code}-O-${index + 1}`,
        },
      })));
    if (seedRecipe) {
      await prisma.channelListingOptionInventoryComponent.createMany({
        data: options.map((option) => ({
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: product.id,
          quantity: 1,
        })),
      });
    }
    return { product, listing, options };
  }

  /** A product sold through `listingCount` active listings of one Wing account. */
  async function productWithWingListings(code: string, listingCount: number) {
    const product = await seedProduct(TEST_ORGANIZATION_ID, {
      code,
      name: code,
    });
    const account = await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: `${code} Wing` },
    });
    const listings = await Promise.all(Array.from({ length: listingCount }, async (_, index) => {
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: account.id,
          externalId: `${code}-P-${index + 1}`,
          createdAt: CATALOG_SEEDED_AT,
        },
      });
      const option = await prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `${code}-O-${index + 1}`,
        },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: product.id,
          quantity: 1,
        },
      });
      return listing;
    }));
    return { product, account, listings };
  }

  /** One uploaded traffic row per date for one listing. */
  function seedCsvTraffic(
    listing: { id: string; externalId: string },
    dates: readonly string[],
    metrics: { visitors: number; views: number; cartAdds: number },
  ) {
    return prisma.channelListingDailySnapshot.createMany({
      data: dates.map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficVisitors: metrics.visitors,
        trafficViews: metrics.views,
        trafficCartAdds: metrics.cartAdds,
        trafficObservedAt: new Date(`${date}T02:00:00.000Z`),
        metaJson: { 'traffic.currentSource': 'traffic.csv_upload' },
      })),
    });
  }

  /** The last `days` closed KST business dates, oldest first, ending at the evidence cutoff. */
  function closedWindowDates(days: number): string[] {
    const cutoff = new Date(`${productAbcEvidenceCutoff(new Date())}T00:00:00.000Z`);
    return Array.from({ length: days }, (_, index) =>
      businessDateKey(addDays(cutoff, index - (days - 1))));
  }

  function readMappingGeneration(organizationId: string) {
    return prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      select: { mappingGeneration: true },
    }).then((state) => state?.mappingGeneration ?? 0n);
  }

  async function seedOfficialAbcEvaluations(
    prisma: PrismaClient,
    evaluations: readonly { masterProductId: string; abcGrade: 'A' | 'B' | 'C' }[],
  ) {
    const calculatedAt = new Date('2026-09-01T00:00:00.000Z');
    const coverageEndDate = new Date('2026-08-31T00:00:00.000Z');
    const formulaVersion = await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        formulaKey: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey,
        version: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.version,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      },
    });
    const sellpiaSource = await sellpia.beginAttempt(TEST_ORGANIZATION_ID, randomUUID());
    await sellpia.submitAttempt(TEST_ORGANIZATION_ID, sellpiaSource.attemptId, {
      attemptToken: sellpiaSource.attemptToken,
      parserVersion: 'sellpia-profitability-v2',
      providerBackedEmptyProof: true,
      coveredMonths: sellpiaSource.plan.coveredMonths,
      provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
      products: [],
    });
    const advertisingSource = await advertising.beginAttempt({ organizationId: TEST_ORGANIZATION_ID, idempotencyKey: randomUUID() });
    expect(advertisingSource.accounts).toEqual([]);
    await advertising.finalizeAttempt({ organizationId: TEST_ORGANIZATION_ID,
      attemptId: advertisingSource.attemptId, attemptToken: advertisingSource.attemptToken });
    await prisma.$transaction(async (tx) => {
      await tx.masterProductAbcFormulaState.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          activeFormulaVersionId: formulaVersion.id,
          formulaRevision: 1,
          publicationRevision: 1,
          officialCutoffDate: coverageEndDate,
          publishedSellpiaSourceImportRunId: sellpiaSource.attemptId,
          publishedAdvertisingSourceImportRunId: advertisingSource.attemptId,
          publishedMappingGeneration: 0n,
          mappingGeneration: 0n,
          publishedAt: calculatedAt,
        },
      });
      await tx.masterProductAbcEvaluation.createMany({
        data: evaluations.map(({ masterProductId, abcGrade }) => ({
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId,
          formulaVersionId: formulaVersion.id,
          abcGrade,
          weightedRevenue: 1_000_000,
          weightedOrderTimeSupplyCost: 200_000,
          weightedAdvertisingSpend: 100_000,
          weightedOperatingProfit: 700_000,
          operatingProfitVelocity30: 700_000,
          operatingMargin: 0.7,
          lossPersistence: 0,
          profitScore: 70,
          marginScore: 100,
          consistencyScore: 100,
          economicScore: abcGrade === 'A' ? 85 : abcGrade === 'B' ? 75 : 20,
          validObservationDays: 30,
          formulaRevision: 1,
          publicationRevision: 1,
          gradeBasisCutoffDate: coverageEndDate,
          sellpiaSourceImportRunId: sellpiaSource.attemptId,
          advertisingSourceImportRunId: advertisingSource.attemptId,
          sellpiaGeneration: 1n,
          advertisingGeneration: 1n,
          mappingGeneration: 0n,
          calculatedAt,
        })),
      });
    });
    return { formulaVersion, sellpiaSource, advertisingSource };
  }

  async function attachCatalogPrimaryImage(
    listingId: string,
    channel: string,
    url: string,
    organizationId = TEST_ORGANIZATION_ID,
  ) {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId,
        ownerType: 'channel_listing',
        channelListingId: listingId,
        displayName: `Workspace ${listingId}`,
        normalizedTitle: `workspace${listingId.replaceAll('-', '')}`,
      },
    });
    const group = await prisma.contentGenerationGroup.create({
      data: {
        organizationId,
        contentWorkspaceId: workspace.id,
        groupType: 'workspace_assets',
        title: 'Workspace managed assets',
      },
    });
    await prisma.contentAsset.create({
      data: {
        organizationId,
        originGenerationGroupId: group.id,
        assetKey: `channel-provider:${channel}:${listingId}`,
        url,
        assetType: 'image',
        role: 'primary',
        sortOrder: 0,
        metadata: { sourceType: 'channel_catalog', channel, active: true },
      },
    });
  }

});
