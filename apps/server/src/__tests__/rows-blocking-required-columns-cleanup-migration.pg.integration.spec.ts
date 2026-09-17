import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';
import { removeRowsBlockingRequiredColumns } from '../../../../scripts/data-migrations/helpers/required-column-row-cleanup';
import { removeRetiredOperationAlerts } from '../../../../scripts/data-migrations/v0.1.31/005_remove_retired_operation_alerts';
import {
  removeRowsBlockingRequiredColumnsMigration,
  REQUIRED_COLUMN_CLEANUPS,
} from '../../../../scripts/data-migrations/v0.1.31/014_remove_rows_blocking_required_columns';

type Table = (typeof REQUIRED_COLUMN_CLEANUPS)[number]['table'];

const repoRoot = path.resolve(__dirname, '../../../..');
const TABLES: Table[] = REQUIRED_COLUMN_CLEANUPS.map((cleanup) => cleanup.table);
const SOURCING_TABLES = TABLES.filter((table) => table !== 'alerts');
const REQUIRED = Object.fromEntries(
  REQUIRED_COLUMN_CLEANUPS.map((cleanup) => [cleanup.table, cleanup.requiredColumn]),
) as Record<Table, string>;
/** The type `db push` gives each required column. */
const REQUIRED_TYPE = Object.fromEntries(
  TABLES.map((table) => [table, table === 'alerts' ? 'text' : 'uuid']),
) as Record<Table, 'text' | 'uuid'>;

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
  alerts: 5,
};

const kept = (table: Table) => ({
  requiredColumn: REQUIRED[table],
  tablePresent: true,
  requiredColumnPresent: true,
  deletedRows: 0,
});
const deleted = (table: Table, deletedRows: number) => ({
  requiredColumn: REQUIRED[table],
  tablePresent: true,
  requiredColumnPresent: false,
  deletedRows,
});
const absent = (table: Table) => ({
  requiredColumn: REQUIRED[table],
  tablePresent: false,
  requiredColumnPresent: false,
  deletedRows: 0,
});

/**
 * v0.1.31:014 runs before `db push` adds each listed table's required column.
 * The pushed schema already has every column, so that is the state a database
 * past the schema step is in. The Office 0.1.30 shape is recreated inside
 * transactions that always roll back.
 */
