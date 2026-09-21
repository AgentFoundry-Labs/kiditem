import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { ProfitabilityAdImportRepositoryAdapter } from '../../../advertising/adapter/out/repository/profitability-ad-import.repository.adapter';
import { MasterProductProfitabilityReadService } from '../../../finance/application/service/master-product-profitability-read.service';
import { MasterProductAbcRepositoryAdapter } from '../../../products/adapter/out/persistence/master-product-abc.repository.adapter';
import { ProductAbcReadUseCase } from '../../../products/application/usecase/product-abc-read.usecase';
import { SellpiaProfitabilitySourceService } from '../sellpia-profitability-source.service';
import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SellpiaProductInventoryReader } from '../sellpia-product-inventory-reader';
import { SellpiaMasterProductProfitFactReader } from '../sellpia-master-product-profit-fact.reader';
import { ProductAvailabilityRepositoryAdapter } from '../../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../../products/application/usecase/product-availability.usecase';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { seedSourceProduct } from '../../../test-helpers/inventory-seeds';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../test-helpers/real-prisma';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

let canonicalProfitabilityRunId: string;
let foreignProfitabilityRunId: string;

describe('SellpiaProductSalesService canonical inventory projection (PG)', () => {
  let prisma: PrismaClient;
  let service: SellpiaProductSalesService;
  let profitFactReader: SellpiaMasterProductProfitFactReader;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const inventory = new ProductAvailabilityUseCase(
      new ProductAvailabilityRepositoryAdapter(prismaService),
    );
    const alerts = new SourceFailureAlerts(prismaService);
    const evidence = new MasterProductProfitabilityReadService(
      new SellpiaProfitabilitySourceService(prismaService, alerts, new ProductTransactionalReadRepositoryAdapter()),
      new ProfitabilityAdImportRepositoryAdapter(prismaService, alerts), prismaService,
      new ProductTransactionalReadRepositoryAdapter());
    service = new SellpiaProductSalesService(
      prismaService,
      new SellpiaProductInventoryReader(
        prismaService,
        inventory,
        { findDisplayMedia: async () => new Map() },
        new ProductAbcReadUseCase(
          new MasterProductAbcRepositoryAdapter(prismaService, new ProductTransactionalReadRepositoryAdapter()), evidence,
        ),
        new ProductTransactionalReadRepositoryAdapter()),
    );
    profitFactReader = new SellpiaMasterProductProfitFactReader(prismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const owner = new SellpiaProfitabilitySourceService(
      prisma as never, new SourceFailureAlerts(prisma as never),
      new ProductTransactionalReadRepositoryAdapter());
    async function publishEmpty(organizationId: string) {
      const attempt = await owner.beginAttempt(organizationId, 'inventory-depletion-fixture');
      await owner.submitAttempt(organizationId, attempt.attemptId, {
        attemptToken: attempt.attemptToken, parserVersion: 'sellpia-profitability-v2',
        providerBackedEmptyProof: true, coveredMonths: attempt.plan.coveredMonths,
        provenance: { source: 'sellpia_stat_prd_profit', costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: true },
        products: [],
      });
      return attempt.attemptId;
    }
    canonicalProfitabilityRunId = await publishEmpty(TEST_ORGANIZATION_ID);
    foreignProfitabilityRunId = await publishEmpty(OTHER_ORGANIZATION_ID);
  });

  it('returns the published empty generation without inventing product facts', async () => {
    const result = await service.getSummary(TEST_ORGANIZATION_ID);

    expect(result).toMatchObject({
      products: [],
      productCount: 0,
      totalQty: 0,
      hasData: false,
    });
  });

  it('keeps partial boundary months visible but excludes them from depletion metrics', async () => {
    const [completeMonth, partialMonth] = previousKstYearMonths(2);
    const partialCoverage = fullCalendarMonthCoverage(partialMonth);
    await prisma.sellpiaProductMonthlySales.createMany({
      data: [
        {
          ...metricSales('PARTIAL-BOUNDARY', completeMonth!, 40, 1_000),
          ...fullCalendarMonthCoverage(completeMonth!),
        },
        {
          ...metricSales('PARTIAL-BOUNDARY', partialMonth!, 120, 1_000),
          coverageStartDate: partialCoverage.coverageStartDate,
          coverageEndDate: new Date(Date.UTC(
            partialCoverage.coverageStartDate.getUTCFullYear(),
            partialCoverage.coverageStartDate.getUTCMonth(),
            15,
          )),
        },
      ],
    });

    const result = await service.getSummary(TEST_ORGANIZATION_ID);

    expect(result.months).toEqual([completeMonth, partialMonth]);
    expect(result.completeMonths).toEqual([completeMonth]);
    expect(result.products[0]).toMatchObject({
      productCode: 'PARTIAL-BOUNDARY',
      qty1m: 40,
      qty2m: 40,
      avg2m: 40,
      totalQty: 160,
      monthly: [
        { yearMonth: completeMonth, orderQty: 40 },
        { yearMonth: partialMonth, orderQty: 120 },
      ],
    });
  });

  it('uses active organization-scoped inventory with code, option-code, then unique-barcode precedence', async () => {
    const verifiedAt = new Date('2026-07-17T02:03:04.000Z');
    await seedInventoryState(prisma, verifiedAt);
    await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'P-PRIMARY', optionCode: 'OPT-PRIMARY',
      currentStock: 7, barcode: 'BAR-PRIMARY',
    });
    await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'MISSING-OPTION', optionCode: 'OPT-FALLBACK',
      currentStock: 9, barcode: 'BAR-OPTION',
    });
    await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'SKU-BARCODE',
      currentStock: 11, barcode: 'BAR-ONLY',
    });
    await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'INACTIVE-CODE',
      currentStock: 13,
    });
    await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'DUP-A', currentStock: 21, barcode: 'BAR-DUP',
    });
    await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'DUP-B', currentStock: 22, barcode: 'BAR-DUP',
    });
    await seedInventoryProduct(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, code: 'INACTIVE-CODE', currentStock: 999,
    });

    const yearMonth = previousKstYearMonth();
    await prisma.sellpiaProductMonthlySales.createMany({
      data: [
        sales('P-PRIMARY', 'OPT-PRIMARY', 'BAR-PRIMARY'),
        sales('MISSING-OPTION', 'OPT-FALLBACK', 'BAR-OPTION'),
        sales('MISSING-BARCODE', '', 'BAR-ONLY'),
        sales('INACTIVE-CODE', '', null),
        sales('DUPLICATE-BARCODE', '', 'BAR-DUP'),
      ].map((row) => ({ ...row, yearMonth })),
    });

    const result = await service.getSummary(TEST_ORGANIZATION_ID);
    const byProductCode = Object.fromEntries(
      result.products.map((product) => [product.productCode, product]),
    );

    expect(byProductCode['P-PRIMARY'].inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 7,
    });
    expect(byProductCode['MISSING-OPTION'].inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 9,
    });
    expect(byProductCode['MISSING-BARCODE'].inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 11,
    });
    expect(byProductCode['INACTIVE-CODE'].inventoryResolution).toMatchObject({
      status: 'matched',
      currentStock: 13,
    });
    expect(byProductCode['DUPLICATE-BARCODE'].inventoryResolution).toEqual({
      status: 'mapping_required',
      reason: 'ambiguous_barcode',
      candidateCount: 2,
    });
    expect(result.hasStock).toBe(true);
    expect(result.stockCapturedAt).toBe(verifiedAt.toISOString());
  });

  it('preserves depletion signals without promoting grade caches that have no published evaluation', async () => {
    await seedInventoryState(prisma, new Date('2026-07-17T03:00:00.000Z'));
    await seedInventoryProduct(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'REORDER', currentStock: 200 });
    await seedInventoryProduct(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'DEAD', currentStock: 50 });
    await seedInventoryProduct(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'SUMMER', currentStock: 1_000 });
    await seedInventoryProduct(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'ANOMALY', currentStock: 10 });
    const reorderDestination = await seedDestinationForSku(prisma, {
      skuCode: 'REORDER',
      masterCode: 'MASTER-REORDER',
    });
    await seedDestinationForSku(prisma, {
      skuCode: 'DEAD',
      masterCode: 'MASTER-DEAD',
    });
    await seedDestinationForSku(prisma, {
      skuCode: 'SUMMER',
      masterCode: 'MASTER-SUMMER',
    });
    const anomalyDestination = await seedDestinationForSku(prisma, {
      skuCode: 'ANOMALY',
      masterCode: 'MASTER-ANOMALY',
    });

    const completeMonths = previousKstYearMonths(12);
    const rows = completeMonths.flatMap((yearMonth, index) => {
      const calendarMonth = Number(yearMonth.slice(5, 7));
      const coverage = fullCalendarMonthCoverage(yearMonth);
      return [
        { ...metricSales('REORDER', yearMonth, 400, 1_000), ...coverage },
        { ...metricSales('DEAD', yearMonth, index < 10 ? 20 : 0, 1_000), ...coverage },
        { ...metricSales('SUMMER', yearMonth, [6, 7, 8].includes(calendarMonth) ? 100 : 1, 1_000), ...coverage },
        { ...metricSales('ANOMALY', yearMonth, index === 0 ? 60_000 : 0, 50), ...coverage },
      ];
    });
    await prisma.sellpiaProductMonthlySales.createMany({ data: rows });

    const result = await service.getSummary(TEST_ORGANIZATION_ID);
    const byCode = Object.fromEntries(
      result.products.map((product) => [product.productCode, product]),
    );

    expect(result.completeMonths).toEqual(completeMonths);
    expect(byCode.REORDER).toMatchObject({
      avg2m: 400,
      trend: 'flat',
      inventoryResolution: {
        status: 'matched',
        currentStock: 200,
      },
      monthsOfAvailableStockLeft: 0.5,
      reorderPoint: 600,
      needsReorder: true,
    });
    expect(byCode.REORDER).not.toHaveProperty('abcGrade');
    expect(byCode.REORDER.inventoryResolution).toEqual(expect.objectContaining({ destinations: [
      expect.objectContaining({
        masterProductId: reorderDestination.masterProductId,
        abc: expect.objectContaining({ abcGrade: null }),
      }),
    ] }));
    expect(byCode.DEAD).toMatchObject({
      inventoryResolution: {
        status: 'matched',
        currentStock: 50,
      },
      deadStock: true,
      deadStockReason: '재고 정체(2개월+ 미판매)',
      needsReorder: false,
    });
    expect(byCode.SUMMER.seasonTag).toBe('여름');
    expect(byCode.ANOMALY).toMatchObject({
      avg2m: 0,
      totalQty: 0,
      anomaly: true,
      needsReorder: false,
    });
    expect(byCode.ANOMALY).not.toHaveProperty('abcGrade');
    expect(byCode.ANOMALY.inventoryResolution).toEqual(expect.objectContaining({ destinations: [
      expect.objectContaining({
        masterProductId: anomalyDestination.masterProductId,
        abc: expect.objectContaining({ abcGrade: null }),
      }),
    ] }));
    expect(byCode.ANOMALY.monthly.find((month) => month.yearMonth === completeMonths[0])).toEqual({
      yearMonth: completeMonths[0],
      orderQty: 60_000,
      anomaly: true,
    });
    expect(result).toMatchObject({
      hasStock: true,
      reorderCount: 1,
      deadStockCount: 1,
      anomalyCount: 1,
      abcCounts: { A: 0, B: 0, C: 0 },
      classifiedProductCount: 0,
      unclassifiedProductCount: 4,
    });
  });

  it('reads exact organization-scoped Sellpia profit facts once for a shared canonical inventory product', async () => {
    const eligibleSku = await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'METRIC-ELIGIBLE', currentStock: 10,
    });
    const incompleteSku = await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'METRIC-INCOMPLETE', currentStock: 10,
    });
    const sharedSku = await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'METRIC-SHARED', currentStock: 10,
    });
    const eligible = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: eligibleSku.id,
      code: 'METRIC-MASTER-ELIGIBLE',
    });
    const incomplete = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: incompleteSku.id,
      code: 'METRIC-MASTER-INCOMPLETE',
    });
    const sharedOne = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: sharedSku.id,
      code: 'METRIC-MASTER-SHARED-ONE',
    });
    await seedAdditionalListingForMasterSku(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: sharedOne.masterProductId,
      code: 'METRIC-SHARED-SECOND-CHANNEL',
    });
    const foreignSku = await seedInventoryProduct(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, code: 'METRIC-ELIGIBLE', currentStock: 10,
    });
    const foreign = await seedMasterRecipe(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      masterProductId: foreignSku.id,
      code: 'METRIC-MASTER-FOREIGN',
    });
    const completedMonth = previousKstYearMonth();
    const capturedAt = new Date('2026-07-20T01:00:00.000Z');
    const coverageStartDate = new Date(`${completedMonth}-01T00:00:00.000Z`);
    const coverageEndDate = new Date(Date.UTC(
      coverageStartDate.getUTCFullYear(), coverageStartDate.getUTCMonth() + 1, 0,
    ));
    await prisma.sellpiaProductMonthlySales.createMany({
      data: [
        {
          ...metricSales('METRIC-ELIGIBLE', completedMonth, 12, 100),
          legacySellpiaInventorySkuId: null,
          masterProductId: eligible.masterProductId,
          capturedAt,
          coverageStartDate,
          coverageEndDate,
        },
        {
          ...metricSales('METRIC-SHARED', completedMonth, 30, 100),
          legacySellpiaInventorySkuId: null,
          masterProductId: sharedOne.masterProductId,
          capturedAt,
          coverageStartDate,
          coverageEndDate,
        },
        {
          ...metricSales('METRIC-ELIGIBLE', completedMonth, 999, 100),
          organizationId: OTHER_ORGANIZATION_ID,
          sourceImportRunId: foreignProfitabilityRunId,
          legacySellpiaInventorySkuId: null,
          masterProductId: foreign.masterProductId,
          productName: 'Foreign metric',
          capturedAt: new Date('2026-07-23T01:00:00.000Z'),
          coverageStartDate,
          coverageEndDate,
        },
      ],
    });

    const snapshot = await profitFactReader.readProfitFacts({
      organizationId: TEST_ORGANIZATION_ID,
      masterProductIds: [
        eligible.masterProductId,
        incomplete.masterProductId,
        sharedOne.masterProductId,
      ],
      range: { from: coverageStartDate, to: coverageEndDate },
    });
    const evidence = new Map(snapshot.evidence.map((row) => [row.masterProductId, row]));

    expect(evidence.get(eligible.masterProductId)).toMatchObject({
      masterProductId: eligible.masterProductId,
      mappingStatus: 'MAPPED',
      monthlyFacts: [{
        yearMonth: completedMonth,
        coverageStartDate,
        coverageEndDate,
        revenue: 1200,
        sellpiaInAmount: 0,
        capturedAt,
      }],
    });
    expect(evidence.get(incomplete.masterProductId)).toMatchObject({
      masterProductId: incomplete.masterProductId,
      mappingStatus: 'UNMAPPED',
      monthlyFacts: [],
    });
    expect(evidence.get(sharedOne.masterProductId)).toMatchObject({
      mappingStatus: 'MAPPED',
      monthlyFacts: [expect.objectContaining({ revenue: 3_000 })],
    });
    expect(snapshot.orphanFacts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ productCode: 'METRIC-SHARED' }),
    ]));
    expect(evidence.has(foreign.masterProductId)).toBe(false);
  });

  it.each([
    { costBasis: 'UNKNOWN', vatIncluded: null },
    { costBasis: 'UNKNOWN', vatIncluded: true },
    { costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: null },
    { costBasis: 'ORDER_TIME_SUPPLY_COST', vatIncluded: false },
  ])('withholds the entire product month when one row lacks cost provenance: %j', async (provenance) => {
    const sku = await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'MIXED-COST',
      currentStock: 10,
    });
    const product = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: sku.id,
      code: 'MIXED-COST-MASTER',
    });
    const yearMonth = previousKstYearMonth();
    const coverage = fullCalendarMonthCoverage(yearMonth);
    const fact = {
      ...metricSales('MIXED-COST', yearMonth, 2, 100),
      ...coverage,
      legacySellpiaInventorySkuId: null,
      masterProductId: product.masterProductId,
    };
    await prisma.sellpiaProductMonthlySales.createMany({
      data: [
        { ...fact, optionCode: 'VALID', inAmount: 80 },
        { ...fact, optionCode: 'UNKNOWN', ...provenance },
      ],
    });

    const snapshot = await profitFactReader.readProfitFacts({
      organizationId: TEST_ORGANIZATION_ID,
      masterProductIds: [product.masterProductId],
      range: { from: coverage.coverageStartDate, to: coverage.coverageEndDate },
    });

    expect(snapshot.evidence).toEqual([expect.objectContaining({
      masterProductId: product.masterProductId,
      mappingStatus: 'MAPPED',
      monthlyFacts: [],
    })]);
    expect(snapshot.orphanFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        productCode: 'MIXED-COST',
        optionCode: 'UNKNOWN',
        yearMonth,
        reason: 'COST_PROVENANCE_MISSING',
      }),
    ]));
    expect(await prisma.sellpiaProductMonthlySales.count({
      where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: product.masterProductId },
    })).toBe(2);
  });

  it('uses physical available stock for depletion', async () => {
    await seedInventoryState(
      prisma,
      new Date('2026-07-17T04:00:00.000Z'),
    );
    const sku = await seedInventoryProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'COMMITTED',
      currentStock: 100,
    });
    await prisma.sellpiaProductMonthlySales.createMany({
      data: previousKstYearMonths(2).map((yearMonth) => ({
        ...sales('COMMITTED', '', null),
        yearMonth,
        orderQty: 100,
        ...fullCalendarMonthCoverage(yearMonth),
      })),
    });

    const result = await service.getSummary(TEST_ORGANIZATION_ID);

    expect(result.products[0]).toMatchObject({
      inventoryResolution: {
        status: 'matched',
        currentStock: 100,
      },
      monthsOfAvailableStockLeft: 1,
      needsReorder: true,
    });
  });
});

