import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardInventoryService } from '../application/service/dashboard-inventory.service';
import { buildDashboardContext } from '../domain/context';
import { DashboardInventoryRepositoryAdapter } from '../adapter/out/repository/dashboard-inventory.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-inventory.repository.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../../test-helpers/finance-seeds';

describe('DashboardInventoryService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardInventoryService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardInventoryService,
        DashboardInventoryRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
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

  function midMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 15, 3, 0, 0);
  }

  /**
   * Seed a basic 2-operating-product + 1-alert layout for TEST,
   * and 5-operating-product + 3-alert for OTHER (no order data).
   * Used by T1/T2/T3 (IDOR cases that don't touch warnings).
   */
  async function seedBaseStructure() {
    const masterT1 = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-1', name: 'Master T1', abcGrade: 'A',
    });
    await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-2', name: 'Master T2', abcGrade: 'B',
    });
    await prisma.alert.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, type: 'inventory', severity: 'medium',
        title: 'Test alert', message: 'test',
        targetType: 'master', targetId: masterT1.id, isRead: false,
      },
    });

    for (let i = 1; i <= 5; i++) {
      await setupMaster(prisma, {
        organizationId: OTHER_ORGANIZATION_ID, code: `M-O-${i}`, name: `Master O${i}`,
        abcGrade: i <= 3 ? 'A' : 'B',
      });
    }
    for (let i = 1; i <= 3; i++) {
      await prisma.alert.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID, type: 'inventory', severity: 'high',
          title: `OTHER alert ${i}`, message: 'other',
          targetType: 'master', targetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', isRead: false,
        },
      });
    }
  }

  it('T1: TEST sees only TEST listings, alerts, and grades', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(2);
    expect(result.channelLinkedProducts).toBe(0);
    expect(result.channelUnlinkedProducts).toBe(2);
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
    expect(result.alerts.length).toBe(1);
    expect(result.alerts[0].title).toBe('Test alert');
  });

  it('separates active products from channel-linked products', async () => {
    const masterLinked = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LINKED', name: 'Linked Master', abcGrade: 'A',
    });
    const optionLinked = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId: masterLinked.id, sku: 'SKU-T-LINKED',
    });
    await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: masterLinked.id,
      channel: 'coupang',
      externalId: 'EXT-T-LINKED',
      optionId: optionLinked.id,
      externalOptionId: 'VI-T-LINKED',
    });
    await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-ONLY', name: 'Inventory Only Master', abcGrade: 'B',
    });
    const otherMaster = await setupMaster(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-LINKED', name: 'Other Linked Master', abcGrade: 'A',
    });
    const otherOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: otherMaster.id, sku: 'SKU-O-LINKED',
    });
    await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      masterId: otherMaster.id,
      channel: 'coupang',
      externalId: 'EXT-O-LINKED',
      optionId: otherOption.id,
      externalOptionId: 'VI-O-LINKED',
    });

    const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(2);
    expect(result.channelLinkedProducts).toBe(1);
    expect(result.channelUnlinkedProducts).toBe(1);
    expect(result.gradeCount.A).toBe(1);
    expect(result.gradeCount.B).toBe(1);
  });

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedBaseStructure();
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, OTHER_ORGANIZATION_ID);

    expect(result.totalProducts).toBe(5);
    expect(result.channelLinkedProducts).toBe(0);
    expect(result.channelUnlinkedProducts).toBe(5);
    expect(result.gradeCount.A).toBe(3);
    expect(result.gradeCount.B).toBe(2);
    expect(result.alerts.length).toBe(3);
  });

  it('T3: fresh organization → zero-valued summary', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);
    expect(result.totalProducts).toBe(0);
    expect(result.alerts.length).toBe(0);
    expect(result.warnings.minusProducts).toBe(0);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
    expect(result.warnings.outOfStockSkus).toBe(0);
    expect(result.warnings.mappingAttentionSkus).toBe(0);
  });

  it('T4: minusProduct — seeded loss order surfaces in warnings.minusProducts', async () => {
    // Loss order: revenue 50_000, costPrice 80_000, commission 10%, shipping 5_000
    // netProfit = 50_000 - 80_000 - 5_000 - 5_000 - 0 - 0 = -40_000  → minus
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'M-T-LOSS', name: 'Loss Master', abcGrade: 'A',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: 'SKU-T-LOSS', costPrice: 80_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: 'EXT-T-LOSS',
      optionId, externalOptionId: 'VI-T-LOSS',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'INV-T-LOSS-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 5_000,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(0);
    expect(result.warnings.highAdProducts).toBe(0);
  });

  it('T5: 3 warnings — minus + lowProfit + highAd seeded on 3 listings', async () => {
    // Listing A: minus (cost > revenue)
    const a = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-A', name: 'A', abcGrade: 'A' });
    const aOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, sku: 'SKU-T-A', costPrice: 80_000, commissionRate: 0.1 });
    const aList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: a.id, channel: 'coupang', externalId: 'EXT-T-A', optionId: aOpt.id, externalOptionId: 'VI-T-A' });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-A-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 50_000, optionId: aOpt.id, listingOptionId: aList.listingOptionId }],
    });

    // Listing B: lowProfit (profitRate ≈ 2%)
    // Aim: revenue=100_000, costPrice=85_000, commission 0.10×100_000=10_000, shipping 0, ad 0, other 0
    //   netProfit = 100_000 - 85_000 - 10_000 - 0 - 0 - 0 = 5_000 → 5.0% (NOT lowProfit; rate must be <=3)
    // Adjust: costPrice=88_000 → netProfit = 100_000 - 88_000 - 10_000 = 2_000 → 2.0% (lowProfit ✓)
    const b = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-B', name: 'B', abcGrade: 'A' });
    const bOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, sku: 'SKU-T-B', costPrice: 88_000, commissionRate: 0.1 });
    const bList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: b.id, channel: 'coupang', externalId: 'EXT-T-B', optionId: bOpt.id, externalOptionId: 'VI-T-B' });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-B-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: bOpt.id, listingOptionId: bList.listingOptionId }],
    });

    // Listing C: highAd (revenue>0, adCost > 15% of revenue)
    // revenue=100_000, adCost=20_000 → adRate=20% (>15)
    const c = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-T-C', name: 'C', abcGrade: 'A' });
    const cOpt = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: c.id, sku: 'SKU-T-C', costPrice: 0, commissionRate: 0 });
    const cList = await setupChannelListing(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: c.id, channel: 'coupang', externalId: 'EXT-T-C', optionId: cOpt.id, externalOptionId: 'VI-T-C' });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INV-T-C-1', orderedAt: midMonth().toISOString(),
      shippingPrice: 0, lineItems: [{ quantity: 1, totalPrice: 100_000, optionId: cOpt.id, listingOptionId: cList.listingOptionId }],
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: cList.listingId,
      date: midMonth().toISOString().slice(0, 10), spend: 20_000,
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.warnings.minusProducts).toBe(1);
    expect(result.warnings.lowProfitProducts).toBe(1);
    expect(result.warnings.highAdProducts).toBe(1);
  });
});
