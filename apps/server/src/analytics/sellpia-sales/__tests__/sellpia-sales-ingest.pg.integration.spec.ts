import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import {
  IDOR_SENTINEL,
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../domain/snapshot-coverage';
import { SellpiaSalesSourceService } from '../sellpia-sales-source.service';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { SellpiaSalesIngestBodyDto } from '../dto/sellpia-sales.dto';

const RANGE_START = '2026-04-17';
const RANGE_DATES = calendarDates(RANGE_START, 93);
const RANGE_END = RANGE_DATES.at(-1)!;
const CAPTURE_1 = '2026-07-18T01:00:00.000Z';
const CAPTURE_2 = '2026-07-18T02:00:00.000Z';
const CAPTURE_3 = '2026-07-18T03:00:00.000Z';

describe('Sellpia sales source owner (PG integration)', () => {
  let prisma: PrismaClient;
  let owner: SellpiaSalesSourceService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = makeOwner(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('publishes a 93-day multi-seller snapshot only after COMPLETE', async () => {
    const attempt = await begin(owner, TEST_ORGANIZATION_ID, {
      from: RANGE_START,
      to: RANGE_END,
    });
    const control = await owner.readAttemptControl(TEST_ORGANIZATION_ID, attempt.attemptId);
    expect(control).toMatchObject({ attemptId: attempt.attemptId });

    const completed = await owner.completeAttempt(
      TEST_ORGANIZATION_ID,
      attempt.attemptId,
      control!.attemptToken,
      largePayload(20, 100),
    );

    expect(completed).toMatchObject({
      state: 'COMPLETE',
      actualCutoffAt: `${RANGE_END}T00:00:00.000Z`,
      rowCount: 20 * RANGE_DATES.length + RANGE_DATES.length,
      sellerCount: 20,
      businessDates: RANGE_DATES,
    });
    expect(completed.contentChecksum).toMatch(/^[a-f0-9]{64}$/);

    const [factCount, coverageCount, firstFact, lastFact, run] = await Promise.all([
      prisma.sellpiaSalesDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: attempt.attemptId,
          sellerId: { not: SELLPIA_SALES_COVERAGE_SELLER_ID },
        },
      }),
      prisma.sellpiaSalesDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: attempt.attemptId,
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
      prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }),
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
    expect(run).toMatchObject({ status: 'completed', organizationId: TEST_ORGANIZATION_ID });
  });

  it('rolls back source rows and leaves the attempt running when terminal write fails', async () => {
    const attempt = await begin(owner, TEST_ORGANIZATION_ID, {
      from: RANGE_START,
      to: RANGE_END,
    });
    const control = await owner.readAttemptControl(TEST_ORGANIZATION_ID, attempt.attemptId);
    const failingOwner = makeOwner(prismaWithSecondCreateManyFailure(prisma));

    await expect(
      failingOwner.completeAttempt(
        TEST_ORGANIZATION_ID,
        attempt.attemptId,
        control!.attemptToken,
        largePayload(11, 500),
      ),
    ).rejects.toThrow('injected second createMany failure');

    await expect(
      prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }),
    ).resolves.toMatchObject({ status: 'running' });
    await expect(
      prisma.sellpiaSalesDailySnapshot.count({
        where: { sourceImportRunId: attempt.attemptId },
      }),
    ).resolves.toBe(0);
  });

  it('replays the identical COMPLETE body and rejects a changed terminal body', async () => {
    const range = { from: '2026-07-17', to: '2026-07-17' };
    const body = payload(range, CAPTURE_1);
    const attempt = await begin(owner, TEST_ORGANIZATION_ID, range);
    const control = await owner.readAttemptControl(TEST_ORGANIZATION_ID, attempt.attemptId);
    const completed = await owner.completeAttempt(
      TEST_ORGANIZATION_ID,
      attempt.attemptId,
      control!.attemptToken,
      body,
    );

    await expect(
      owner.completeAttempt(
        TEST_ORGANIZATION_ID,
        attempt.attemptId,
        control!.attemptToken,
        body,
      ),
    ).resolves.toMatchObject({
      state: 'COMPLETE',
      contentChecksum: completed.contentChecksum,
    });
    await expect(
      prisma.sellpiaSalesDailySnapshot.count({ where: { sourceImportRunId: attempt.attemptId } }),
    ).resolves.toBe(2);

    await expect(
      owner.completeAttempt(
        TEST_ORGANIZATION_ID,
        attempt.attemptId,
        control!.attemptToken,
        payload(range, CAPTURE_2),
      ),
    ).rejects.toThrow('SOURCE_TERMINAL_REPLAY_CONFLICT');
  });

  it('keeps a prior COMPLETE publication when a newer attempt fails', async () => {
    const range = { from: '2026-07-17', to: '2026-07-17' };
    const first = await begin(owner, TEST_ORGANIZATION_ID, range);
    const firstControl = await owner.readAttemptControl(TEST_ORGANIZATION_ID, first.attemptId);
    await owner.completeAttempt(
      TEST_ORGANIZATION_ID,
      first.attemptId,
      firstControl!.attemptToken,
      payload(range, CAPTURE_1, 2_000),
    );

    const failed = await begin(owner, TEST_ORGANIZATION_ID, range);
    const failedControl = await owner.readAttemptControl(TEST_ORGANIZATION_ID, failed.attemptId);
    await owner.failAttempt(
      TEST_ORGANIZATION_ID,
      failed.attemptId,
      failedControl!.attemptToken,
      'NETWORK',
      'Provider unavailable.',
    );

    const published = await owner.readPublishedRows(
      TEST_ORGANIZATION_ID,
      range.from,
      range.to,
    );
    expect(published).toHaveLength(2);
    expect(published).toContainEqual(expect.objectContaining({
      sellerId: '118',
      revenueKrw: 2_000,
    }));
    expect(published).toContainEqual(expect.objectContaining({
      sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
    }));
    await expect(
      prisma.sellpiaSalesDailySnapshot.count({ where: { sourceImportRunId: failed.attemptId } }),
    ).resolves.toBe(0);
  });

  it('preserves organization isolation for owner attempts and published reads', async () => {
    const range = { from: '2026-07-17', to: '2026-07-17' };
    const foreign = await begin(owner, OTHER_ORGANIZATION_ID, range);
    const foreignControl = await owner.readAttemptControl(OTHER_ORGANIZATION_ID, foreign.attemptId);
    await owner.completeAttempt(
      OTHER_ORGANIZATION_ID,
      foreign.attemptId,
      foreignControl!.attemptToken,
      payload(range, CAPTURE_1, IDOR_SENTINEL),
    );
    const own = await begin(owner, TEST_ORGANIZATION_ID, range);
    const ownControl = await owner.readAttemptControl(TEST_ORGANIZATION_ID, own.attemptId);
    await owner.completeAttempt(
      TEST_ORGANIZATION_ID,
      own.attemptId,
      ownControl!.attemptToken,
      payload(range, CAPTURE_2, 1_000),
    );

    const [ownRows, foreignRows] = await Promise.all([
      owner.readPublishedRows(TEST_ORGANIZATION_ID, range.from, range.to),
      owner.readPublishedRows(OTHER_ORGANIZATION_ID, range.from, range.to),
    ]);
    expect(ownRows).toContainEqual(expect.objectContaining({ sellerId: '118', revenueKrw: 1_000 }));
    expect(ownRows.some((row) => row.revenueKrw === IDOR_SENTINEL)).toBe(false);
    expect(foreignRows).toContainEqual(expect.objectContaining({ sellerId: '118', revenueKrw: IDOR_SENTINEL }));
    expect(
      await owner.readAttempt(TEST_ORGANIZATION_ID, foreign.attemptId),
    ).toBeNull();
  });

  it('requires exact empty provenance and preserves a confirmed-empty COMPLETE snapshot', async () => {
    const range = { from: '2026-07-17', to: '2026-07-17' };
    const attempt = await begin(owner, TEST_ORGANIZATION_ID, range);
    const control = await owner.readAttemptControl(TEST_ORGANIZATION_ID, attempt.attemptId);

    await expect(
      owner.completeAttempt(
        TEST_ORGANIZATION_ID,
        attempt.attemptId,
        control!.attemptToken,
        { ...emptyPayload(range), provenance: { explicitEmpty: true } } as unknown as SellpiaSalesIngestBodyDto,
      ),
    ).rejects.toThrow('EMPTY_COVERAGE_NOT_PROVEN');

    const completed = await owner.completeAttempt(
      TEST_ORGANIZATION_ID,
      attempt.attemptId,
      control!.attemptToken,
      emptyPayload(range),
    );
    expect(completed).toMatchObject({ state: 'COMPLETE', sellerCount: 0, rowCount: 1 });
    await expect(
      prisma.sellpiaSalesDailySnapshot.findMany({ where: { sourceImportRunId: attempt.attemptId } }),
    ).resolves.toEqual([
      expect.objectContaining({
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
        revenueKrw: 0,
      }),
    ]);
    await expect(
      prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }),
    ).resolves.toMatchObject({ providerBackedEmptyProof: true });
  });

  it('retains source validation and normalization before any owner write', async () => {
    const range = { from: '2026-07-17', to: '2026-07-17' };
    const attempt = await begin(owner, TEST_ORGANIZATION_ID, range);
    const control = await owner.readAttemptControl(TEST_ORGANIZATION_ID, attempt.attemptId);
    const invalidBodies = [
      {
        ...payload(range),
        sellers: [{ sellerId: '118', sellerName: '스마트스토어', days: [] }],
      },
      {
        ...payload(range),
        sellers: [{ sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID, sellerName: 'reserved', days: [{ date: range.from, price: 1, amount: 1, buyPrice: 1 }] }],
      },
      {
        ...payload(range),
        sellers: [{ sellerId: '118', sellerName: '스마트스토어', days: [{ date: '2026-07-18', price: 1, amount: 1, buyPrice: 1 }] }],
      },
      { ...payload(range), capturedAt: 'not-a-date' },
    ];
    for (const body of invalidBodies) {
      await expect(
        owner.completeAttempt(
          TEST_ORGANIZATION_ID,
          attempt.attemptId,
          control!.attemptToken,
          body as SellpiaSalesIngestBodyDto,
        ),
      ).rejects.toThrow();
    }
    await expect(
      prisma.sellpiaSalesDailySnapshot.count({ where: { sourceImportRunId: attempt.attemptId } }),
    ).resolves.toBe(0);

    const normalizedAttempt = await begin(owner, OTHER_ORGANIZATION_ID, range);
    const normalizedControl = await owner.readAttemptControl(OTHER_ORGANIZATION_ID, normalizedAttempt.attemptId);
    await owner.completeAttempt(
      OTHER_ORGANIZATION_ID,
      normalizedAttempt.attemptId,
      normalizedControl!.attemptToken,
      {
        ...payload(range),
        sellers: [{
          sellerId: '118',
          sellerName: '스마트스토어',
          days: [
            { date: range.from, price: -100, amount: Number.NaN, buyPrice: 0 },
            { date: range.from, price: 300, amount: 3, buyPrice: 150 },
          ],
        }],
      },
    );
    await expect(
      prisma.sellpiaSalesDailySnapshot.findUnique({
        where: {
          organizationId_businessDate_sellerId: {
            organizationId: OTHER_ORGANIZATION_ID,
            businessDate: dbDate(range.from),
            sellerId: '118',
          },
        },
      }),
    ).resolves.toMatchObject({ revenueKrw: 300, qty: 3, costKrw: 150 });
  });
});

