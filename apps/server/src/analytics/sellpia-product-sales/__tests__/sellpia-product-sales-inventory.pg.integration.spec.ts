import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SellpiaProductInventoryReader } from '../sellpia-product-inventory-reader';
import { SellpiaMasterProductAbcMetricReader } from '../sellpia-master-product-abc-metric.reader';
import { SELLPIA_PRODUCT_SALES_EVENTS } from '../sellpia-product-sales.events';
import type { PrismaService } from '../../../prisma/prisma.service';
import { InventoryCommitmentRepositoryAdapter } from '../../../inventory/adapter/out/repository/inventory-commitment.repository.adapter';
import { InventoryCommitmentService } from '../../../inventory/application/service/inventory-commitment.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../test-helpers/real-prisma';

describe('SellpiaProductSalesService canonical inventory projection (PG)', () => {
  let prisma: PrismaClient;
  let service: SellpiaProductSalesService;
  let metricReader: SellpiaMasterProductAbcMetricReader;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const inventory = new InventoryCommitmentService(
      new InventoryCommitmentRepositoryAdapter(prismaService),
    );
    eventEmitter = new EventEmitter2();
    service = new SellpiaProductSalesService(
      prismaService,
      new SellpiaProductInventoryReader(
        prismaService,
        inventory,
        { findCoupangDisplayMedia: async () => new Map() },
      ),
      eventEmitter,
    );
    metricReader = new SellpiaMasterProductAbcMetricReader(prismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    eventEmitter.removeAllListeners();
  });

  it('uses active organization-scoped inventory with code, option-code, then unique-barcode precedence', async () => {
    const verifiedAt = new Date('2026-07-17T02:03:04.000Z');
    await seedInventoryState(prisma, verifiedAt);
    const ownRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        status: 'completed',
        fileName: 'sellpia-option-products.xlsx',
        fileHash: 'own-inventory-hash',
        lastVerifiedAt: verifiedAt,
      },
    });
    const foreignRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        status: 'completed',
        fileName: 'other-sellpia-option-products.xlsx',
        fileHash: 'foreign-inventory-hash',
        lastVerifiedAt: new Date('2026-07-18T00:00:00.000Z'),
      },
    });

    await prisma.sellpiaInventorySku.createMany({
      data: [
        inventory('P-PRIMARY', 7, ownRun.id, { barcode: 'BAR-PRIMARY' }),
        inventory('OPT-PRIMARY', 70, ownRun.id, { barcode: 'BAR-OPTION-PRIMARY' }),
        inventory('OPT-FALLBACK', 9, ownRun.id, { barcode: 'BAR-OPTION' }),
        inventory('SKU-BARCODE', 11, ownRun.id, { barcode: 'BAR-ONLY' }),
        inventory('INACTIVE-CODE', 13, ownRun.id, { isActive: false }),
        inventory('DUP-A', 21, ownRun.id, { barcode: 'BAR-DUP' }),
        inventory('DUP-B', 22, ownRun.id, { barcode: 'BAR-DUP' }),
        {
          ...inventory('INACTIVE-CODE', 999, foreignRun.id),
          organizationId: OTHER_ORGANIZATION_ID,
        },
      ],
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
      status: 'matched', currentStock: 7, availableStock: 7,
    });
    expect(byProductCode['MISSING-OPTION'].inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 9, availableStock: 9,
    });
    expect(byProductCode['MISSING-BARCODE'].inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 11, availableStock: 11,
    });
    expect(byProductCode['INACTIVE-CODE'].inventoryResolution).toEqual({
      status: 'mapping_required',
      reason: 'inactive_candidate',
      candidateCount: 1,
    });
    expect(byProductCode['DUPLICATE-BARCODE'].inventoryResolution).toEqual({
      status: 'mapping_required',
      reason: 'ambiguous_barcode',
      candidateCount: 2,
    });
    expect(result.hasStock).toBe(true);
    expect(result.stockCapturedAt).toBe(verifiedAt.toISOString());
  });

  it('preserves depletion signals while projecting stored destination grades from canonical inventory', async () => {
    await seedInventoryState(prisma, new Date('2026-07-17T03:00:00.000Z'));
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        status: 'completed',
        fileName: 'sellpia-option-products.xlsx',
        fileHash: 'pr-329-metrics-inventory-hash',
        lastVerifiedAt: new Date('2026-07-17T03:00:00.000Z'),
      },
    });
    await prisma.sellpiaInventorySku.createMany({
      data: [
        inventory('REORDER', 200, importRun.id),
        inventory('DEAD', 50, importRun.id),
        inventory('SUMMER', 1_000, importRun.id),
        inventory('ANOMALY', 10, importRun.id),
      ],
    });
    const reorderDestination = await seedDestinationForSku(prisma, {
      skuCode: 'REORDER',
      masterCode: 'MASTER-REORDER',
      abcGrade: 'A',
    });
    await seedDestinationForSku(prisma, {
      skuCode: 'DEAD',
      masterCode: 'MASTER-DEAD',
      abcGrade: 'B',
    });
    await seedDestinationForSku(prisma, {
      skuCode: 'SUMMER',
      masterCode: 'MASTER-SUMMER',
      abcGrade: 'C',
    });
    const anomalyDestination = await seedDestinationForSku(prisma, {
      skuCode: 'ANOMALY',
      masterCode: 'MASTER-ANOMALY',
      abcGrade: null,
    });

    const completeMonths = previousKstYearMonths(12);
    const rows = completeMonths.flatMap((yearMonth, index) => {
      const calendarMonth = Number(yearMonth.slice(5, 7));
      return [
        metricSales('REORDER', yearMonth, 400, 1_000),
        metricSales('DEAD', yearMonth, index < 10 ? 20 : 0, 1_000),
        metricSales('SUMMER', yearMonth, [6, 7, 8].includes(calendarMonth) ? 100 : 1, 1_000),
        metricSales('ANOMALY', yearMonth, index === 0 ? 60_000 : 0, 50),
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
        activeCommitmentQuantity: 0,
        availableStock: 200,
      },
      monthsOfAvailableStockLeft: 0.5,
      reorderPoint: 600,
      needsReorder: true,
    });
    expect(byCode.REORDER).not.toHaveProperty('abcGrade');
    expect(byCode.REORDER.inventoryResolution.destinations).toEqual([
      expect.objectContaining({
        masterProductId: reorderDestination.masterProductId,
        abcGrade: 'A',
      }),
    ]);
    expect(byCode.DEAD).toMatchObject({
      inventoryResolution: {
        status: 'matched',
        currentStock: 50,
        availableStock: 50,
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
    expect(byCode.ANOMALY.inventoryResolution.destinations).toEqual([
      expect.objectContaining({
        masterProductId: anomalyDestination.masterProductId,
        abcGrade: null,
      }),
    ]);
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
      abcCounts: { A: 1, B: 1, C: 1 },
      classifiedProductCount: 3,
      unclassifiedProductCount: 1,
    });
  });

  it('reads complete organization-scoped completed-month evidence and rejects incomplete or shared recipes', async () => {
    const eligibleSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'METRIC-ELIGIBLE',
        name: 'Metric eligible',
        currentStock: 10,
      },
    });
    const incompleteSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'METRIC-INCOMPLETE',
        name: 'Metric incomplete',
        currentStock: 10,
      },
    });
    const sharedSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'METRIC-SHARED',
        name: 'Metric shared',
        currentStock: 10,
      },
    });
    const eligible = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      skuId: eligibleSku.id,
      code: 'METRIC-MASTER-ELIGIBLE',
    });
    const incomplete = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      skuId: incompleteSku.id,
      code: 'METRIC-MASTER-INCOMPLETE',
    });
    const sharedOne = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      skuId: sharedSku.id,
      code: 'METRIC-MASTER-SHARED-ONE',
    });
    const sharedTwo = await seedMasterRecipe(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      skuId: sharedSku.id,
      code: 'METRIC-MASTER-SHARED-TWO',
    });
    const foreignSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'METRIC-ELIGIBLE',
        name: 'Foreign metric eligible',
        currentStock: 10,
      },
    });
    const foreign = await seedMasterRecipe(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      skuId: foreignSku.id,
      code: 'METRIC-MASTER-FOREIGN',
    });
    const completedMonth = previousKstYearMonth();
    const currentMonth = currentKstYearMonth();
    const capturedAt = new Date('2026-07-20T01:00:00.000Z');
    await prisma.sellpiaProductMonthlySales.createMany({
      data: [
        {
          ...metricSales('METRIC-ELIGIBLE', completedMonth, 12, 100),
          capturedAt,
        },
        {
          ...metricSales('METRIC-SHARED', completedMonth, 30, 100),
          capturedAt,
        },
        {
          ...metricSales('METRIC-ELIGIBLE', currentMonth, 999, 100),
          capturedAt: new Date('2026-07-24T01:00:00.000Z'),
        },
        {
          ...metricSales('METRIC-ELIGIBLE', completedMonth, 999, 100),
          organizationId: OTHER_ORGANIZATION_ID,
          productName: 'Foreign metric',
          capturedAt: new Date('2026-07-23T01:00:00.000Z'),
        },
      ],
    });

    const snapshot = await metricReader.readMetricSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      metric: 'SALES_QUANTITY',
      periodDays: 30,
    });
    const evidence = new Map(snapshot.evidence.map((row) => [row.masterProductId, row]));

    expect(snapshot.sourceCapturedAt).toEqual(capturedAt);
    expect(evidence.get(eligible.masterProductId)).toEqual({
      masterProductId: eligible.masterProductId,
      metricValue: 12,
      eligible: true,
    });
    expect(evidence.get(incomplete.masterProductId)).toEqual({
      masterProductId: incomplete.masterProductId,
      metricValue: null,
      eligible: false,
    });
    expect(evidence.get(sharedOne.masterProductId)?.eligible).toBe(false);
    expect(evidence.get(sharedTwo.masterProductId)?.eligible).toBe(false);
    expect(evidence.has(foreign.masterProductId)).toBe(false);
  });

  it('authoritatively deletes an empty ingest range and publishes its post-commit event', async () => {
    await prisma.sellpiaProductMonthlySales.createMany({
      data: [
        { ...sales('DELETE-ME', '', null), yearMonth: '2026-05' },
        { ...sales('KEEP-ME', '', null), yearMonth: '2026-04' },
      ],
    });
    const events: Array<{ organizationId: string }> = [];
    eventEmitter.on(SELLPIA_PRODUCT_SALES_EVENTS.INGESTED, (event) => {
      events.push(event);
    });

    const result = await service.ingest(TEST_ORGANIZATION_ID, {
      range: { from: '2026-05-01', to: '2026-05-31' },
      products: [],
    });

    await expect(prisma.sellpiaProductMonthlySales.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { yearMonth: 'asc' },
      select: { productCode: true, yearMonth: true },
    })).resolves.toEqual([{ productCode: 'KEEP-ME', yearMonth: '2026-04' }]);
    expect(result).toEqual({ upserted: 0, productCount: 0, months: ['2026-05'] });
    expect(events).toEqual([{ organizationId: TEST_ORGANIZATION_ID }]);
  });

  it('uses common available stock for depletion while preserving physical stock', async () => {
    await seedInventoryState(prisma, new Date('2026-07-17T04:00:00.000Z'));
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'COMMITTED',
        name: 'Committed inventory',
        currentStock: 100,
      },
    });
    const commitment = await prisma.inventoryCommitment.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        kind: 'rocket_request',
        sourceId: '31000000-0000-4000-8000-000000000001',
        businessKey: 'coupang-rocket:test:committed',
        unitQuantity: 80,
        status: 'active',
        inventoryGeneration: 1n,
        createdBy: TEST_USER_ID,
      },
    });
    await prisma.inventoryCommitmentAllocation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        commitmentId: commitment.id,
        sellpiaInventorySkuId: sku.id,
        unitsPerItem: 1,
        quantity: 80,
      },
    });
    await prisma.sellpiaProductMonthlySales.createMany({
      data: previousKstYearMonths(2).map((yearMonth) => ({
        ...sales('COMMITTED', '', null),
        yearMonth,
        orderQty: 100,
      })),
    });

    const result = await service.getSummary(TEST_ORGANIZATION_ID);

    expect(result.products[0]).toMatchObject({
      inventoryResolution: {
        status: 'matched',
        currentStock: 100,
        activeCommitmentQuantity: 80,
        availableStock: 20,
      },
      monthsOfAvailableStockLeft: 0.2,
      needsReorder: true,
    });
  });
});