describe('v0.1.31:014 remove rows blocking required columns (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let retiredAlertId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    [retiredAlertId] = await seedOrganization(prisma, TEST_ORGANIZATION_ID, ['pencil', 'eraser'], 3);
    await seedOrganization(prisma, OTHER_ORGANIZATION_ID, ['crayon'], 2);
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('lists pushed tables whose required column has no database default and that no foreign key references', async () => {
    const columns = await prisma.$queryRaw<Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>>`
      SELECT
        c.table_name::text AS table_name,
        c.column_name::text AS column_name,
        c.is_nullable::text AS is_nullable,
        c.column_default::text AS column_default,
        c.data_type::text AS data_type
      FROM unnest(${TABLES}::text[], ${TABLES.map((table) => REQUIRED[table])}::text[])
        AS entry(table_name, column_name)
      JOIN information_schema.columns c
        ON c.table_schema = current_schema()
       AND c.table_name::text = entry.table_name
       AND c.column_name::text = entry.column_name
      ORDER BY 1
    `;
    // NOT NULL with no database default: `db push` cannot fill existing rows.
    expect(columns).toEqual([...TABLES].sort().map((table) => ({
      table_name: table,
      column_name: REQUIRED[table],
      is_nullable: 'NO',
      column_default: null,
      data_type: REQUIRED_TYPE[table],
    })));

    const references = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT conrelid::regclass::text AS table_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid::regclass::text = ANY(${TABLES}::text[])
    `;
    expect(references).toEqual([]);
  });

  it('deletes nothing on the pushed schema, where every table has its required column', async () => {
    const carried = await carriedCounts(prisma);

    await expect(prisma.$transaction((tx) => removeRowsBlockingRequiredColumnsMigration.run(tx))).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, kept(table)])),
    });
    await expect(rowCounts(prisma, TABLES)).resolves.toEqual(SEEDED);
    await expect(carriedCounts(prisma)).resolves.toEqual(carried);
  });

  it('on the Office 0.1.30 shape, deletes the unlinked sourcing rows and the signal alerts 005 keeps, so each column can be added', async () => {
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
      // Office 0.1.30 alerts: a kind column, signal by default, and no dedupe key.
      await tx.$executeRaw`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signal'`;
      await tx.$executeRaw`ALTER TABLE alerts DROP COLUMN dedupe_key`;
      await tx.$executeRaw`UPDATE alerts SET kind = 'operation' WHERE id = ${retiredAlertId}::uuid`;

      // 005 runs first in the pre-schema phase and keeps the signal alerts.
      await expect(removeRetiredOperationAlerts.run(tx)).resolves.toEqual({
        affectedRows: 1,
        details: { retiredAlertRows: 1, removedAlertRows: 1, survivingRows: 4, kindColumnPresent: true },
      });

      const first = {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 3),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 2),
        shorts_trend_daily_snapshots: kept(linked),
        live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 2),
        live_commerce_product_daily_snapshots: absent(dropped),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 2),
        alerts: deleted('alerts', 4),
      };
      await expect(removeRowsBlockingRequiredColumnsMigration.run(tx)).resolves.toEqual({
        affectedRows: 13,
        details: first,
      });
      // Rows of every organization go; the linked table and the carried rows stay.
      await expect(rowCounts(tx, [...unlinked, 'alerts', linked])).resolves.toEqual({
        naver_keyword_daily_snapshots: 0,
        naver_popular_keyword_daily_snapshots: 0,
        live_commerce_broadcast_daily_snapshots: 0,
        tiktok_creative_trend_daily_snapshots: 0,
        alerts: 0,
        shorts_trend_daily_snapshots: SEEDED[linked],
      });
      await expect(carriedCounts(tx)).resolves.toEqual(carried);

      await expect(removeRowsBlockingRequiredColumnsMigration.run(tx)).resolves.toEqual({
        affectedRows: 0,
        details: {
          ...first,
          naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 0),
          naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 0),
          live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 0),
          tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 0),
          alerts: deleted('alerts', 0),
        },
      });

      // What `db push` does next: add the column as NOT NULL with no default,
      // which PostgreSQL accepts only on a table without rows.
      for (const table of [...unlinked, 'alerts'] as Table[]) {
        await tx.$executeRaw`
          ALTER TABLE ${Prisma.raw(table)}
          ADD COLUMN ${Prisma.raw(REQUIRED[table])} ${Prisma.raw(REQUIRED_TYPE[table])} NOT NULL
        `;
      }
      throw new Error(rollback);
    }, { timeout: 30_000 })).rejects.toThrow(rollback);

    await expect(tablesWithRequiredColumn(prisma)).resolves.toEqual([...TABLES].sort());
    await expect(rowCounts(prisma, TABLES)).resolves.toEqual(SEEDED);
  });

  it('leaves signal alerts alone once dedupe_key exists', async () => {
    const rollback = 'restore the pushed schema';

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signal'`;
      for (const table of SOURCING_TABLES) {
        await tx.$executeRaw`ALTER TABLE ${Prisma.raw(table)} DROP COLUMN ingestion_run_id`;
      }

      await expect(removeRowsBlockingRequiredColumnsMigration.run(tx)).resolves.toEqual({
        affectedRows: 13,
        details: {
          ...Object.fromEntries(SOURCING_TABLES.map((table) => [table, deleted(table, SEEDED[table])])),
          alerts: kept('alerts'),
        },
      });
      const [signal] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM alerts WHERE kind = 'signal' AND dedupe_key IS NOT NULL
      `;
      expect(Number(signal?.count)).toBe(SEEDED.alerts);
      throw new Error(rollback);
    }, { timeout: 30_000 })).rejects.toThrow(rollback);

    await expect(rowCounts(prisma, TABLES)).resolves.toEqual(SEEDED);
  });

  it('refuses, before any delete, a listed table whose delete would reach an ADR-0010 kept table', async () => {
    const rollback = 'restore the pushed schema';
    const reason = 'A list entry this test uses to reach a kept table.';
    const unlinked = {
      table: 'naver_keyword_daily_snapshots',
      requiredColumn: 'ingestion_run_id',
      reason,
    };

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE naver_keyword_daily_snapshots DROP COLUMN ingestion_run_id`;

      // Two cascades down: a listing's options, then their confirmed recipes.
      await expect(removeRowsBlockingRequiredColumns(tx, [
        unlinked,
        { table: 'channel_listings', requiredColumn: 'required_run_id', reason },
      ])).rejects.toThrow(
        'Required-column cleanup refuses deletes that reach ADR-0010 kept tables: '
          + 'channel_listings -> channel_listing_option_inventory_components (on delete cascade).',
      );

      // A kept row that would only lose its reference is refused as well.
      await tx.$executeRaw`CREATE TABLE widget_facts (id uuid PRIMARY KEY)`;
      await tx.$executeRaw`
        ALTER TABLE orders
        ADD COLUMN widget_fact_id uuid REFERENCES widget_facts (id) ON DELETE SET NULL
      `;
      await expect(removeRowsBlockingRequiredColumns(tx, [
        unlinked,
        { table: 'widget_facts', requiredColumn: 'required_run_id', reason },
      ])).rejects.toThrow(
        'Required-column cleanup refuses deletes that reach ADR-0010 kept tables: '
          + 'widget_facts -> orders (on delete set null).',
      );

      // Neither refused run deleted the listed rows that lack their column.
      await expect(rowCounts(tx, ['naver_keyword_daily_snapshots'])).resolves.toEqual({
        naver_keyword_daily_snapshots: SEEDED.naver_keyword_daily_snapshots,
      });
      throw new Error(rollback);
    }, { timeout: 30_000 })).rejects.toThrow(rollback);

    await expect(tablesWithRequiredColumn(prisma)).resolves.toEqual([...TABLES].sort());
  });
});