function makeOwner(prisma: PrismaClient): SellpiaSalesSourceService {
  return new SellpiaSalesSourceService(
    prisma as never,
    new SourceFailureAlerts(prisma as never),
  );
}

function begin(
  owner: SellpiaSalesSourceService,
  organizationId: string,
  range: { from: string; to: string },
) {
  return owner.beginAttempt(organizationId, randomUUID(), { range });
}

function payload(
  range: { from: string; to: string },
  capturedAt = CAPTURE_2,
  revenue = 1_200,
): SellpiaSalesIngestBodyDto {
  return {
    range,
    capturedAt,
    sellers: [{
      sellerId: '118',
      sellerName: '스마트스토어',
      days: [
        { date: range.from, price: revenue, amount: 2, buyPrice: 700 },
        ...(range.to === range.from
          ? []
          : [{ date: range.to, price: revenue * 2, amount: 4, buyPrice: 1_400 }]),
      ],
    }],
  };
}

function emptyPayload(range: { from: string; to: string }): SellpiaSalesIngestBodyDto {
  return {
    range,
    capturedAt: CAPTURE_2,
    sellers: [],
    provenance: {
      source: 'sellpia_sale_summary',
      mode: 'selldate',
      sellerScope: 'all',
      responseShape: 'empty_object',
      explicitEmpty: true,
    },
  };
}

function largePayload(sellerCount: number, baseRevenue: number): SellpiaSalesIngestBodyDto {
  return {
    range: { from: RANGE_START, to: RANGE_END },
    capturedAt: CAPTURE_2,
    sellers: Array.from({ length: sellerCount }, (_, sellerIndex) => {
      const sellerNumber = sellerIndex + 1;
      return {
        sellerId: `seller-${String(sellerNumber).padStart(2, '0')}`,
        sellerName: sellerNumber === 1 ? '쿠팡-직배송' : `판매처 ${sellerNumber}`,
        days: RANGE_DATES.map((date, dateIndex) => {
          const revenue = baseRevenue + sellerIndex * 100 + dateIndex;
          return { date, price: revenue, amount: sellerNumber, buyPrice: Math.floor(revenue / 2) };
        }),
      };
    }),
  };
}

function prismaWithSecondCreateManyFailure(prisma: PrismaClient): PrismaClient {
  let createManyCalls = 0;
  const extended = prisma.$extends({
    query: {
      sellpiaSalesDailySnapshot: {
        async createMany({ args, query }) {
          createManyCalls += 1;
          if (createManyCalls === 2) throw new Error('injected second createMany failure');
          return query(args);
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
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
