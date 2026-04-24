import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { kstMonthStart } from '../../common/kst';
import { PrismaService } from '../../prisma/prisma.service';
import {
  seedAd,
  seedOrderWithLineItems,
  setupChannelListing,
  setupMaster,
  setupProductOption,
} from '../../test-helpers/finance-seeds';
import {
  makeTestPrisma,
  OTHER_COMPANY_ID,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';
import { ActionTaskService } from '../action-task.service';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function resolveCurrentMonthContext(now: Date = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;
  return {
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };
}

function currentMonthIso(day: number, hourKst = 12, now: Date = new Date()) {
  const { from } = resolveCurrentMonthContext(now);
  return new Date(from.getTime() + (day - 1) * 24 * 60 * 60 * 1000 + hourKst * 60 * 60 * 1000)
    .toISOString();
}

describe('ActionTask.getTasks (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ActionTaskService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ActionTaskService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ActionTaskService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('seeds live warning tasks and related products for the requested tenant only', async () => {
    const ownMaster = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID,
      code: 'ACT-NEG',
      name: 'Own Negative',
    });
    const ownOption = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID,
      masterId: ownMaster.id,
      sku: 'ACT-NEG-SKU',
      costPrice: 6_000,
      commissionRate: 0.1,
    });
    const ownListing = await setupChannelListing(prisma, {
      companyId: TEST_COMPANY_ID,
      masterId: ownMaster.id,
      channel: 'coupang',
      externalId: 'ACT-NEG-EXT',
      channelName: 'Own Negative Listing',
      optionId: ownOption.id,
      vendorItemId: 'ACT-NEG-VI',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: TEST_COMPANY_ID,
      externalOrderId: 'ACT-NEG-ORD',
      orderedAt: currentMonthIso(5),
      shippingPrice: 1_000,
      lineItems: [
        {
          quantity: 1,
          totalPrice: 10_000,
          optionId: ownOption.id,
          listingOptionId: ownListing.listingOptionId,
        },
      ],
    });
    await seedAd(prisma, {
      companyId: TEST_COMPANY_ID,
      listingId: ownListing.listingId,
      date: currentMonthIso(5),
      spend: 5_000,
    });
    await prisma.inventory.create({
      data: {
        companyId: TEST_COMPANY_ID,
        optionId: ownOption.id,
        currentStock: 2,
        reorderPoint: 5,
      },
    });

    const foreignMaster = await setupMaster(prisma, {
      companyId: OTHER_COMPANY_ID,
      code: 'ACT-FGN',
      name: 'Foreign Negative',
    });
    const foreignOption = await setupProductOption(prisma, {
      companyId: OTHER_COMPANY_ID,
      masterId: foreignMaster.id,
      sku: 'ACT-FGN-SKU',
      costPrice: 6_000,
      commissionRate: 0.1,
    });
    const foreignListing = await setupChannelListing(prisma, {
      companyId: OTHER_COMPANY_ID,
      masterId: foreignMaster.id,
      channel: 'coupang',
      externalId: 'ACT-FGN-EXT',
      channelName: 'Foreign Negative Listing',
      optionId: foreignOption.id,
      vendorItemId: 'ACT-FGN-VI',
    });
    await seedOrderWithLineItems(prisma, {
      companyId: OTHER_COMPANY_ID,
      externalOrderId: 'ACT-FGN-ORD',
      orderedAt: currentMonthIso(6),
      shippingPrice: 1_000,
      lineItems: [
        {
          quantity: 1,
          totalPrice: 10_000,
          optionId: foreignOption.id,
          listingOptionId: foreignListing.listingOptionId,
        },
      ],
    });
    await seedAd(prisma, {
      companyId: OTHER_COMPANY_ID,
      listingId: foreignListing.listingId,
      date: currentMonthIso(6),
      spend: 5_000,
    });

    const result = await service.getTasks(TEST_COMPANY_ID);

    const taskKeys = result.map((task) => task.taskKey);
    expect(taskKeys).toEqual(expect.arrayContaining([
      'h-minus-ad-stop',
      'h-ad-bid',
      'h-reorder',
      'h-ad-rate',
      'analyze-deficit',
      'analyze-ad',
      'analyze-stock',
    ]));

    const minusTask = result.find((task) => task.taskKey === 'h-minus-ad-stop');
    const highAdTask = result.find((task) => task.taskKey === 'h-ad-bid');
    const reorderTask = result.find((task) => task.taskKey === 'h-reorder');

    expect(minusTask?.relatedProducts).toEqual([
      {
        id: ownMaster.id,
        name: 'Own Negative',
        metric: '이익률',
        value: '-30%',
      },
    ]);
    expect(highAdTask?.relatedProducts).toEqual([
      {
        id: ownMaster.id,
        name: 'Own Negative',
        metric: '광고비율',
        value: '50%',
      },
    ]);
    expect(reorderTask?.relatedProducts).toEqual([
      {
        id: ownMaster.id,
        name: 'Own Negative',
        metric: '재고',
        value: '2개 (기준 5)',
      },
    ]);

    const allRelatedNames = result.flatMap((task) => task.relatedProducts.map((row) => row.name));
    expect(allRelatedNames).toContain('Own Negative');
    expect(allRelatedNames).not.toContain('Foreign Negative');

    const ownStoredCount = await prisma.actionTask.count({
      where: { companyId: TEST_COMPANY_ID },
    });
    const foreignStoredCount = await prisma.actionTask.count({
      where: { companyId: OTHER_COMPANY_ID },
    });
    expect(ownStoredCount).toBeGreaterThan(0);
    expect(foreignStoredCount).toBe(0);
  });

  it('keeps reorder task seeding and related products when the live metrics array is empty', async () => {
    const stockOnlyMaster = await setupMaster(prisma, {
      companyId: TEST_COMPANY_ID,
      code: 'ACT-STOCK',
      name: 'Stock Only',
    });
    const stockOnlyOption = await setupProductOption(prisma, {
      companyId: TEST_COMPANY_ID,
      masterId: stockOnlyMaster.id,
      sku: 'ACT-STOCK-SKU',
    });
    await prisma.inventory.create({
      data: {
        companyId: TEST_COMPANY_ID,
        optionId: stockOnlyOption.id,
        currentStock: 1,
        reorderPoint: 3,
      },
    });

    const result = await service.getTasks(TEST_COMPANY_ID);

    const taskKeys = result.map((task) => task.taskKey);
    expect(taskKeys).toEqual(expect.arrayContaining([
      'h-reorder',
      'analyze-stock',
      'h-ad-csv',
      'recalc-grade',
      'analyze-ad-rules',
      'analyze-category',
    ]));
    expect(taskKeys).not.toContain('h-minus-ad-stop');
    expect(taskKeys).not.toContain('h-ad-bid');

    const reorderTask = result.find((task) => task.taskKey === 'h-reorder');
    expect(reorderTask?.relatedProducts).toEqual([
      {
        id: stockOnlyMaster.id,
        name: 'Stock Only',
        metric: '재고',
        value: '1개 (기준 3)',
      },
    ]);
  });
});
