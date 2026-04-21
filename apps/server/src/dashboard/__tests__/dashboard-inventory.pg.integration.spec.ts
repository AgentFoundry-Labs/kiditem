import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardInventoryService } from '../services/dashboard-inventory.service';
import { buildDashboardContext } from '../services/context';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';

describe('DashboardInventoryService.getSummary (PG integration) — IDOR', () => {
  let prisma: PrismaClient;
  let service: DashboardInventoryService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        DashboardInventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardInventoryService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Seed TEST + OTHER companies with distinguishable values.
   *
   * Order: MasterProduct → ProductOption (for Inventory optionId FK) → ChannelListing → Alert/PL/GradeHistory.
   * Inventory.optionId is a @unique FK referencing ProductOption, so each Inventory row needs a fresh ProductOption.
   */
  async function seedTwoCompanies() {
    const now = new Date();
    const ym = { year: now.getFullYear(), month: now.getMonth() + 1 };

    // ==================================================================
    // TEST company — 2 active products (1 A-grade, 1 B-grade)
    // ==================================================================
    const masterT1 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-T-1',
        name: 'Master T1',
        category: 'Toy',
        optionCounter: 1,
        abcGrade: 'A',
        isDeleted: false,
      },
    });
    const masterT2 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-T-2',
        name: 'Master T2',
        category: 'Toy',
        optionCounter: 1,
        abcGrade: 'B',
        isDeleted: false,
      },
    });

    const optionT1 = await prisma.productOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterT1.id,
        sku: 'SKU-T-1',
      },
    });

    await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterT1.id,
        channel: 'coupang',
        externalId: 'L-T-1',
      },
    });

    // TEST inventory — 1 row stock > 0, above reorder point (no needReorder)
    await prisma.inventory.create({
      data: {
        companyId: TEST_COMPANY_ID,
        optionId: optionT1.id,
        currentStock: 10,
        reorderPoint: 5,
      },
    });

    // TEST alert — 1 unread
    await prisma.alert.create({
      data: {
        companyId: TEST_COMPANY_ID,
        type: 'inventory',
        severity: 'medium',
        title: 'Test alert',
        message: 'test',
        targetType: 'master',
        targetId: masterT1.id,
        isRead: false,
      },
    });

    // TEST profit-loss — positive netProfit (no minusProduct)
    const listingT = await prisma.channelListing.findFirstOrThrow({
      where: { companyId: TEST_COMPANY_ID, externalId: 'L-T-1' },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingT.id,
        year: ym.year,
        month: ym.month,
        revenue: 100_000,
        netProfit: 30_000,
      },
    });

    // ==================================================================
    // OTHER company — 5 products (3 A-grade, 2 B-grade) + sentinel data
    // ==================================================================
    for (let i = 1; i <= 5; i++) {
      const masterO = await prisma.masterProduct.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          code: `M-O-${i}`,
          name: `Master O${i}`,
          category: 'Toy',
          optionCounter: 1,
          abcGrade: i <= 3 ? 'A' : 'B',
          isDeleted: false,
        },
      });

      const optionO = await prisma.productOption.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          masterId: masterO.id,
          sku: `SKU-O-${i}`,
        },
      });

      await prisma.channelListing.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          masterId: masterO.id,
          channel: 'coupang',
          externalId: `L-O-${i}`,
        },
      });

      // OTHER inventory — 5 rows stock > 0, BELOW reorder point (sentinel needReorder count)
      await prisma.inventory.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          optionId: optionO.id,
          currentStock: 1, // < reorderPoint(100) → needReorder sentinel
          reorderPoint: 100,
        },
      });
    }

    // OTHER alerts — 3 unread (sentinel: more than TEST has)
    for (let i = 1; i <= 3; i++) {
      await prisma.alert.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          type: 'inventory',
          severity: 'high',
          title: `OTHER alert ${i}`,
          message: 'other',
          targetType: 'master',
          targetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          isRead: false,
        },
      });
    }

    // OTHER profit-loss — negative netProfit (sentinel minusProduct)
    const listingO1 = await prisma.channelListing.findFirstOrThrow({
      where: { companyId: OTHER_COMPANY_ID, externalId: 'L-O-1' },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        listingId: listingO1.id,
        year: ym.year,
        month: ym.month,
        revenue: IDOR_SENTINEL,
        netProfit: -IDOR_SENTINEL, // negative = minusProduct sentinel
      },
    });
  }

  it('TEST sees only TEST companies — 2 products, 1 A-grade, 1 unread alert', async () => {
    await seedTwoCompanies();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    // TEST has 2 active products (not 7 = TEST 2 + OTHER 5)
    expect(result.totalProducts).toBe(2);

    // Grade count — TEST 1A + 1B
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
    // If leaked: A would be 4 (TEST 1 + OTHER 3), B would be 3 (TEST 1 + OTHER 2)
    expect(result.gradeCount.A).not.toBe(4);

    // Alerts — exactly 1 TEST alert
    expect(result.alerts.length).toBe(1);
    expect(result.alerts[0].title).toBe('Test alert');

    // warnings.minusProducts — TEST pl has netProfit=30_000 (positive), so 0
    // If leaked: OTHER has netProfit=-IDOR_SENTINEL → 1
    expect(result.warnings.minusProducts).toBe(0);
  });

  it('OTHER sees only OTHER — 5 products, 3 A-grade, 3 unread alerts, 1 minusProduct sentinel', async () => {
    await seedTwoCompanies();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, OTHER_COMPANY_ID);

    expect(result.totalProducts).toBe(5);
    expect(result.gradeCount.A).toBe(3);
    expect(result.gradeCount.B).toBe(2);
    expect(result.alerts.length).toBe(3);

    // minusProduct from OTHER's -IDOR_SENTINEL profit-loss
    expect(result.warnings.minusProducts).toBe(1);
  });

  it('fresh company returns empty summary', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    expect(result.totalProducts).toBe(0);
    expect(result.alerts.length).toBe(0);
    expect(result.warnings.minusProducts).toBe(0);
    expect(result.warnings.needReorder).toBe(0);
  });

  it('needReorder from TEST inventory only — does not include OTHER 5 rows', async () => {
    await seedTwoCompanies();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_COMPANY_ID);

    // TEST has 1 inventory row with currentStock(10) > reorderPoint(5) — 0 needs reorder.
    // OTHER has 5 rows all with stock(1) < reorderPoint(100) — must not leak.
    expect(result.warnings.needReorder).toBe(0);

    // Cross-check OTHER sees correct needReorder count
    const otherResult = await service.getSummary(ctx, OTHER_COMPANY_ID);
    expect(otherResult.warnings.needReorder).toBe(5);
  });
});