async function seedInventoryState(prisma: PrismaClient, verifiedAt: Date) {
  const run = await prisma.sourceImportRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      fileName: 'sellpia-inventory-fixture.json',
      fileHash: 'c'.repeat(64),
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
      organizationId: TEST_ORGANIZATION_ID,
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: verifiedAt,
      lastCompletedImportRunId: run.id,
    },
  });
  return run.id;
}

function sales(productCode: string, optionCode: string, barcode: string | null) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceImportRunId: canonicalProfitabilityRunId,
    productCode,
    optionCode,
    orderQty: 10,
    orderAmount: 10_000,
    inQty: 0,
    inAmount: 0,
    productName: `Sales ${productCode}`,
    optionName: null,
    providerName: 'Test supplier',
    salePrice: 1_000,
    buyPrice: 500,
    barcode,
    capturedAt: new Date('2026-07-17T01:00:00.000Z'),
  };
}


function metricSales(
  productCode: string,
  yearMonth: string,
  orderQty: number,
  salePrice: number,
) {
  return {
    ...sales(productCode, '', null),
    yearMonth,
    orderQty,
    orderAmount: orderQty * salePrice,
    productName: `Metrics ${productCode}`,
    salePrice,
    costBasis: 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: true,
  };
}

function fullCalendarMonthCoverage(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const coverageStartDate = new Date(Date.UTC(year!, month! - 1, 1));
  return {
    coverageStartDate,
    coverageEndDate: new Date(Date.UTC(
      coverageStartDate.getUTCFullYear(),
      coverageStartDate.getUTCMonth() + 1,
      0,
    )),
  };
}

