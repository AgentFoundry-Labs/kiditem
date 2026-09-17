import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';
import {
  removeUnlinkedSourcingTrendSnapshotsMigration,
  SOURCING_TREND_SNAPSHOT_TABLES,
} from '../../../../scripts/data-migrations/v0.1.31/014_remove_unlinked_sourcing_trend_snapshots';

type Table = (typeof SOURCING_TREND_SNAPSHOT_TABLES)[number];

const BUSINESS_DATE = new Date('2026-09-01T00:00:00.000Z');
const CAPTURED_AT = new Date('2026-09-01T03:00:00.000Z');

/** Rows seeded per table across both organizations. */
const SEEDED: Record<Table, number> = {
  naver_keyword_daily_snapshots: 3,
  naver_popular_keyword_daily_snapshots: 2,
  shorts_trend_daily_snapshots: 2,
  live_commerce_broadcast_daily_snapshots: 2,
  live_commerce_product_daily_snapshots: 2,
  tiktok_creative_trend_daily_snapshots: 2,
};

const LINKED = { tablePresent: true, ingestionRunIdPresent: true, deletedRows: 0 };

/**
 * v0.1.31:014 runs before `db push` adds the required `ingestion_run_id` to the
 * six sourcing trend snapshot tables. The pushed schema already has the
 * column, so that is the state a database past the schema step is in. The
 * pre-schema shape is recreated inside a transaction that always rolls back:
 * one table dropped, one left on the new schema, the rest without the column.
 */