/**
 * The Office deployer runs `check:cutover-data-blockers` between the pre-schema
 * phase and `db push`, and stops on any non-zero exit. This runs the same
 * survey against a database of its own in the same container, where the listed
 * tables have the Office 0.1.30 shape for good.
 */
describe('cutover data survey around v0.1.31:014 (PostgreSQL)', () => {
  const surveyDatabase = 'kiditem_test_cutover_survey';
  let admin: PrismaClient | undefined;
  let survey: PrismaClient | undefined;
  let surveyUrl = '';

  beforeAll(async () => {
    admin = makeTestPrisma();
    await admin.$connect();
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.pathname = `/${surveyDatabase}`;
    surveyUrl = url.toString();
    await admin.$executeRaw`DROP DATABASE IF EXISTS ${Prisma.raw(surveyDatabase)} WITH (FORCE)`;
    await admin.$executeRaw`CREATE DATABASE ${Prisma.raw(surveyDatabase)}`;
    execFileSync(process.execPath, [prismaCli(), 'db', 'push'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: surveyUrl },
      stdio: 'inherit',
      timeout: 180_000,
    });
    survey = new PrismaClient({ adapter: new PrismaPg({ connectionString: surveyUrl }) });
    await survey.$connect();
  }, 240_000);

  afterAll(async () => {
    await survey?.$disconnect();
    if (!admin) return;
    await admin.$executeRaw`DROP DATABASE IF EXISTS ${Prisma.raw(surveyDatabase)} WITH (FORCE)`;
    await admin.$disconnect();
  }, 60_000);

  it('stops the cutover while listed rows lack their required column, and passes once 014 has run', async () => {
    const db = survey!;
    await db.organization.create({
      data: { id: TEST_ORGANIZATION_ID, name: 'Survey Co', slug: 'survey-co' },
    });
    await seedOrganization(db, TEST_ORGANIZATION_ID, ['pencil'], 2);
    for (const table of TABLES) {
      await db.$executeRaw`ALTER TABLE ${Prisma.raw(table)} DROP COLUMN ${Prisma.raw(REQUIRED[table])}`;
    }

    const before = runSurvey(surveyUrl);
    expect(before.status, before.stderr).toBe(1);
    expect(before.report.blockers.map((item) => `${item.kind} ${item.table}.${item.column}`).sort())
      .toEqual(TABLES.map((table) => `not-null ${table}.${REQUIRED[table]}`).sort());
    expect(before.report.blockers.every((item) => (item.rows ?? 0) > 0)).toBe(true);
    expect(before.report.pending.map((item) => `${item.table} [${(item.missing ?? []).join(', ')}]`).sort())
      .toEqual(TABLES.map((table) => `${table} [${REQUIRED[table]}]`).sort());

    await expect(db.$transaction((tx) => removeRowsBlockingRequiredColumnsMigration.run(tx)))
      .resolves.toMatchObject({ affectedRows: SOURCING_TABLES.length + 2 });

    const after = runSurvey(surveyUrl);
    expect(after.status, after.stderr).toBe(0);
    expect(after.report).toMatchObject({ blockers: [], pending: [] });
  }, 240_000);
});

