import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { kstMonthStart } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AutomationModule } from '../../../automation.module';
import {
  seedAd,
  seedOrderWithLineItems,
  setupChannelListing,
  setupMaster,
  setupProductOption,
} from '../../../../test-helpers/finance-seeds';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../test-helpers/real-prisma';
import { ActionBoardService } from '../action-board.service';

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

describe('ActionBoardService.getTasks (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ActionBoardService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), AutomationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    service = moduleRef.get(ActionBoardService, { strict: false });
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
      organizationId: TEST_ORGANIZATION_ID,
      code: 'ACT-NEG',
      name: 'Own Negative',
    });
    const ownOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: ownMaster.id,
      sku: 'ACT-NEG-SKU',
      costPrice: 6_000,
      commissionRate: 0.1,
    });
    const ownListing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: ownMaster.id,
      channel: 'coupang',
      externalId: 'ACT-NEG-EXT',
      channelName: 'Own Negative Listing',
      optionId: ownOption.id,
      externalOptionId: 'ACT-NEG-VI',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
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
      organizationId: TEST_ORGANIZATION_ID,
      listingId: ownListing.listingId,
      date: currentMonthIso(5),
      spend: 5_000,
    });
    await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'ACT-OWN-ZERO',
        name: 'Own zero stock',
        currentStock: 0,
      },
    });

    const foreignMaster = await setupMaster(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      code: 'ACT-FGN',
      name: 'Foreign Negative',
    });
    const foreignOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      masterId: foreignMaster.id,
      sku: 'ACT-FGN-SKU',
      costPrice: 6_000,
      commissionRate: 0.1,
    });
    const foreignListing = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      masterId: foreignMaster.id,
      channel: 'coupang',
      externalId: 'ACT-FGN-EXT',
      channelName: 'Foreign Negative Listing',
      optionId: foreignOption.id,
      externalOptionId: 'ACT-FGN-VI',
    });
    await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'ACT-FGN-ZERO',
        name: 'Foreign zero stock',
        currentStock: 0,
      },
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
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
      organizationId: OTHER_ORGANIZATION_ID,
      listingId: foreignListing.listingId,
      date: currentMonthIso(6),
      spend: 5_000,
    });

    const result = await service.getTasks(TEST_ORGANIZATION_ID);

    const taskKeys = result.map((task) => task.taskKey);
    expect(taskKeys).toEqual(expect.arrayContaining([
      'h-minus-ad-stop',
      'h-ad-bid',
      'h-zero-stock',
      'h-ad-rate',
      'analyze-deficit',
      'analyze-ad',
    ]));

    const minusTask = result.find((task) => task.taskKey === 'h-minus-ad-stop');
    const highAdTask = result.find((task) => task.taskKey === 'h-ad-bid');
    const zeroStockTask = result.find((task) => task.taskKey === 'h-zero-stock');

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
    expect(zeroStockTask?.relatedProducts).toEqual([]);
    expect(taskKeys).not.toContain('h-mapping-attention');

    const allRelatedNames = result.flatMap((task) => task.relatedProducts.map((row) => row.name));
    expect(allRelatedNames).toContain('Own Negative');
    expect(allRelatedNames).not.toContain('Foreign Negative');

    const ownStoredCount = await prisma.actionTask.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    const foreignStoredCount = await prisma.actionTask.count({
      where: { organizationId: OTHER_ORGANIZATION_ID },
    });
    expect(ownStoredCount).toBeGreaterThan(0);
    expect(foreignStoredCount).toBe(0);
  });

  it('keeps the zero-stock review link when the live metrics array is empty', async () => {
    await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'ACT-STOCK-ONLY',
        name: 'Stock Only',
        currentStock: 0,
      },
    });

    const result = await service.getTasks(TEST_ORGANIZATION_ID);

    const taskKeys = result.map((task) => task.taskKey);
    expect(taskKeys).toEqual(expect.arrayContaining([
      'h-zero-stock',
      'h-ad-csv',
      'analyze-ad-rules',
      'analyze-category',
    ]));
    expect(taskKeys).not.toContain('recalc-grade');
    expect(taskKeys).not.toContain('h-minus-ad-stop');
    expect(taskKeys).not.toContain('h-ad-bid');

    expect(result.find((task) => task.taskKey === 'h-zero-stock')?.relatedProducts).toEqual([]);
    expect(taskKeys).not.toEqual(expect.arrayContaining(['h-reorder', 'analyze-stock']));
  });
});
