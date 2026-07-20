import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SellpiaSalesService } from '../sellpia-sales.service';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../domain/snapshot-coverage';
import {
  IDOR_SENTINEL,
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { SellpiaSalesIngestBodyDto } from '../dto/sellpia-sales.dto';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { WingTrafficAggregationRepositoryPort } from '../../dashboard/application/port/out/repository/wing-traffic-aggregation.repository.port';

const RANGE_START = '2026-04-17';
const RANGE_DATES = calendarDates(RANGE_START, 93);
const RANGE_END = RANGE_DATES.at(-1)!;
const CAPTURE_1 = '2026-07-18T01:00:00.000Z';
const CAPTURE_2 = '2026-07-18T02:00:00.000Z';
const CAPTURE_3 = '2026-07-18T03:00:00.000Z';
const CAPTURE_4 = '2026-07-18T04:00:00.000Z';

describe('SellpiaSalesService ingest (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SellpiaSalesService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = makeService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('stores a 93-day multi-seller snapshot without the former five-second transaction expiry', async () => {
    const payload = largePayload(20, 100);

    await expect(service.ingest(TEST_ORGANIZATION_ID, payload)).resolves.toEqual({
      upserted: 20 * RANGE_DATES.length,
      businessDates: RANGE_DATES,
      sellerCount: 20,
    });

    const [factCount, coverageCount, firstFact, lastFact] = await Promise.all([
      prisma.sellpiaSalesDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellerId: { not: SELLPIA_SALES_COVERAGE_SELLER_ID },
        },
      }),
      prisma.sellpiaSalesDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        },
      }),
      prisma.sellpiaSalesDailySnapshot.findUnique({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: TEST_ORGANIZATION_ID,
            businessDate: dbDate(RANGE_START),
            sellerId: 'seller-01',
          },
        },
      }),
      prisma.sellpiaSalesDailySnapshot.findUnique({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: TEST_ORGANIZATION_ID,
            businessDate: dbDate(RANGE_END),
            sellerId: 'seller-20',
          },
        },
      }),
    ]);

    expect(factCount).toBe(20 * RANGE_DATES.length);
    expect(coverageCount).toBe(RANGE_DATES.length);
    expect(firstFact).toMatchObject({
      sellerName: '쿠팡-직배송',
      channelGroup: 'rocket',
      revenueKrw: 100,
      qty: 1,
      costKrw: 50,
    });
    expect(lastFact).toMatchObject({
      sellerName: '판매처 20',
      channelGroup: 'others',
      revenueKrw: 2_092,
      qty: 20,
      costKrw: 1_046,
    });
  });

  it('rolls back an interrupted range replacement, then removes stale rows on a successful replay', async () => {
    const initial: SellpiaSalesIngestBodyDto = {
      range: { from: RANGE_START, to: RANGE_END },
      capturedAt: CAPTURE_1,
      sellers: [
        seller('kept', '쿠팡-직배송', [
          day(RANGE_START, 1_000, 10, 400),
          day(RANGE_END, 2_000, 20, 800),
        ]),
        seller('stale', '삭제될 판매처', [day(RANGE_START, 9_999, 99, 4_000)]),
      ],
    };
    await service.ingest(TEST_ORGANIZATION_ID, initial);

    const failingService = makeService(prismaWithSecondCreateManyFailure(prisma));
    await expect(
      failingService.ingest(TEST_ORGANIZATION_ID, largePayload(11, 500)),
    ).rejects.toThrow('injected second createMany failure');

    const afterRollback = await prisma.sellpiaSalesDailySnapshot.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: [{ sellerId: 'asc' }, { businessDate: 'asc' }],
    });
    expect(afterRollback).toHaveLength(RANGE_DATES.length + 3);
    expect(afterRollback).toContainEqual(
      expect.objectContaining({
        sellerId: 'stale',
        businessDate: dbDate(RANGE_START),
        revenueKrw: 9_999,
      }),
    );
    expect(afterRollback).not.toContainEqual(
      expect.objectContaining({ sellerId: 'seller-01', revenueKrw: 500 }),
    );

    const replay: SellpiaSalesIngestBodyDto = {
      range: { from: RANGE_START, to: RANGE_END },
      capturedAt: CAPTURE_3,
      sellers: [
        seller('kept', '쿠팡-직배송', [day(RANGE_START, 7_000, 70, 2_800)]),
      ],
    };
    await service.ingest(TEST_ORGANIZATION_ID, replay);

    const afterReplay = await prisma.sellpiaSalesDailySnapshot.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: [{ sellerId: 'asc' }, { businessDate: 'asc' }],
    });
    expect(afterReplay).toHaveLength(RANGE_DATES.length + 1);
    expect(afterReplay.filter((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)).toHaveLength(
      RANGE_DATES.length,
    );
    expect(afterReplay).toContainEqual(
      expect.objectContaining({
        sellerId: 'kept',
        businessDate: dbDate(RANGE_START),
        revenueKrw: 7_000,
        qty: 70,
        costKrw: 2_800,
      }),
    );
    expect(afterReplay.some((row) => row.sellerId === 'stale')).toBe(false);
    expect(
      afterReplay.some(
        (row) => row.sellerId === 'kept' && row.businessDate.getTime() === dbDate(RANGE_END).getTime(),
      ),
    ).toBe(false);
  });

  it('replaces only the requested organization range and preserves the other tenant', async () => {
    const range = { from: '2026-07-17', to: '2026-07-18' };
    await service.ingest(OTHER_ORGANIZATION_ID, {
      range,
      capturedAt: CAPTURE_1,
      sellers: [
        seller('foreign-sentinel', '다른 조직 판매처', [
          day(range.from, IDOR_SENTINEL, 999, 123_456),
        ]),
      ],
    });
    await service.ingest(TEST_ORGANIZATION_ID, {
      range,
      capturedAt: CAPTURE_1,
      sellers: [seller('own-old', '기존 판매처', [day(range.from, 1_000, 10, 500)])],
    });

    await service.ingest(TEST_ORGANIZATION_ID, {
      range,
      capturedAt: CAPTURE_2,
      sellers: [seller('own-new', '새 판매처', [day(range.to, 2_000, 20, 800)])],
    });

    const [ownRows, foreignRows] = await Promise.all([
      prisma.sellpiaSalesDailySnapshot.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: [{ sellerId: 'asc' }, { businessDate: 'asc' }],
      }),
      prisma.sellpiaSalesDailySnapshot.findMany({
        where: { organizationId: OTHER_ORGANIZATION_ID },
        orderBy: [{ sellerId: 'asc' }, { businessDate: 'asc' }],
      }),
    ]);

    expect(ownRows.some((row) => row.sellerId === 'own-old')).toBe(false);
    expect(ownRows).toContainEqual(
      expect.objectContaining({
        sellerId: 'own-new',
        businessDate: dbDate(range.to),
        revenueKrw: 2_000,
      }),
    );
    expect(ownRows.filter((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)).toHaveLength(2);

    expect(foreignRows).toHaveLength(3); // foreign fact + two coverage rows
    expect(foreignRows).toContainEqual(
      expect.objectContaining({
        sellerId: 'foreign-sentinel',
        businessDate: dbDate(range.from),
        revenueKrw: IDOR_SENTINEL,
      }),
    );
    expect(foreignRows.filter((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)).toHaveLength(2);
  });

  it('preserves a newer live snapshot when an older extension cache arrives later', async () => {
    const range = { from: '2026-07-18', to: '2026-07-18' };
    await service.ingest(TEST_ORGANIZATION_ID, {
      range,
      sellers: [seller('mall', '스마트스토어', [day(range.from, 2_000, 2, 800)])],
      capturedAt: '2026-07-18T03:00:00.000Z',
    });

    await service.ingest(TEST_ORGANIZATION_ID, {
      range,
      sellers: [seller('mall', '스마트스토어', [day(range.from, 1_000, 1, 400)])],
      capturedAt: '2026-07-18T02:00:00.000Z',
    });

    await expect(
      prisma.sellpiaSalesDailySnapshot.findUnique({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: TEST_ORGANIZATION_ID,
            businessDate: dbDate(range.from),
            sellerId: 'mall',
          },
        },
      }),
    ).resolves.toMatchObject({
      revenueKrw: 2_000,
      qty: 2,
      costKrw: 800,
      capturedAt: new Date('2026-07-18T03:00:00.000Z'),
    });
  });

  it('protects a newer legacy fact without a coverage row and self-heals on a fresher collection', async () => {
    const date = '2026-07-18';
    await prisma.sellpiaSalesDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        businessDate: dbDate(date),
        sellerId: 'legacy-mall',
        sellerName: '기존 판매처',
        channelGroup: 'others',
        revenueKrw: 2_000,
        qty: 2,
        costKrw: 800,
        capturedAt: new Date(CAPTURE_3),
      },
    });

    const staleResult = await service.ingest(TEST_ORGANIZATION_ID, {
      range: { from: date, to: date },
      sellers: [seller('legacy-mall', '기존 판매처', [day(date, 1_000, 1, 400)])],
      capturedAt: CAPTURE_2,
    });
    expect(staleResult).toEqual({
      upserted: 0,
      businessDates: [],
      sellerCount: 1,
    });
    await expect(
      prisma.sellpiaSalesDailySnapshot.findUnique({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: TEST_ORGANIZATION_ID,
            businessDate: dbDate(date),
            sellerId: 'legacy-mall',
          },
        },
      }),
    ).resolves.toMatchObject({ revenueKrw: 2_000, capturedAt: new Date(CAPTURE_3) });
    await expect(
      prisma.sellpiaSalesDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        },
      }),
    ).resolves.toBe(0);

    await service.ingest(TEST_ORGANIZATION_ID, {
      range: { from: date, to: date },
      sellers: [seller('legacy-mall', '기존 판매처', [day(date, 3_000, 3, 1_200)])],
      capturedAt: CAPTURE_4,
    });
    await expect(
      prisma.sellpiaSalesDailySnapshot.findUnique({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: TEST_ORGANIZATION_ID,
            businessDate: dbDate(date),
            sellerId: 'legacy-mall',
          },
        },
      }),
    ).resolves.toMatchObject({ revenueKrw: 3_000, capturedAt: new Date(CAPTURE_4) });
    await expect(
      prisma.sellpiaSalesDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps a newer overlapping day while an older cache fills an uncovered day', async () => {
    await service.ingest(TEST_ORGANIZATION_ID, {
      range: { from: '2026-07-18', to: '2026-07-18' },
      sellers: [seller('mall', '스마트스토어', [day('2026-07-18', 2_000, 2, 800)])],
      capturedAt: '2026-07-18T03:00:00.000Z',
    });

    await service.ingest(TEST_ORGANIZATION_ID, {
      range: { from: '2026-07-17', to: '2026-07-18' },
      sellers: [
        seller('mall', '스마트스토어', [
          day('2026-07-17', 1_000, 1, 400),
          day('2026-07-18', 900, 1, 300),
        ]),
      ],
      capturedAt: '2026-07-18T02:00:00.000Z',
    });

    const rows = await prisma.sellpiaSalesDailySnapshot.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: [{ businessDate: 'asc' }, { sellerId: 'asc' }],
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        businessDate: dbDate('2026-07-17'),
        sellerId: 'mall',
        revenueKrw: 1_000,
        capturedAt: new Date('2026-07-18T02:00:00.000Z'),
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        businessDate: dbDate('2026-07-18'),
        sellerId: 'mall',
        revenueKrw: 2_000,
        capturedAt: new Date('2026-07-18T03:00:00.000Z'),
      }),
    );
    expect(
      rows.filter((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID),
    ).toHaveLength(2);
  });
});