type SurveyItem = {
  kind: string;
  table: string;
  column?: string;
  rows?: number;
  missing?: string[];
};

function runSurvey(databaseUrl: string): {
  status: number | null;
  stderr: string;
  report: { blockers: SurveyItem[]; pending: SurveyItem[] };
} {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'check-cutover-data-blockers.mjs'), '--json'],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  const report = result.status === 0 || result.status === 1
    ? JSON.parse(result.stdout) as { blockers: SurveyItem[]; pending: SurveyItem[] }
    : { blockers: [], pending: [] };
  return { status: result.status, stderr: result.stderr, report };
}

function prismaCli(): string {
  return createRequire(path.join(repoRoot, 'package.json')).resolve('prisma/build/index.js');
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
    systemSettings: await db.systemSetting.count(),
  };
}

async function tablesWithRequiredColumn(db: Prisma.TransactionClient): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT c.table_name::text AS table_name
    FROM unnest(${TABLES}::text[], ${TABLES.map((table) => REQUIRED[table])}::text[])
      AS entry(table_name, column_name)
    JOIN information_schema.columns c
      ON c.table_schema = current_schema()
     AND c.table_name::text = entry.table_name
     AND c.column_name::text = entry.column_name
    ORDER BY 1
  `;
  return rows.map((row) => row.table_name);
}

/** Seeds one organization's rows and returns its alert ids. */
async function seedOrganization(
  db: PrismaClient,
  organizationId: string,
  naverKeywords: string[],
  alertCount: number,
): Promise<string[]> {
  const idempotencyKey = randomUUID();
  const run = await db.sourcingEvidenceIngestionRun.create({
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
    await db.naverKeywordDailySnapshot.create({ data: { ...observed, keyword } });
  }
  await db.naverPopularKeywordDailySnapshot.create({
    data: { ...observed, boardKey: 'stationery', rank: 1, keyword: 'pencil case' },
  });
  await db.shortsTrendDailySnapshot.create({
    data: { ...observed, videoKey: 'kid-239-video' },
  });
  await db.liveCommerceBroadcastDailySnapshot.create({
    data: { ...observed, source: 'douyin', broadcastId: 'kid-239-broadcast' },
  });
  await db.liveCommerceProductDailySnapshot.create({
    data: {
      ...observed,
      source: 'douyin',
      broadcastId: 'kid-239-broadcast',
      productId: 'kid-239-product',
    },
  });
  await db.tiktokCreativeTrendDailySnapshot.create({
    data: { ...observed, region: 'KR', trendType: 'hashtag', entityKey: 'kid-239-hashtag' },
  });
  const alertIds: string[] = [];
  for (let index = 0; index < alertCount; index += 1) {
    const alert = await db.alert.create({
      data: { organizationId, type: 'batch_summary', title: `KID-239 alert ${index + 1}` },
    });
    alertIds.push(alert.id);
  }
  // Neighbouring tables outside the list.
  await db.trendSeedKeyword.create({ data: { organizationId, keyword: 'pencil' } });
  await db.systemSetting.create({
    data: { organizationId, key: 'kid-239.neighbour', value: { kept: true } },
  });
  return alertIds;
}
