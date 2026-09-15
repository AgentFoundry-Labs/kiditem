import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WingTrafficAggregationRepositoryAdapter } from '../../analytics/dashboard/adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import {
  OTHER_ORGANIZATION_ID,
  TEST_ORGANIZATION_ID,
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
} from '../../test-helpers/real-prisma';
import {
  readLatestListingSaleStatusFacts,
  readLatestListingStateFacts,
  readListingTrafficWindowFacts,
} from '../read/channel-listing-daily-facts';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('listing daily facts reader (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('returns only observed organization facts while preserving measured zero and missing dates', async () => {
    const listingId = await seedListing(TEST_ORGANIZATION_ID, 'TEST');
    const otherListingId = await seedListing(OTHER_ORGANIZATION_ID, 'OTHER');

    await prisma.channelListingDailySnapshot.createMany({
      data: [
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          date: '2026-09-01',
          observedAt: new Date('2026-09-01T04:00:00.000Z'),
          visitors: 7,
          views: 11,
          orders: 2,
          revenue: 25_000,
          source: 'csv_upload',
        }),
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          date: '2026-09-02',
          observedAt: null,
          visitors: 999,
          views: 999,
          orders: 999,
          revenue: 999_999,
        }),
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          date: '2026-09-03',
          observedAt: new Date('2026-09-03T05:00:00.000Z'),
          visitors: 0,
          views: 0,
          orders: 0,
          revenue: 0,
        }),
        trafficRow({
          organizationId: OTHER_ORGANIZATION_ID,
          listingId: otherListingId,
          date: '2026-09-01',
          observedAt: new Date('2026-09-01T06:00:00.000Z'),
          visitors: 444,
          views: 555,
          orders: 66,
          revenue: 777_777,
        }),
      ],
    });

    const result = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-04T00:00:00.000Z'),
    });

    expect(result.rows.map((row) => ({
      listingId: row.listingId,
      businessDate: row.businessDate,
      visitors: row.visitors,
      views: row.views,
      source: row.source,
    }))).toEqual([
      {
        listingId,
        businessDate: '2026-09-01',
        visitors: 7,
        views: 11,
        source: 'csv_upload',
      },
      {
        listingId,
        businessDate: '2026-09-03',
        visitors: 0,
        views: 0,
        source: null,
      },
    ]);
    expect(result.observedDates).toEqual(['2026-09-01', '2026-09-03']);
    expect(result.coverage).toEqual({
      includedDates: ['2026-09-01', '2026-09-03'],
      invalidDates: [],
      missingDates: ['2026-09-02'],
    });
    expect(result.totals).toEqual({
      visitors: 7,
      views: 11,
      cartAdds: 0,
      orders: 2,
      salesQty: 0,
      revenue: 25_000,
    });
    expect(result.latestObservedAt).toEqual(new Date('2026-09-03T05:00:00.000Z'));
  });

  it('uses a completed provider-backed empty attempt as measured-zero coverage', async () => {
    const { listingId, accountId } = await seedListingWithAccount(TEST_ORGANIZATION_ID, 'EMPTY');
    const importedAt = new Date('2026-09-01T06:00:00.000Z');
    await seedTrafficAttempt({
      accountId,
      status: 'completed',
      generation: 1n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: true,
      importedAt,
    });

    const result = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listingId],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
    });

    expect(result.rows).toEqual([]);
    expect(result.observedDates).toEqual([]);
    expect(result.coverage).toEqual({
      includedDates: ['2026-09-01'],
      invalidDates: [],
      missingDates: ['2026-09-02'],
    });
    expect(result.totals).toEqual({
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
    });
    expect(result.latestObservedAt).toEqual(importedAt);
  });

  it('counts a date the account attempt confirmed when a filtered listing has no row', async () => {
    const first = await seedListingWithAccount(TEST_ORGANIZATION_ID, 'PARTIAL-1');
    const second = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: first.accountId,
        externalId: 'LISTING-PARTIAL-2',
      },
    });
    const attempt = await seedTrafficAttempt({
      accountId: first.accountId,
      status: 'completed',
      generation: 1n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: false,
      importedAt: new Date('2026-09-01T06:00:00.000Z'),
    });
    await prisma.channelListingDailySnapshot.create({
      data: trafficRow({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: first.listingId,
        date: '2026-09-01',
        observedAt: new Date('2026-09-01T05:00:00.000Z'),
        visitors: 4,
        views: 6,
        orders: 1,
        revenue: 10_000,
        source: 'wing',
        sourceAttemptId: attempt.id,
      }),
    });

    const result = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [first.listingId, second.id],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-02T00:00:00.000Z'),
    });

    // The second listing has no row, so it stays unmeasured rather than zero.
    expect(result.rows.map((row) => row.listingId)).toEqual([first.listingId]);
    expect(result.observedDates).toEqual(['2026-09-01']);
    expect(result.coverage).toEqual({
      includedDates: ['2026-09-01'],
      invalidDates: [],
      missingDates: [],
    });
    expect(result.totals).toEqual({
      visitors: 4,
      views: 6,
      cartAdds: 0,
      orders: 1,
      salesQty: 0,
      revenue: 10_000,
    });
  });

  it('still requires a row from every listing of an account without a completed attempt', async () => {
    const attempted = await seedListingWithAccount(TEST_ORGANIZATION_ID, 'ATTEMPTED');
    const uploaded = await seedListingWithAccount(TEST_ORGANIZATION_ID, 'CSV-ONLY');
    const attempt = await seedTrafficAttempt({
      accountId: attempted.accountId,
      status: 'completed',
      generation: 1n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: false,
      importedAt: new Date('2026-09-01T06:00:00.000Z'),
    });
    await prisma.channelListingDailySnapshot.create({
      data: trafficRow({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: attempted.listingId,
        date: '2026-09-01',
        observedAt: new Date('2026-09-01T05:00:00.000Z'),
        visitors: 4,
        views: 6,
        orders: 1,
        revenue: 10_000,
        source: 'wing',
        sourceAttemptId: attempt.id,
      }),
    });

    const result = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [attempted.listingId, uploaded.listingId],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-02T00:00:00.000Z'),
    });

    expect(result.coverage).toEqual({
      includedDates: [],
      invalidDates: ['2026-09-01'],
      missingDates: [],
    });
  });

  it('keeps inactive listing rows outside the active traffic population and totals', async () => {
    const active = await seedListingWithAccount(TEST_ORGANIZATION_ID, 'ACTIVE-POPULATION');
    const inactive = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: active.accountId,
        externalId: 'LISTING-INACTIVE-POPULATION',
        isActive: false,
      },
    });
    const attempt = await seedTrafficAttempt({
      accountId: active.accountId,
      status: 'completed',
      generation: 1n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: false,
      importedAt: new Date('2026-09-01T06:00:00.000Z'),
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: [
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId: active.listingId,
          date: '2026-09-01',
          observedAt: new Date('2026-09-01T05:00:00.000Z'),
          visitors: 3,
          views: 5,
          orders: 1,
          revenue: 8_000,
          source: 'wing',
          sourceAttemptId: attempt.id,
        }),
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId: inactive.id,
          date: '2026-09-01',
          observedAt: new Date('2026-09-01T05:00:00.000Z'),
          visitors: 300,
          views: 500,
          orders: 100,
          revenue: 800_000,
          source: 'wing',
          sourceAttemptId: attempt.id,
        }),
      ],
    });

    const result = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-02T00:00:00.000Z'),
    });

    expect(result.rows.map((row) => row.listingId)).toEqual([active.listingId]);
    expect(result.coverage).toEqual({
      includedDates: ['2026-09-01'],
      invalidDates: [],
      missingDates: [],
    });
    expect(result.totals).toMatchObject({
      visitors: 3,
      views: 5,
      orders: 1,
      revenue: 8_000,
    });
  });

  it('fences Wing rows to the latest completed generation for each declared date', async () => {
    const { listingId, accountId } = await seedListingWithAccount(TEST_ORGANIZATION_ID, 'FENCE');
    const generation1 = await seedTrafficAttempt({
      accountId,
      status: 'completed',
      generation: 1n,
      confirmedDates: ['2026-09-01', '2026-09-02'],
      providerBackedEmptyProof: false,
      importedAt: new Date('2026-09-02T03:00:00.000Z'),
    });
    const generation2 = await seedTrafficAttempt({
      accountId,
      status: 'completed',
      generation: 2n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: false,
      importedAt: new Date('2026-09-02T04:00:00.000Z'),
    });
    await Promise.all([
      seedTrafficAttempt({
        accountId,
        status: 'running',
        generation: 3n,
        confirmedDates: ['2026-09-01', '2026-09-02'],
        providerBackedEmptyProof: false,
      }),
      seedTrafficAttempt({
        accountId,
        status: 'failed',
        generation: 4n,
        confirmedDates: ['2026-09-01', '2026-09-02'],
        providerBackedEmptyProof: false,
      }),
    ]);
    await prisma.channelListingDailySnapshot.createMany({
      data: [
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          date: '2026-09-01',
          observedAt: new Date('2026-09-01T05:00:00.000Z'),
          visitors: 3,
          views: 5,
          orders: 1,
          revenue: 8_000,
          source: 'wing',
          sourceAttemptId: generation1.id,
        }),
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          date: '2026-09-02',
          observedAt: new Date('2026-09-02T05:00:00.000Z'),
          visitors: 7,
          views: 11,
          orders: 2,
          revenue: 18_000,
          source: 'wing',
          sourceAttemptId: generation1.id,
        }),
      ],
    });

    const stale = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listingId],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
    });

    expect(stale.rows.map((row) => row.businessDate)).toEqual(['2026-09-02']);
    expect(stale.observedDates).toEqual(['2026-09-01', '2026-09-02']);
    expect(stale.coverage).toEqual({
      includedDates: ['2026-09-02'],
      invalidDates: ['2026-09-01'],
      missingDates: [],
    });

    await prisma.channelListingDailySnapshot.update({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          businessDate: new Date('2026-09-01T00:00:00.000Z'),
        },
      },
      data: {
        metaJson: wingMetadata(generation2.id),
      },
    });

    const current = await readListingTrafficWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listingId],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
    });
    expect(current.rows.map((row) => row.businessDate)).toEqual(['2026-09-01', '2026-09-02']);
    expect(current.coverage).toEqual({
      includedDates: ['2026-09-01', '2026-09-02'],
      invalidDates: [],
      missingDates: [],
    });
  });

  it('keeps dashboard traffic rows and coverage on one generation during terminal publication', async () => {
    const publisher = makeTestPrisma();
    const observer = makeTestPrisma();
    await Promise.all([publisher.$connect(), observer.$connect()]);
    const { listingId, accountId } = await seedListingWithAccount(
      TEST_ORGANIZATION_ID,
      'CONCURRENT-PUBLICATION',
    );
    const previous = await seedTrafficAttempt({
      accountId,
      status: 'completed',
      generation: 1n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: false,
      importedAt: new Date('2026-09-01T05:00:00.000Z'),
    });
    await prisma.channelListingDailySnapshot.create({
      data: trafficRow({
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        date: '2026-09-01',
        observedAt: new Date('2026-09-01T05:00:00.000Z'),
        visitors: 7,
        views: 11,
        orders: 2,
        revenue: 25_000,
        source: 'wing',
        sourceAttemptId: previous.id,
      }),
    });
    const next = await seedTrafficAttempt({
      accountId,
      status: 'running',
      generation: 2n,
      confirmedDates: ['2026-09-01'],
      providerBackedEmptyProof: true,
    });

    const publicationLocked = deferred<void>();
    const publish = deferred<void>();
    const publication = publisher.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE source_import_runs IN ACCESS EXCLUSIVE MODE',
      );
      publicationLocked.resolve();
      await publish.promise;
      await tx.sourceImportRun.update({
        where: { id: next.id },
        data: {
          status: 'completed',
          importedAt: new Date('2026-09-01T06:00:00.000Z'),
        },
      });
    }, { timeout: 15_000 });

    try {
      await publicationLocked.promise;
      const repository = new WingTrafficAggregationRepositoryAdapter(
        prisma as unknown as PrismaService,
      );
      const reading = repository.aggregateTraffic(TEST_ORGANIZATION_ID, {
        sourceClass: 'closed_day_clipped',
        selectedDates: ['2026-09-01'],
        queryWindow: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-02T00:00:00.000Z'),
        },
        knownThrough: '2026-09-01',
      });
      await waitForBlockedSourceImportRead(observer);
      publish.resolve();
      await publication;

      await expect(reading).resolves.toMatchObject({
        revenue: 25_000,
        orders: 2,
        coverage: {
          completedDays: 1,
          missingDates: [],
        },
      });
    } finally {
      publish.resolve();
      await publication.catch(() => undefined);
      await Promise.all([publisher.$disconnect(), observer.$disconnect()]);
    }
  }, 20_000);

  it('reads the latest listing sale status without applying the traffic evidence gate', async () => {
    const listingId = await seedListing(TEST_ORGANIZATION_ID, 'STATUS-TEST');
    const otherListingId = await seedListing(OTHER_ORGANIZATION_ID, 'STATUS-OTHER');
    await prisma.channelListingDailySnapshot.createMany({
      data: [
        statusRow(TEST_ORGANIZATION_ID, listingId, '2026-09-01', '판매중'),
        statusRow(TEST_ORGANIZATION_ID, listingId, '2026-09-02', '판매중지'),
        statusRow(OTHER_ORGANIZATION_ID, otherListingId, '2026-09-03', '판매중'),
      ],
    });

    const result = await readLatestListingSaleStatusFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listingId, otherListingId],
    });

    expect(result).toEqual([{
      listingId,
      businessDate: '2026-09-02',
      saleStatus: '판매중지',
      observedAt: new Date('2026-09-02T06:00:00.000Z'),
    }]);
  });

  it('reads the latest listing state past a later row that observed only traffic', async () => {
    const listingId = await seedListing(TEST_ORGANIZATION_ID, 'STATE-BEHIND-TRAFFIC');
    await prisma.channelListingDailySnapshot.createMany({
      data: [
        statusRow(TEST_ORGANIZATION_ID, listingId, '2026-09-01', '판매중'),
        trafficRow({
          organizationId: TEST_ORGANIZATION_ID,
          listingId,
          date: '2026-09-02',
          observedAt: new Date('2026-09-02T01:00:00.000Z'),
          visitors: 0,
          views: 0,
          orders: 0,
          revenue: 0,
          source: 'wing',
        }),
      ],
    });

    const result = await readLatestListingStateFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listingId],
    });

    expect(result).toMatchObject([{
      listingId,
      businessDate: new Date('2026-09-01T00:00:00.000Z'),
      saleStatus: '판매중',
    }]);
  });

  async function seedListing(organizationId: string, suffix: string): Promise<string> {
    return (await seedListingWithAccount(organizationId, suffix)).listingId;
  }

  async function seedListingWithAccount(organizationId: string, suffix: string) {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: `Wing ${suffix}`,
        externalAccountId: `VENDOR-${suffix}`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: account.id,
        externalId: `LISTING-${suffix}`,
      },
    });
    return { listingId: listing.id, accountId: account.id };
  }

  async function seedTrafficAttempt(input: {
    accountId: string;
    status: 'completed' | 'running' | 'failed';
    generation: bigint;
    confirmedDates: string[];
    providerBackedEmptyProof: boolean;
    importedAt?: Date;
  }) {
    return prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: input.accountId,
        sourceType: 'coupang_wing_traffic',
        status: input.status,
        freshnessGeneration: input.generation,
        providerBackedEmptyProof: input.providerBackedEmptyProof,
        qualityReport: { confirmedDates: input.confirmedDates },
        importedAt: input.importedAt,
      },
    });
  }
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForBlockedSourceImportRead(prisma: PrismaClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [activity] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query ILIKE '%source_import_runs%'
      ) AS waiting
    `;
    if (activity?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the traffic coverage read to block.');
}

function trafficRow(input: {
  organizationId: string;
  listingId: string;
  date: string;
  observedAt: Date | null;
  visitors: number;
  views: number;
  orders: number;
  revenue: number;
  source?: 'csv_upload' | 'wing';
  sourceAttemptId?: string;
}) {
  return {
    id: randomUUID(),
    organizationId: input.organizationId,
    listingId: input.listingId,
    channel: 'coupang',
    externalId: input.listingId,
    businessDate: new Date(`${input.date}T00:00:00.000Z`),
    trafficVisitors: input.visitors,
    trafficViews: input.views,
    trafficOrders: input.orders,
    trafficRevenue: input.revenue,
    trafficObservedAt: input.observedAt,
    ...(input.source === 'csv_upload' ? {
      metaJson: { 'traffic.currentSource': 'traffic.csv_upload' },
    } : input.source === 'wing' ? {
      metaJson: wingMetadata(input.sourceAttemptId),
    } : {}),
  };
}

function wingMetadata(sourceAttemptId?: string) {
  return {
    'traffic.currentSource': 'wing.traffic',
    'wing.traffic': {
      ...(sourceAttemptId ? { sourceAttemptId } : {}),
    },
  };
}

function statusRow(
  organizationId: string,
  listingId: string,
  date: string,
  saleStatus: string,
) {
  return {
    id: randomUUID(),
    organizationId,
    listingId,
    channel: 'coupang',
    externalId: listingId,
    businessDate: new Date(`${date}T00:00:00.000Z`),
    saleStatus,
    lastObservedAt: new Date(`${date}T06:00:00.000Z`),
  };
}
