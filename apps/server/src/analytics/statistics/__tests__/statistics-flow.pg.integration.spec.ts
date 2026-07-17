import { afterEach, beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { StatisticsService } from '../statistics.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IDOR_SENTINEL,
  OTHER_ORGANIZATION_ID,
  TEST_ORGANIZATION_ID,
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
} from '../../../test-helpers/real-prisma';
import {
  seedAd,
  seedOrderWithLineItems,
  setupChannelListing,
  setupMaster,
  setupProductOption,
} from '../../../test-helpers/finance-seeds';

describe('Statistics flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: StatisticsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(StatisticsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function seedStatisticsFixture(organizationId = TEST_ORGANIZATION_ID) {
    const prefix = organizationId === TEST_ORGANIZATION_ID ? 'TEST' : 'OTHER';

    const { id: masterM1 } = await setupMaster(prisma, {
      organizationId,
      code: `${prefix}-M-001`,
      name: `${prefix} Master M1`,
      category: '유아용품',
      abcGrade: 'A',
      thumbnailUrl: 'https://cdn/m1.jpg',
    });
    const { id: masterM2 } = await setupMaster(prisma, {
      organizationId,
      code: `${prefix}-M-002`,
      name: `${prefix} Master M2`,
      category: '완구',
      abcGrade: 'B',
    });

    const { id: optM1a } = await setupProductOption(prisma, {
      organizationId,
      masterId: masterM1,
      sku: `${prefix}-SKU-M1A`,
      costPrice: 5_000,
      commissionRate: 0.1,
    });
    const { id: optM1b } = await setupProductOption(prisma, {
      organizationId,
      masterId: masterM1,
      sku: `${prefix}-SKU-M1B`,
      costPrice: 4_000,
      commissionRate: 0.1,
    });
    const { id: optM2a } = await setupProductOption(prisma, {
      organizationId,
      masterId: masterM2,
      sku: `${prefix}-SKU-M2A`,
      costPrice: 2_000,
      commissionRate: 0.1,
    });

    const listingL1 = await setupChannelListing(prisma, {
      organizationId,
      masterId: masterM1,
      channel: 'coupang',
      externalId: `${prefix}-EXT-L1`,
      channelName: `${prefix} L1`,
      optionId: optM1a,
      externalOptionId: `${prefix}-VI-L1A`,
    });
    const listingL1b = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listingL1.listingId,
        productVariantId: optM1b,
        externalOptionId: `${prefix}-VI-L1B`,
        costPriceOverride: 4_000,
        commissionRate: 0.1,
      },
      select: { id: true },
    });
    await prisma.channelListingOption.update({
      where: { id: listingL1.listingOptionId },
      data: { costPriceOverride: 5_000 },
    });
    const listingL2 = await setupChannelListing(prisma, {
      organizationId,
      masterId: masterM2,
      channel: 'coupang',
      externalId: `${prefix}-EXT-L2`,
      channelName: `${prefix} L2`,
      optionId: optM2a,
      externalOptionId: `${prefix}-VI-L2A`,
    });

    const o1 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-1`,
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 2, totalPrice: 20_000, optionId: optM1a, listingOptionId: listingL1.listingOptionId },
        { quantity: 1, totalPrice: 12_000, optionId: optM1b, listingOptionId: listingL1b.id },
      ],
    });
    await prisma.order.update({ where: { id: o1 }, data: { receiverName: 'A' } });

    const o2 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-2`,
      orderedAt: '2026-04-12T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 3, totalPrice: 15_000, optionId: optM2a, listingOptionId: listingL2.listingOptionId },
      ],
    });
    await prisma.order.update({ where: { id: o2 }, data: { receiverName: 'B' } });

    const o3 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-3`,
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 1, totalPrice: 5_000, optionId: optM2a, listingOptionId: listingL2.listingOptionId },
      ],
    });
    await prisma.order.update({ where: { id: o3 }, data: { receiverName: 'A' } });

    const o4 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-4`,
      orderedAt: '2026-04-18T03:00:00Z',
      shippingPrice: 0,
      status: 'cancelled',
      lineItems: [
        { quantity: 5, totalPrice: 50_000, optionId: optM1a, listingOptionId: listingL1.listingOptionId },
      ],
    });
    await prisma.order.update({ where: { id: o4 }, data: { receiverName: 'C' } });

    const o5 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-5`,
      orderedAt: '2026-04-30T15:30:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 1, totalPrice: 9_000, optionId: optM1a, listingOptionId: listingL1.listingOptionId },
      ],
    });
    await prisma.order.update({ where: { id: o5 }, data: { receiverName: 'D' } });

    await seedAd(prisma, {
      organizationId,
      listingId: listingL1.listingId,
      date: '2026-04-15',
      spend: 3_000,
    });
    await seedAd(prisma, {
      organizationId,
      listingId: listingL2.listingId,
      date: '2026-04-15',
      spend: 1_000,
    });

    return {
      masterM1,
      masterM2,
      listingL1: listingL1.listingId,
      listingL2: listingL2.listingId,
    };
  }

  it('overview uses live listing metrics plus distinct accepted-order count', async () => {
    await seedStatisticsFixture();

    const result = await service.overview(TEST_ORGANIZATION_ID, '2026-04');

    expect(result).toEqual({
      totalRevenue: 52_000,
      totalOrders: 3,
      totalProfit: 20_800,
      avgMargin: 0.4,
      totalProducts: 2,
    });
  });

  it('products hydrates master metadata and keeps ratio-based profitRate semantics', async () => {
    const { masterM1, masterM2, listingL1, listingL2 } = await seedStatisticsFixture();

    const result = await service.products(TEST_ORGANIZATION_ID, '2026-04');

    expect(result).toEqual([
      {
        listingId: listingL1,
        externalId: 'TEST-EXT-L1',
        channelName: 'TEST L1',
        masterId: masterM1,
        masterCode: 'TEST-M-001',
        productName: 'TEST Master M1',
        category: '유아용품',
        grade: 'A',
        thumbnailUrl: 'https://cdn/m1.jpg',
        totalRevenue: 32_000,
        netProfit: 11_800,
        orderCount: 1,
        profitRate: 0.3688,
        margin: 0.3688,
      },
      {
        listingId: listingL2,
        externalId: 'TEST-EXT-L2',
        channelName: 'TEST L2',
        masterId: masterM2,
        masterCode: 'TEST-M-002',
        productName: 'TEST Master M2',
        category: '완구',
        grade: 'B',
        thumbnailUrl: null,
        totalRevenue: 20_000,
        netProfit: 9_000,
        orderCount: 2,
        profitRate: 0.45,
        margin: 0.45,
      },
    ]);
  });

  it('categories and grades reduce live metrics instead of snapshot rows', async () => {
    await seedStatisticsFixture();

    const [categories, grades] = await Promise.all([
      service.categories(TEST_ORGANIZATION_ID, '2026-04'),
      service.grades(TEST_ORGANIZATION_ID, '2026-04'),
    ]);

    expect(categories).toEqual([
      {
        category: '유아용품',
        name: '유아용품',
        revenue: 32_000,
        orders: 1,
        profit: 11_800,
        count: 1,
      },
      {
        category: '완구',
        name: '완구',
        revenue: 20_000,
        orders: 2,
        profit: 9_000,
        count: 2,
      },
    ]);
    expect(grades).toEqual([
      {
        grade: 'A',
        revenue: 32_000,
        profit: 11_800,
        count: 1,
        productCount: 1,
        adCost: 3_000,
      },
      {
        grade: 'B',
        revenue: 20_000,
        profit: 9_000,
        count: 1,
        productCount: 1,
        adCost: 1_000,
      },
    ]);
  });

  it('pareto sorts by live revenue and keeps grade distribution semantics', async () => {
    const { listingL1, listingL2 } = await seedStatisticsFixture();

    const result = await service.pareto(TEST_ORGANIZATION_ID, '2026-04');

    expect(result.totalRevenue).toBe(52_000);
    expect(result.gradeDistribution).toEqual({ A: 1, B: 1, C: 0 });
    expect(result.mismatchCount).toBe(1);
    expect(result.data).toEqual([
      {
        id: listingL1,
        rank: 1,
        name: 'TEST Master M1',
        currentGrade: 'A',
        suggestedGrade: 'A',
        gradeMatch: true,
        revenue: 32_000,
        revenuePercent: 61.5,
        cumulativePercent: 61.5,
      },
      {
        id: listingL2,
        rank: 2,
        name: 'TEST Master M2',
        currentGrade: 'B',
        suggestedGrade: 'C',
        gradeMatch: false,
        revenue: 20_000,
        revenuePercent: 38.5,
        cumulativePercent: 100,
      },
    ]);
  });

  it('delivery still aggregates quantity from order line items and excludes cancelled orders', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-19T00:00:00.000Z'));
    await seedStatisticsFixture();

    const result = await service.delivery(TEST_ORGANIZATION_ID, '2026-04');

    expect(result.totalShipments).toBe(0);
    expect(result.avgDeliveryDays).toBe(0);
    expect(result.courierDistribution).toEqual([]);
    expect(result.daily).toHaveLength(30);
    expect(result.daily.find((row) => row.date === '2026-04-10')).toEqual({
      date: '2026-04-10',
      count: 0,
      orders: 1,
      revenue: 32_000,
      qty: 3,
    });
    expect(result.daily.find((row) => row.date === '2026-04-12')).toEqual({
      date: '2026-04-12',
      count: 0,
      orders: 1,
      revenue: 15_000,
      qty: 3,
    });
    expect(result.daily.find((row) => row.date === '2026-04-15')).toEqual({
      date: '2026-04-15',
      count: 0,
      orders: 1,
      revenue: 5_000,
      qty: 1,
    });
    expect(result.daily.reduce((sum, row) => sum + row.qty, 0)).toBe(7);
  });

  it('repurchase keeps receiver-level and listing-level behavior on current schema', async () => {
    const { listingL1, listingL2 } = await seedStatisticsFixture();

    const result = await service.repurchase(TEST_ORGANIZATION_ID, '2026-04');

    expect(result).toEqual({
      totalCustomers: 2,
      repeatCount: 1,
      repurchaseRate: 0.5,
      totalOrders: 3,
      repeatProducts: [
        {
          masterId: listingL2,
          productName: 'TEST Master M2',
          category: '완구',
          orderCount: 2,
        },
      ],
      repeatCustomers: [
        {
          name: 'A',
          count: 2,
          totalAmount: 37_000,
          lastOrder: new Date('2026-04-15T03:00:00.000Z'),
        },
      ],
    });
    expect(result.repeatProducts.map((item) => item.masterId)).not.toContain(listingL1);
  });

  it('repurchase includes an imported listing without a component mapping', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Active Wing account',
        externalAccountId: 'WING-ACCOUNT-REPURCHASE',
        status: 'active',
      },
      select: { id: true },
    });
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: account.id,
        fileName: 'wing-products-repurchase.xlsx',
        fileHash: 'wing-products-repurchase',
        status: 'completed',
        rowCount: 1,
        importedAt: new Date('2026-04-14T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'EXT-UNLINKED-REPURCHASE',
        channelName: 'Wing import only',
        status: 'active',
        lastImportRunId: importRun.id,
      },
      select: { id: true },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'VI-UNLINKED-REPURCHASE',
        lastImportRunId: importRun.id,
      },
      select: { id: true },
    });

    for (const [index, receiverName] of ['A', 'B'].entries()) {
      const order = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: account.id,
          externalOrderId: `REPURCHASE-UNLINKED-${index + 1}`,
          orderedAt: new Date(`2026-04-${15 + index}T03:00:00.000Z`),
          status: 'accepted',
          shippingPrice: 0,
          totalPrice: 10_000,
          receiverName,
        },
        select: { id: true },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: order.id,
          listingOptionId: listingOption.id,
          productName: 'Wing import only',
          quantity: 1,
          unitPrice: 10_000,
          totalPrice: 10_000,
          externalLineId: `LI-UNLINKED-REPURCHASE-${index + 1}`,
        },
      });
    }

    const result = await service.repurchase(TEST_ORGANIZATION_ID, '2026-04');

    expect(result.repeatProducts).toEqual([
      {
        masterId: listing.id,
        productName: 'Wing import only',
        category: null,
        orderCount: 2,
      },
    ]);
  });

  it('never leaks other-organization live metrics into the requested tenant', async () => {
    await seedStatisticsFixture(TEST_ORGANIZATION_ID);
    const other = await seedStatisticsFixture(OTHER_ORGANIZATION_ID);
    await seedAd(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      listingId: other.listingL1,
      date: '2026-04-16',
      spend: IDOR_SENTINEL,
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'OTHER-SENTINEL',
      orderedAt: '2026-04-16T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        {
          quantity: 1,
          totalPrice: IDOR_SENTINEL,
          optionId: await prisma.channelListingOption.findFirstOrThrow({
            where: { organizationId: OTHER_ORGANIZATION_ID, listingId: other.listingL1 },
            select: { id: true },
          }).then((row) => row.id),
          listingOptionId: await prisma.channelListingOption.findFirstOrThrow({
            where: { organizationId: OTHER_ORGANIZATION_ID, listingId: other.listingL1 },
            select: { id: true },
          }).then((row) => row.id),
        },
      ],
    });

    const result = await service.products(TEST_ORGANIZATION_ID, '2026-04');

    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row.totalRevenue).not.toBe(IDOR_SENTINEL);
      expect(row.netProfit).not.toBe(IDOR_SENTINEL);
    }
  });
});