async function seedDestinationForSku(
  prisma: PrismaClient,
  input: {
    skuCode: string;
    masterCode: string;
  },
) {
  const sku = await prisma.masterProduct.findFirstOrThrow({
    where: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceAccountKey: 'kiditem',
      sourceProductCode: input.skuCode,
    },
  });
  return seedMasterRecipe(prisma, {
    organizationId: TEST_ORGANIZATION_ID,
    masterProductId: sku.id,
    code: input.masterCode,
  });
}

async function seedInventoryProduct(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    code: string;
    optionCode?: string;
    currentStock: number;
    barcode?: string | null;
    purchasePrice?: number | null;
  },
) {
  const product = await seedSourceProduct(prisma, {
    organizationId: input.organizationId,
    code: input.code,
    name: `Sellpia ${input.code}`,
    currentStock: input.currentStock,
    barcode: input.barcode ?? null,
    purchasePrice: input.purchasePrice ?? null,
  });
  if (input.optionCode !== undefined) {
    return prisma.masterProduct.update({
      where: { id: product.id },
      data: {
        sourceOptionCode: input.optionCode,
        optionName: input.optionCode || null,
      },
    });
  }
  return product;
}

async function seedMasterRecipe(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    masterProductId: string;
    code: string;
  },
) {
  const master = await prisma.masterProduct.update({
    where: { id: input.masterProductId },
    data: { name: input.code },
  });
  const account = await prisma.channelAccount.upsert({
    where: {
      organizationId_channel_externalAccountId: {
        organizationId: input.organizationId,
        channel: 'coupang',
        externalAccountId: 'sales-inventory-test',
      },
    },
    create: {
      organizationId: input.organizationId,
      channel: 'coupang',
      name: 'Sales inventory test',
      externalAccountId: 'sales-inventory-test',
    },
    update: {},
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: input.organizationId,
      channelAccountId: account.id,
      masterProductId: master.id,
      externalId: `${input.code}-LISTING`,
      displayName: input.code,
    },
  });
  const option = await prisma.channelListingOption.create({
    data: {
      organizationId: input.organizationId,
      listingId: listing.id,
      externalOptionId: `${input.code}-OPTION`,
      itemName: `${input.code} option`,
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: input.organizationId,
      channelListingOptionId: option.id,
      masterProductId: input.masterProductId,
      quantity: 1,
    },
  });
  return { masterProductId: master.id, channelListingOptionId: option.id };
}

async function seedAdditionalListingForMasterSku(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    masterProductId: string;
    code: string;
  },
) {
  const account = await prisma.channelAccount.findFirstOrThrow({
    where: {
      organizationId: input.organizationId,
      channel: 'coupang',
      externalAccountId: 'sales-inventory-test',
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId: input.organizationId,
      channelAccountId: account.id,
      masterProductId: input.masterProductId,
      externalId: `${input.code}-LISTING`,
      displayName: input.code,
    },
  });
  const option = await prisma.channelListingOption.create({
    data: {
      organizationId: input.organizationId,
      listingId: listing.id,
      externalOptionId: `${input.code}-OPTION`,
      itemName: `${input.code} option`,
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId: input.organizationId,
      channelListingOptionId: option.id,
      masterProductId: input.masterProductId,
      quantity: 2,
    },
  });
}

function previousKstYearMonth(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const previous = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousKstYearMonths(count: number): string[] {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return Array.from({ length: count }, (_, index) => {
    const monthsAgo = count - index;
    const month = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - monthsAgo, 1));
    return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