describe('v0.1.31:014 remove unlinked sourcing trend snapshots (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedOrganization(TEST_ORGANIZATION_ID, ['pencil', 'eraser']);
    await seedOrganization(OTHER_ORGANIZATION_ID, ['crayon']);
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('whitelists pushed tables whose ingestion_run_id is required and that no foreign key references', async () => {
    const columns = await prisma.$queryRaw<Array<{
      table_name: string;
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>>`
      SELECT
        table_name::text AS table_name,
        is_nullable::text AS is_nullable,
        column_default::text AS column_default,
        data_type::text AS data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND column_name = 'ingestion_run_id'
        AND table_name::text = ANY(${[...SOURCING_TREND_SNAPSHOT_TABLES]}::text[])
      ORDER BY 1
    `;
    // NOT NULL with no database default: `db push` cannot fill existing rows.
    expect(columns).toEqual([...SOURCING_TREND_SNAPSHOT_TABLES].sort().map((table_name) => ({
      table_name,
      is_nullable: 'NO',
      column_default: null,
      data_type: 'uuid',
    })));

    const references = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT conrelid::regclass::text AS table_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid::regclass::text = ANY(${[...SOURCING_TREND_SNAPSHOT_TABLES]}::text[])
    `;
    expect(references).toEqual([]);
  });

  it('deletes nothing on the pushed schema, where every table has ingestion_run_id', async () => {
    const carried = await carriedCounts(prisma);

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(SOURCING_TREND_SNAPSHOT_TABLES.map((table) => [table, LINKED])),
    });
    await expect(rowCounts(prisma, SOURCING_TREND_SNAPSHOT_TABLES)).resolves.toEqual(SEEDED);
    await expect(carriedCounts(prisma)).resolves.toEqual(carried);
  });

  it('deletes rows only where the column is missing, skips a missing table, and affects nothing on a second run', async () => {
    const dropped: Table = 'live_commerce_product_daily_snapshots';
    const linked: Table = 'shorts_trend_daily_snapshots';
    const unlinked: Table[] = [
      'naver_keyword_daily_snapshots',
      'naver_popular_keyword_daily_snapshots',
      'live_commerce_broadcast_daily_snapshots',
      'tiktok_creative_trend_daily_snapshots',
    ];
    const carried = await carriedCounts(prisma);
    const rollback = 'restore the pushed schema';

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DROP TABLE ${Prisma.raw(dropped)}`;
      for (const table of unlinked) {
        await tx.$executeRaw`ALTER TABLE ${Prisma.raw(table)} DROP COLUMN ingestion_run_id`;
      }

      const first = {
        naver_keyword_daily_snapshots: unlinkedDetails(3),
        naver_popular_keyword_daily_snapshots: unlinkedDetails(2),
        shorts_trend_daily_snapshots: LINKED,
        live_commerce_broadcast_daily_snapshots: unlinkedDetails(2),
        live_commerce_product_daily_snapshots: {
          tablePresent: false,
          ingestionRunIdPresent: false,
          deletedRows: 0,
        },
        tiktok_creative_trend_daily_snapshots: unlinkedDetails(2),
      };
      await expect(removeUnlinkedSourcingTrendSnapshotsMigration.run(tx)).resolves.toEqual({
        affectedRows: 9,
        details: first,
      });
      // Rows of every organization go; the linked table and the runs stay.
      await expect(rowCounts(tx, [...unlinked, linked])).resolves.toEqual({
        naver_keyword_daily_snapshots: 0,
        naver_popular_keyword_daily_snapshots: 0,
        live_commerce_broadcast_daily_snapshots: 0,
        tiktok_creative_trend_daily_snapshots: 0,
        shorts_trend_daily_snapshots: SEEDED[linked],
      });
      await expect(carriedCounts(tx)).resolves.toEqual(carried);

      await expect(removeUnlinkedSourcingTrendSnapshotsMigration.run(tx)).resolves.toEqual({
        affectedRows: 0,
        details: {
          ...first,
          naver_keyword_daily_snapshots: unlinkedDetails(0),
          naver_popular_keyword_daily_snapshots: unlinkedDetails(0),
          live_commerce_broadcast_daily_snapshots: unlinkedDetails(0),
          tiktok_creative_trend_daily_snapshots: unlinkedDetails(0),
        },
      });
      throw new Error(rollback);
    }, { timeout: 30_000 })).rejects.toThrow(rollback);

    await expect(tablesWithIngestionRunId()).resolves.toEqual(
      [...SOURCING_TREND_SNAPSHOT_TABLES].sort(),
    );
    await expect(rowCounts(prisma, SOURCING_TREND_SNAPSHOT_TABLES)).resolves.toEqual(SEEDED);
  });

  function runMigration() {
    return prisma.$transaction((tx) => removeUnlinkedSourcingTrendSnapshotsMigration.run(tx));
  }

  function unlinkedDetails(deletedRows: number) {
    return { tablePresent: true, ingestionRunIdPresent: false, deletedRows };
  }

  async function rowCounts(
    db: Prisma.TransactionClient,
    tables: readonly Table[],
  ): Promise<Partial<Record<Table, number>>> {
    const counts: Partial<Record<Table, number>> = {};
    for (const table of tables) {
      const [row] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM ${Prisma.raw(table)}
      `;
      counts[table] = Number(row?.count ?? -1);
    }
    return counts;
  }

  async function carriedCounts(db: Prisma.TransactionClient) {
    return {
      organizations: await db.organization.count(),
      ingestionRuns: await db.sourcingEvidenceIngestionRun.count(),
      trendSeedKeywords: await db.trendSeedKeyword.count(),
    };
  }

  async function tablesWithIngestionRunId(): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name::text AS table_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND column_name = 'ingestion_run_id'
        AND table_name::text = ANY(${[...SOURCING_TREND_SNAPSHOT_TABLES]}::text[])
      ORDER BY 1
    `;
    return rows.map((row) => row.table_name);
  }

  async function seedOrganization(organizationId: string, naverKeywords: string[]): Promise<void> {
    const idempotencyKey = randomUUID();
    const run = await prisma.sourcingEvidenceIngestionRun.create({
      data: {
        organizationId,
        sourceKey: 'kid-239.cleanup',
        targetKey: 'kid-239',
        idempotencyKey,
        requestHash: createHash('sha256').update(idempotencyKey).digest('hex'),
        collectorKey: 'kid-239-cleanup-test',
        collectorVersion: 'v1',
        triggerKind: 'manual',
        status: 'COMPLETE',
      },
    });
    const observed = {
      organizationId,
      ingestionRunId: run.id,
      businessDate: BUSINESS_DATE,
      capturedAt: CAPTURED_AT,
    };
    for (const keyword of naverKeywords) {
      await prisma.naverKeywordDailySnapshot.create({ data: { ...observed, keyword } });
    }
    await prisma.naverPopularKeywordDailySnapshot.create({
      data: { ...observed, boardKey: 'stationery', rank: 1, keyword: 'pencil case' },
    });
    await prisma.shortsTrendDailySnapshot.create({
      data: { ...observed, videoKey: 'kid-239-video' },
    });
    await prisma.liveCommerceBroadcastDailySnapshot.create({
      data: { ...observed, source: 'douyin', broadcastId: 'kid-239-broadcast' },
    });
    await prisma.liveCommerceProductDailySnapshot.create({
      data: {
        ...observed,
        source: 'douyin',
        broadcastId: 'kid-239-broadcast',
        productId: 'kid-239-product',
      },
    });
    await prisma.tiktokCreativeTrendDailySnapshot.create({
      data: { ...observed, region: 'KR', trendType: 'hashtag', entityKey: 'kid-239-hashtag' },
    });
    // A neighbouring sourcing table outside the whitelist.
    await prisma.trendSeedKeyword.create({ data: { organizationId, keyword: 'pencil' } });
  }
});