async function seedInventoryState(prisma: PrismaClient, verifiedAt: Date) {
  await prisma.sellpiaInventoryState.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: verifiedAt,
    },
  });
}

function inventory(
  code: string,
  currentStock: number,
  lastImportRunId: string,
  overrides: { barcode?: string; isActive?: boolean } = {},
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    code,
    name: `Sellpia ${code}`,
    barcode: overrides.barcode ?? null,
    currentStock,
    isActive: overrides.isActive ?? true,
    lastImportRunId,
  };
}

function sales(productCode: string, optionCode: string, barcode: string | null) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
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
  };
}

async function seedDestinationForSku(
  prisma: PrismaClient,
  input: {
    skuCode: string;
    masterCode: string;
    abcGrade: 'A' | 'B' | 'C' | null;
  },
) {
  const sku = await prisma.sellpiaInventorySku.findFirstOrThrow({
    where: { organizationId: TEST_ORGANIZATION_ID, code: input.skuCode },
  });
  return seedMasterRecipe(prisma, {
    organizationId: TEST_ORGANIZATION_ID,
    skuId: sku.id,
    code: input.masterCode,
    abcGrade: input.abcGrade,
  });
}

async function seedMasterRecipe(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    skuId: string;
    code: string;
    abcGrade?: 'A' | 'B' | 'C' | null;
  },
) {
  const master = await prisma.masterProduct.create({
    data: {
      organizationId: input.organizationId,
      code: input.code,
      name: input.code,
      abcGrade: input.abcGrade ?? null,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      organizationId: input.organizationId,
      masterProductId: master.id,
      code: `${input.code}-VARIANT`,
      name: `${input.code} variant`,
      isDefault: true,
    },
  });
  await prisma.productVariantComponent.create({
    data: {
      organizationId: input.organizationId,
      productVariantId: variant.id,
      sellpiaInventorySkuId: input.skuId,
      quantity: 1,
      source: 'manual',
    },
  });
  return { masterProductId: master.id, productVariantId: variant.id };
}

function previousKstYearMonth(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const previous = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentKstYearMonth(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousKstYearMonths(count: number): string[] {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return Array.from({ length: count }, (_, index) => {
    const monthsAgo = count - index;
    const month = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - monthsAgo, 1));
    return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