function makeService(prisma: PrismaClient | PrismaService): SellpiaSalesService {
  const wingTrafficRepository = {
    aggregateCoupangAds: async () => ({
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      hasData: false,
      lastObservedAt: null,
    }),
  } as unknown as WingTrafficAggregationRepositoryPort;
  return new SellpiaSalesService(
    prisma as unknown as PrismaService,
    wingTrafficRepository,
  );
}

function largePayload(sellerCount: number, baseRevenue: number): SellpiaSalesIngestBodyDto {
  return {
    range: { from: RANGE_START, to: RANGE_END },
    capturedAt: CAPTURE_2,
    sellers: Array.from({ length: sellerCount }, (_, sellerIndex) => {
      const sellerNumber = sellerIndex + 1;
      return seller(
        `seller-${String(sellerNumber).padStart(2, '0')}`,
        sellerNumber === 1 ? '쿠팡-직배송' : `판매처 ${sellerNumber}`,
        RANGE_DATES.map((date, dateIndex) => {
          const revenue = baseRevenue + sellerIndex * 100 + dateIndex;
          return day(date, revenue, sellerNumber, Math.floor(revenue / 2));
        }),
      );
    }),
  };
}

function prismaWithSecondCreateManyFailure(prisma: PrismaClient): PrismaService {
  const wrapped = {
    $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
      prisma.$transaction(async (tx) => {
        let createManyCalls = 0;
        const sellpiaSalesDailySnapshot = {
          deleteMany: tx.sellpiaSalesDailySnapshot.deleteMany.bind(
            tx.sellpiaSalesDailySnapshot,
          ),
          groupBy: tx.sellpiaSalesDailySnapshot.groupBy.bind(
            tx.sellpiaSalesDailySnapshot,
          ),
          findMany: tx.sellpiaSalesDailySnapshot.findMany.bind(
            tx.sellpiaSalesDailySnapshot,
          ),
          createMany: async (...args: Parameters<typeof tx.sellpiaSalesDailySnapshot.createMany>) => {
            createManyCalls += 1;
            if (createManyCalls === 2) {
              throw new Error('injected second createMany failure');
            }
            return tx.sellpiaSalesDailySnapshot.createMany(...args);
          },
        };
        return callback({
          $executeRaw: tx.$executeRaw.bind(tx),
          $queryRaw: tx.$queryRaw.bind(tx),
          sellpiaSalesDailySnapshot,
        } as unknown as Prisma.TransactionClient);
      }),
  };
  return wrapped as unknown as PrismaService;
}

function seller(
  sellerId: string,
  sellerName: string,
  days: SellpiaSalesIngestBodyDto['sellers'][number]['days'],
): SellpiaSalesIngestBodyDto['sellers'][number] {
  return { sellerId, sellerName, days };
}

function day(
  date: string,
  price: number,
  amount: number,
  buyPrice: number,
): SellpiaSalesIngestBodyDto['sellers'][number]['days'][number] {
  return { date, price, amount, buyPrice };
}

function calendarDates(from: string, count: number): string[] {
  const start = dbDate(from).getTime();
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

function dbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
