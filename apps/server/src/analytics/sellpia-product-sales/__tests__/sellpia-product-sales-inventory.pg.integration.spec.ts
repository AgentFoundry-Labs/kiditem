import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SellpiaProductInventoryReader } from '../sellpia-product-inventory-reader';
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

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const inventory = new InventoryCommitmentService(
      new InventoryCommitmentRepositoryAdapter(prismaService),
    );
    service = new SellpiaProductSalesService(
      prismaService,
      new SellpiaProductInventoryReader(prismaService, inventory),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
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

  it('preserves PR 329 depletion, ABC, dead-stock, season, anomaly, and reorder metrics on canonical inventory', async () => {
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
      abcGrade: 'A',
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
      abcGrade: 'C',
      anomaly: true,
      needsReorder: false,
    });
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
    });
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
