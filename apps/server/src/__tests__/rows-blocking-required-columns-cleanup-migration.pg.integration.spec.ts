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
  TEST_USER_ID,
} from '../test-helpers/real-prisma';
import {
  foreignKeysInto,
  referencingColumn,
  tablesDeletedBy,
} from '../../../../scripts/data-migrations/helpers/dependent-row-removal';
import { removeRowsBlockingRequiredColumns } from '../../../../scripts/data-migrations/helpers/required-column-row-cleanup';
import { ensureSourceImportRunStatusCheck } from '../../../../scripts/data-migrations/helpers/source-import-run-status-check';
import {
  type UniqueKeyCleanupDetails,
  uniqueKeyPredicateText,
} from '../../../../scripts/data-migrations/helpers/unique-key-row-cleanup';
import { removeRetiredOperationAlerts } from '../../../../scripts/data-migrations/v0.1.31/005_remove_retired_operation_alerts';
import {
  removeRowsBlockingRequiredColumnsMigration,
  REQUIRED_COLUMN_CLEANUPS,
  UNIQUE_KEY_CLEANUPS,
  UNIQUE_KEYS_WITHOUT_CLEANUP,
} from '../../../../scripts/data-migrations/v0.1.31/014_remove_rows_blocking_required_columns';

type Table = (typeof REQUIRED_COLUMN_CLEANUPS)[number]['table'];

const repoRoot = path.resolve(__dirname, '../../../..');
const RUNS = 'sourcing_evidence_ingestion_runs';
const IMPORT_RUNS = 'source_import_runs';
const TABLES: Table[] = REQUIRED_COLUMN_CLEANUPS.map((cleanup) => cleanup.table);
/** The tables whose required column has no database default. */
const ROW_TABLES = TABLES.filter((table) => table !== RUNS);
const SOURCING_TABLES = ROW_TABLES.filter((table) => table !== 'alerts');
const REQUIRED = Object.fromEntries(
  REQUIRED_COLUMN_CLEANUPS.map((cleanup) => [cleanup.table, cleanup.requiredColumn]),
) as Record<Table, string>;
/** The type `db push` gives each required column. */
const REQUIRED_TYPE = Object.fromEntries(
  TABLES.map((table) => [table, table === 'alerts' ? 'text' : table === RUNS ? 'boolean' : 'uuid']),
) as Record<Table, 'text' | 'uuid' | 'boolean'>;
const RUN_DEPENDENTS = REQUIRED_COLUMN_CLEANUPS.find((cleanup) => cleanup.table === RUNS)!.dependents!;
const RUN_DEPENDENT_TABLES = [...new Set(RUN_DEPENDENTS.map((step) => step.table))];
const IMPORT_RUN_STEPS = UNIQUE_KEY_CLEANUPS[0]!.dependents!;
const NEW_UNIQUE_KEYS = [
  ...UNIQUE_KEY_CLEANUPS.map((cleanup) => cleanup.index),
  ...Object.keys(UNIQUE_KEYS_WITHOUT_CLEANUP),
];
/** Every unique key v0.1.31 adds to source_import_runs, the three a new column makes safe included. */
const IMPORT_RUN_KEYS = [
  ...UNIQUE_KEY_CLEANUPS.map((cleanup) => cleanup.index),
  'source_import_runs_source_idempotency_key',
  'source_import_runs_keyword_serp_running_key',
  'source_import_runs_keyword_serp_generation_key',
];
/** The source_import_runs columns v0.1.31 adds that those three keys index. */
const NEW_IMPORT_RUN_KEY_COLUMNS = { idempotency_key: 'varchar(128)', rank_keyword: 'text' } as const;
const CURRENT_COMPLETE_KEY = 'sourcing_evidence_ingestion_runs_one_current_complete_key';

const BUSINESS_DATE = new Date('2026-09-01T00:00:00.000Z');
const CAPTURED_AT = new Date('2026-09-01T03:00:00.000Z');
const ROLLBACK = 'restore the pushed schema';

/** Rows seeded per table across both organizations. */
const SEEDED: Record<Table, number> = {
  naver_keyword_daily_snapshots: 3,
  naver_popular_keyword_daily_snapshots: 2,
  shorts_trend_daily_snapshots: 2,
  live_commerce_broadcast_daily_snapshots: 2,
  live_commerce_product_daily_snapshots: 2,
  tiktok_creative_trend_daily_snapshots: 2,
  alerts: 5,
  [RUNS]: 2,
};

type ResultDetails = {
  requiredColumns: Record<string, unknown>;
  uniqueKeys: Record<string, UniqueKeyCleanupDetails>;
};

const shape = (table: Table, tablePresent: boolean, requiredColumnPresent: boolean, deletedRows: number) => ({
  requiredColumn: REQUIRED[table],
  tablePresent,
  requiredColumnPresent,
  deletedRows,
  ...(table === RUNS ? { dependentRows: {} } : {}),
});
const kept = (table: Table) => shape(table, true, true, 0);
const deleted = (table: Table, deletedRows: number) => shape(table, true, false, deletedRows);
const absent = (table: Table) => shape(table, false, false, 0);
const untouchedKey = (): UniqueKeyCleanupDetails => ({
  table: IMPORT_RUNS,
  tablePresent: true,
  indexPresent: false,
  duplicateGroups: 0,
  deletedRows: 0,
  neutralizedRows: 0,
  dependentRows: {},
  unlinkedRows: {},
  keptReferences: {},
});
const indexedKeys = () => Object.fromEntries(UNIQUE_KEY_CLEANUPS.map(({ index }) => [index, {
  ...untouchedKey(),
  indexPresent: true,
}]));

/** The registered migration, with its two lists' details apart. */
async function runMigration(tx: Prisma.TransactionClient): Promise<{ affectedRows: number } & ResultDetails> {
  const result = await removeRowsBlockingRequiredColumnsMigration.run(tx);
  return { affectedRows: result.affectedRows, ...(result.details as ResultDetails) };
}

/**
 * v0.1.31:014 runs before `db push` adds each listed table's required column
 * and each new unique index. The pushed schema already has every column and
 * index, so that is the state a database past the schema step is in. The
 * Office 0.1.30 shape is recreated inside transactions that always roll back.
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

  it('lists pushed tables whose required column has no database default and that no foreign key references, then the ingestion runs', async () => {
    const columns = await requiredColumns(prisma);
    // NOT NULL with no database default: `db push` cannot fill existing rows.
    // The ingestion-run marker has a default; old runs go because v0.1.31
    // cannot read them.
    expect(columns).toEqual([...TABLES].sort().map((table) => ({
      table_name: table,
      column_name: REQUIRED[table],
      is_nullable: 'NO',
      column_default: table === RUNS ? 'false' : null,
      data_type: REQUIRED_TYPE[table],
    })));

    const references = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT conrelid::regclass::text AS table_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid::regclass::text = ANY(${ROW_TABLES}::text[])
    `;
    expect(references).toEqual([]);
  });

  it('declares exactly the foreign keys the pushed schema has into the ingestion-run chain', async () => {
    const foreignKeys = await foreignKeysInto(prisma, [RUNS, ...RUN_DEPENDENT_TABLES]);
    const live = foreignKeys
      .map((foreignKey) => `${foreignKey.childTable}.${referencingColumn(foreignKey)} -> ${foreignKey.parentTable}`)
      .sort();
    const declared = RUN_DEPENDENTS.map((step) => `${step.table}.${step.column} -> ${step.references}`).sort();

    expect(live).toEqual(declared);
    expect(live.length).toBeGreaterThan(30);
  });

  it('declares every foreign key the pushed schema has into import runs and the rows a removed run takes with it', async () => {
    const foreignKeys = await foreignKeysInto(prisma, tablesDeletedBy(IMPORT_RUNS, IMPORT_RUN_STEPS));
    const live = foreignKeys
      .map((foreignKey) => `${foreignKey.childTable}.${referencingColumn(foreignKey)} -> ${foreignKey.parentTable}`)
      .sort();
    const declared = IMPORT_RUN_STEPS.map((step) => `${step.table}.${step.column} -> ${step.references}`).sort();

    expect(live.filter((link) => !declared.includes(link))).toEqual([]);
    // Pre-schema 014 still handles the Office KPI and legacy SKU tables;
    // later v0.1.31 schema/cutover steps retire them. The Channels keys are
    // Office 0.1.30 keys KID-297 replaced with scalar ids (OFFICE_ONLY_KEYS,
    // plus the serp-capture key this release never declares as a key).
    // review_collection_chunks is the Office review chunk store KID-359 drops
    // (operation chunks replace it); 014 still clears it before the push.
    expect(declared.filter((link) => !live.includes(link))).toEqual([
      'channel_account_daily_kpi_snapshots.raw_snapshot_id -> channel_scrape_snapshots',
      'channel_ad_target_daily_snapshots.raw_snapshot_id -> channel_scrape_snapshots',
      'channel_listing_options.last_import_run_id -> source_import_runs',
      'channel_listings.last_import_run_id -> source_import_runs',
      'channel_scrape_runs.source_import_run_id -> source_import_runs',
      'channel_scrape_snapshots.source_import_run_id -> source_import_runs',
      'review_collection_chunks.source_import_run_id -> source_import_runs',
      'sellpia_inventory_skus.last_import_run_id -> source_import_runs',
    ]);
    // 36 keys once the Channels boundary keeps scalar ids (KID-297).
    expect(live.length).toBeGreaterThan(30);
  });

  it('deletes nothing on the pushed schema, where every table has its required column and every key its index', async () => {
    const carried = await carriedCounts(prisma);

    await expect(prisma.$transaction((tx) => runMigration(tx))).resolves.toEqual({
      affectedRows: 0,
      requiredColumns: Object.fromEntries(TABLES.map((table) => [table, kept(table)])),
      uniqueKeys: indexedKeys(),
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
        [RUNS]: kept(RUNS),
      };
      await expect(runMigration(tx)).resolves.toEqual({
        affectedRows: 13,
        requiredColumns: first,
        uniqueKeys: indexedKeys(),
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

      await expect(runMigration(tx)).resolves.toEqual({
        affectedRows: 0,
        requiredColumns: {
          ...first,
          naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 0),
          naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 0),
          live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 0),
          tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 0),
          alerts: deleted('alerts', 0),
        },
        uniqueKeys: indexedKeys(),
      });

      // What `db push` does next: add the column as NOT NULL with no default,
      // which PostgreSQL accepts only on a table without rows.
      for (const table of [...unlinked, 'alerts'] as Table[]) {
        await tx.$executeRaw`
          ALTER TABLE ${Prisma.raw(table)}
          ADD COLUMN ${Prisma.raw(REQUIRED[table])} ${Prisma.raw(REQUIRED_TYPE[table])} NOT NULL
        `;
      }
      throw new Error(ROLLBACK);
    }, { timeout: 30_000 })).rejects.toThrow(ROLLBACK);

    await expect(tablesWithRequiredColumn(prisma)).resolves.toEqual([...TABLES].sort());
    await expect(rowCounts(prisma, TABLES)).resolves.toEqual(SEEDED);
  });

  it('deletes pre-cutover ingestion runs with every row that depends on them, as the owner approved, and nothing else', async () => {
    const carried = await carriedCounts(prisma);

    await expect(prisma.$transaction(async (tx) => {
      const chain = await seedIngestionRunChain(tx);
      const parentsBefore = await sourcingParentCounts(tx);
      // Office 0.1.30 runs: no current-complete marker, and no key over it.
      await tx.$executeRaw`ALTER TABLE sourcing_evidence_ingestion_runs DROP COLUMN is_current_complete`;
      await expect(indexExists(tx, CURRENT_COMPLETE_KEY)).resolves.toBe(false);

      const dependentRows = {
        procurement_test_intents: 1,
        sourcing_decision_evidence: 1,
        sourcing_decision_batch_items: 1,
        sourcing_launch_candidates: 1,
        supplier_offer_price_tiers: 1,
        supplier_offer_sku_snapshots: 1,
        sourcing_review_batch_items: 1,
        sourcing_recommendation_item_evidence: 1,
        sourcing_validation_check_evidence: 1,
        sourcing_market_shadow_facts: 1,
        sourcing_1688_offer_keyword_observations: 1,
        sourcing_evidence_observations: 3,
        // The seeded snapshot rows name the base runs, so they go with them.
        ...Object.fromEntries(SOURCING_TABLES.map((table) => [table, SEEDED[table]])),
      };
      await expect(runMigration(tx)).resolves.toEqual({
        affectedRows: 4 + 14 + 13,
        requiredColumns: {
          ...Object.fromEntries(ROW_TABLES.map((table) => [table, kept(table)])),
          [RUNS]: { ...deleted(RUNS, 4), dependentRows },
        },
        uniqueKeys: indexedKeys(),
      });

      await expect(rowCounts(tx, [RUNS, ...SOURCING_TABLES])).resolves.toEqual(
        Object.fromEntries([RUNS, ...SOURCING_TABLES].map((table) => [table, 0])),
      );
      await expect(rowCounts(tx, RUN_DEPENDENT_TABLES as Table[])).resolves.toEqual(
        Object.fromEntries(RUN_DEPENDENT_TABLES.map((table) => [
          table,
          table === 'sourcing_decision_batch_items' ? 1 : 0,
        ])),
      );
      // The decision without an offer or launch pointer stays with its batch,
      // and so do the parents the deleted rows pointed at.
      await expect(tx.sourcingDecisionBatchItem.findMany({ select: { id: true } }))
        .resolves.toEqual([{ id: chain.decisionItemWithoutOffer }]);
      await expect(sourcingParentCounts(tx)).resolves.toEqual(parentsBefore);
      await expect(carriedCounts(tx)).resolves.toEqual(carried);
      await expect(rowCounts(tx, ['alerts'])).resolves.toEqual({ alerts: SEEDED.alerts });

      // A second run finds nothing left.
      await expect(runMigration(tx)).resolves.toEqual({
        affectedRows: 0,
        requiredColumns: {
          ...Object.fromEntries(ROW_TABLES.map((table) => [table, kept(table)])),
          [RUNS]: deleted(RUNS, 0),
        },
        uniqueKeys: indexedKeys(),
      });

      // What `db push` does next.
      await tx.$executeRaw`
        ALTER TABLE sourcing_evidence_ingestion_runs
        ADD COLUMN is_current_complete boolean NOT NULL DEFAULT false
      `;
      await tx.$executeRaw`
        CREATE UNIQUE INDEX sourcing_evidence_ingestion_runs_one_current_complete_key
        ON sourcing_evidence_ingestion_runs (organization_id, source_key, scope_key, target_key)
        WHERE is_current_complete = true
      `;
      throw new Error(ROLLBACK);
    }, { timeout: 60_000 })).rejects.toThrow(ROLLBACK);

    await expect(tablesWithRequiredColumn(prisma)).resolves.toEqual([...TABLES].sort());
    await expect(rowCounts(prisma, TABLES)).resolves.toEqual(SEEDED);
    await expect(indexExists(prisma, CURRENT_COMPLETE_KEY)).resolves.toBe(true);
  });

  it('refuses a foreign key into the ingestion-run chain that no dependent declares, before any delete', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE sourcing_evidence_ingestion_runs DROP COLUMN is_current_complete`;
      for (const table of ROW_TABLES) {
        await tx.$executeRaw`ALTER TABLE ${Prisma.raw(table)} DROP COLUMN ${Prisma.raw(REQUIRED[table])}`;
      }
      await tx.$executeRaw`
        CREATE TABLE kid239_run_notes (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL,
          ingestion_run_id uuid NOT NULL,
          FOREIGN KEY (ingestion_run_id, organization_id)
            REFERENCES sourcing_evidence_ingestion_runs (id, organization_id)
        )
      `;

      await expect(runMigration(tx)).rejects.toThrow(
        'Required-column cleanup for sourcing_evidence_ingestion_runs refuses foreign keys its dependents '
          + 'do not declare: kid239_run_notes.ingestion_run_id -> sourcing_evidence_ingestion_runs.',
      );
      // The refusal came before the listed tables lost their rows.
      await expect(rowCounts(tx, TABLES)).resolves.toEqual(SEEDED);
      throw new Error(ROLLBACK);
    }, { timeout: 30_000 })).rejects.toThrow(ROLLBACK);
  });

  it('leaves signal alerts alone once dedupe_key exists', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signal'`;
      for (const table of SOURCING_TABLES) {
        await tx.$executeRaw`ALTER TABLE ${Prisma.raw(table)} DROP COLUMN ingestion_run_id`;
      }

      await expect(runMigration(tx)).resolves.toEqual({
        affectedRows: 13,
        requiredColumns: {
          ...Object.fromEntries(SOURCING_TABLES.map((table) => [table, deleted(table, SEEDED[table])])),
          alerts: kept('alerts'),
          [RUNS]: kept(RUNS),
        },
        uniqueKeys: indexedKeys(),
      });
      const [signal] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM alerts WHERE kind = 'signal' AND dedupe_key IS NOT NULL
      `;
      expect(Number(signal?.count)).toBe(SEEDED.alerts);
      throw new Error(ROLLBACK);
    }, { timeout: 30_000 })).rejects.toThrow(ROLLBACK);

    await expect(rowCounts(prisma, TABLES)).resolves.toEqual(SEEDED);
  });

  it('refuses, before any delete, a listed table whose delete would reach an ADR-0010 kept table', async () => {
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
      throw new Error(ROLLBACK);
    }, { timeout: 30_000 })).rejects.toThrow(ROLLBACK);

    await expect(tablesWithRequiredColumn(prisma)).resolves.toEqual([...TABLES].sort());
  });
});

/**
 * The unique keys v0.1.31 adds to `source_import_runs`. On the pushed schema
 * every index exists; the Office 0.1.30 shape drops them inside transactions
 * that always roll back. 012's status constraint is in place, as the global
 * setup applies it after every push.
 */
describe('v0.1.31:014 unique keys on source_import_runs (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('lists each key as the pushed index declares it, and finds every other new unique key', async () => {
    const pushed = await indexDefinitions(prisma, UNIQUE_KEY_CLEANUPS.map((cleanup) => cleanup.index));

    await expect(prisma.$transaction(async (tx) => {
      for (const [position, cleanup] of UNIQUE_KEY_CLEANUPS.entries()) {
        const probe = `kid239_probe_${position}`;
        const columns = cleanup.columns.map((column) => `"${column}"`).join(', ');
        await tx.$executeRaw`
          CREATE UNIQUE INDEX ${Prisma.raw(probe)} ON ${Prisma.raw(cleanup.table)} (${Prisma.raw(columns)})
          WHERE ${Prisma.raw(uniqueKeyPredicateText(cleanup))}
        `;
        const [probed] = Object.values(await indexDefinitions(tx, [probe]));
        expect(probed?.replace(probe, cleanup.index), cleanup.index).toBe(pushed[cleanup.index]);
      }
      throw new Error(ROLLBACK);
    }, { timeout: 30_000 })).rejects.toThrow(ROLLBACK);

    const unique = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT ic.relname::text AS name
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indisunique AND ic.relname::text = ANY(${NEW_UNIQUE_KEYS}::text[])
    `;
    expect(unique.map((row) => row.name).sort()).toEqual([...NEW_UNIQUE_KEYS].sort());
    expect(NEW_UNIQUE_KEYS).toHaveLength(43);
  });

  it('on the Office 0.1.30 shape, keeps the newest run of each key, removes the rest with what they take along, and lets every key be created', async () => {
    await expect(prisma.$transaction(async (tx) => {
      const definitions = await indexDefinitions(tx, IMPORT_RUN_KEYS);
      await officeImportRunShape(tx);
      const seeded = await seedImportRunDuplicates(tx);
      const statusesBefore = await importRunStatuses(tx);

      const first = await runMigration(tx);
      expect(first.affectedRows).toBe(EXPECTED_IMPORT_RUN_CHANGES);
      expect(first.requiredColumns).toEqual(Object.fromEntries(TABLES.map((table) => [table, kept(table)])));
      expect(first.uniqueKeys).toEqual(Object.fromEntries(UNIQUE_KEY_CLEANUPS.map(({ index }) => [
        index,
        { ...untouchedKey(), ...(CHANGED_IMPORT_RUN_KEYS[index as keyof typeof CHANGED_IMPORT_RUN_KEYS] ?? {}) },
      ])));

      // Survivors are the newest run, or the highest id on a tie. Runs a kept
      // row cites stay as failed on a running key; rows outside a predicate or
      // with a NULL key column are untouched.
      const statuses = await importRunStatuses(tx);
      expect(Object.keys(statuses).sort()).toEqual(
        Object.keys(statusesBefore).filter((id) => !seeded.deleted.includes(id)).sort(),
      );
      for (const id of seeded.deleted) expect(statuses[id], id).toBeUndefined();
      for (const id of seeded.neutralized) expect(statuses[id], id).toBe('failed');
      for (const id of seeded.untouched) expect(statuses[id], id).toBe(statusesBefore[id]);
      // ADR-0010 kept rows stay: the running key's order still cites its run,
      // the generation key's order and the receipt lost only their pointers.
      await expect(tx.order.findMany({ select: { externalOrderId: true, sourceImportRunId: true }, orderBy: { externalOrderId: 'asc' } }))
        .resolves.toEqual([
          { externalOrderId: 'kid-239-cited-order', sourceImportRunId: seeded.neutralized[0] },
          { externalOrderId: 'kid-239-generation-order', sourceImportRunId: null },
        ]);
      await expect(tx.coupangDirectTransportReceipt.findMany({ select: { rocketPurchaseConfirmationId: true } }))
        .resolves.toEqual([{ rocketPurchaseConfirmationId: null }]);
      await expect(tx.coupangDirectTransportConsumption.count()).resolves.toBe(1);
      // The owner-approved cascade: the removed run's Rocket confirmation chain
      // and the scrape run that cited the removed item-winner attempt.
      await expect(tx.rocketPurchaseConfirmation.count()).resolves.toBe(0);
      await expect(tx.rocketPurchaseConfirmationLine.count()).resolves.toBe(0);
      await expect(tx.rocketPurchaseConfirmationTransmission.count()).resolves.toBe(0);
      await expect(tx.channelScrapeRun.count()).resolves.toBe(0);

      // Idempotent before `db push`: nothing is left to reduce.
      const second = await runMigration(tx);
      expect(second.affectedRows).toBe(0);
      expect(second.uniqueKeys).toEqual(Object.fromEntries(UNIQUE_KEY_CLEANUPS.map(({ index }) => [
        index,
        untouchedKey(),
      ])));

      // What `db push` does next: the new columns, then every new key.
      for (const [column, type] of Object.entries(NEW_IMPORT_RUN_KEY_COLUMNS)) {
        await tx.$executeRaw`ALTER TABLE source_import_runs ADD COLUMN ${Prisma.raw(column)} ${Prisma.raw(type)}`;
      }
      for (const index of IMPORT_RUN_KEYS) await tx.$executeRaw`${Prisma.raw(definitions[index]!)}`;

      // Once the keys exist, nothing is read or changed.
      await expect(runMigration(tx)).resolves.toEqual({
        affectedRows: 0,
        requiredColumns: Object.fromEntries(TABLES.map((table) => [table, kept(table)])),
        uniqueKeys: indexedKeys(),
      });
      throw new Error(ROLLBACK);
    }, { timeout: 60_000 })).rejects.toThrow(ROLLBACK);

    await expect(indexDefinitions(prisma, IMPORT_RUN_KEYS).then((found) => Object.keys(found).sort()))
      .resolves.toEqual([...IMPORT_RUN_KEYS].sort());
    await expect(prisma.sourceImportRun.count()).resolves.toBe(0);
  });

  it('stops on a duplicated generation that a Coupang direct transport consumption cites, and changes nothing', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await officeImportRunShape(tx);
      const account = await createAccount(tx, TEST_ORGANIZATION_ID, 'generation');
      const rocket = { sourceType: 'coupang_rocket_po_catalog', channelAccountId: account, status: 'completed' };
      const newer = await createImportRun(tx, { ...rocket, freshnessGeneration: 4n, minute: 2 });
      const consumed = await createImportRun(tx, { ...rocket, freshnessGeneration: 4n, minute: 1 });
      const effect = await createImportRun(tx, { sourceType: 'coupang_direct_orders', channelAccountId: account, status: 'completed', minute: 1 });
      const receipt = await createReceipt(tx, account, effect);
      await tx.coupangDirectTransportConsumption.create({
        data: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: consumed, receiptId: receipt, transport: 'SHIPMENT' },
      });
      const before = await importRunStatuses(tx);

      await expect(runMigration(tx)).rejects.toThrow(
        'Unique-key cleanup for source_import_runs_rocket_po_generation_key cannot remove a duplicate row that '
          + 'ADR-0010 kept rows reference: coupang_direct_transport_consumptions.source_import_run_id (1). '
          + "The migration's transaction rolls back.",
      );
      await expect(importRunStatuses(tx)).resolves.toEqual(before);
      expect(Object.keys(before).sort()).toEqual([newer, consumed, effect].sort());
      throw new Error(ROLLBACK);
    }, { timeout: 30_000 })).rejects.toThrow(ROLLBACK);
  });
});

/**
 * The Office deployer runs `check:cutover-data-blockers` between the pre-schema
 * phase and `db push`, and stops on any non-zero exit. This runs the same
 * survey against a database of its own in the same container, where the listed
 * tables and source_import_runs have the Office 0.1.30 shape for good.
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
    // As v0.1.31:012 leaves the database before 014 runs.
    await survey.$transaction((tx) => ensureSourceImportRunStatusCheck(tx));
  }, 240_000);

  afterAll(async () => {
    await survey?.$disconnect();
    if (!admin) return;
    await admin.$executeRaw`DROP DATABASE IF EXISTS ${Prisma.raw(surveyDatabase)} WITH (FORCE)`;
    await admin.$disconnect();
  }, 60_000);

  it('stops the cutover while listed rows lack their required column or duplicate a new key, and passes once 014 has run', async () => {
    const db = survey!;
    await seedBaseFixture(db);
    await seedOrganization(db, TEST_ORGANIZATION_ID, ['pencil'], 2);
    const definitions = await indexDefinitions(db, [...IMPORT_RUN_KEYS, CURRENT_COMPLETE_KEY]);
    await db.$transaction(async (tx) => {
      await officeImportRunShape(tx);
      await seedImportRunDuplicates(tx);
      for (const table of TABLES) {
        await tx.$executeRaw`ALTER TABLE ${Prisma.raw(table)} DROP COLUMN ${Prisma.raw(REQUIRED[table])}`;
      }
    }, { timeout: 30_000 });

    const before = runSurvey(surveyUrl);
    expect(before.status, before.stderr).toBe(1);
    expect(before.report.blockers.map(describeItem).sort()).toEqual([
      ...ROW_TABLES.map((table) => `not-null ${table}.${REQUIRED[table]}`),
      'unique source_import_runs_ad_keyword_running_key',
      'unique source_import_runs_ads_daily_running_key',
      'unique source_import_runs_rocket_po_generation_key',
      'unique source_import_runs_sellpia_sales_running_key',
      'unique source_import_runs_shipment_summary_generation_key',
      'unique source_import_runs_wing_itemwinner_running_key',
    ].sort());
    expect(before.report.blockers.every((item) => (item.rows ?? 0) > 0)).toBe(true);
    expect(before.report.pending.map((item) => `${item.table} [${(item.missing ?? []).join(', ')}]`).sort())
      .toEqual(ROW_TABLES.map((table) => `${table} [${REQUIRED[table]}]`).sort());

    const cleaned = await db.$transaction((tx) => runMigration(tx), { timeout: 60_000 });
    // Seven row tables (eight rows), the one base ingestion run, and the import-run changes.
    expect(cleaned.affectedRows).toBe(8 + 1 + EXPECTED_IMPORT_RUN_CHANGES);

    const after = runSurvey(surveyUrl);
    expect(after.status, after.stderr).toBe(0);
    expect(after.report).toMatchObject({ blockers: [], pending: [] });

    // The statements `db push` would run for these tables now succeed.
    await db.$transaction(async (tx) => {
      for (const table of TABLES) {
        const definition = table === RUNS
          ? `${REQUIRED_TYPE[table]} NOT NULL DEFAULT false`
          : `${REQUIRED_TYPE[table]} NOT NULL`;
        await tx.$executeRaw`
          ALTER TABLE ${Prisma.raw(table)} ADD COLUMN ${Prisma.raw(REQUIRED[table])} ${Prisma.raw(definition)}
        `;
      }
      for (const [column, type] of Object.entries(NEW_IMPORT_RUN_KEY_COLUMNS)) {
        await tx.$executeRaw`ALTER TABLE source_import_runs ADD COLUMN ${Prisma.raw(column)} ${Prisma.raw(type)}`;
      }
      for (const index of [...IMPORT_RUN_KEYS, CURRENT_COMPLETE_KEY]) {
        await tx.$executeRaw`${Prisma.raw(definitions[index]!)}`;
      }
    });
    await expect(indexDefinitions(db, [...IMPORT_RUN_KEYS, CURRENT_COMPLETE_KEY]))
      .resolves.toEqual(definitions);
  }, 240_000);
});

type SurveyItem = {
  kind: string;
  table: string;
  name?: string;
  column?: string;
  rows?: number;
  missing?: string[];
};

function describeItem(item: SurveyItem): string {
  return item.kind === 'unique' ? `unique ${item.name}` : `${item.kind} ${item.table}.${item.column}`;
}

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

type Db = Prisma.TransactionClient | PrismaClient;

async function rowCounts(db: Db, tables: readonly Table[]): Promise<Partial<Record<Table, number>>> {
  const counts: Partial<Record<Table, number>> = {};
  for (const table of tables) {
    const [row] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM ${Prisma.raw(table)}
    `;
    counts[table] = Number(row?.count ?? -1);
  }
  return counts;
}

async function carriedCounts(db: Db) {
  return {
    organizations: await db.organization.count(),
    users: await db.user.count(),
    trendSeedKeywords: await db.trendSeedKeyword.count(),
    systemSettings: await db.systemSetting.count(),
  };
}

async function sourcingParentCounts(db: Db) {
  return {
    decisionBatches: await db.sourcingDecisionBatch.count(),
    reviewBatches: await db.sourcingReviewBatch.count(),
    recommendationRuns: await db.sourcingRecommendationRun.count(),
    recommendationItems: await db.sourcingRecommendationItem.count(),
    validationEpisodes: await db.sourcingValidationEpisode.count(),
    validationChecks: await db.sourcingValidationCheck.count(),
    channelAccounts: await db.channelAccount.count(),
  };
}

async function requiredColumns(db: Db) {
  return db.$queryRaw<Array<{
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
}

async function tablesWithRequiredColumn(db: Db): Promise<string[]> {
  return (await requiredColumns(db)).map((row) => row.table_name);
}

async function indexExists(db: Db, name: string): Promise<boolean> {
  return Object.keys(await indexDefinitions(db, [name])).length === 1;
}

async function indexDefinitions(db: Db, names: readonly string[]): Promise<Record<string, string>> {
  const rows = await db.$queryRaw<Array<{ name: string; definition: string }>>`
    SELECT indexname::text AS name, indexdef::text AS definition
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname::text = ANY(${[...names]}::text[])
    ORDER BY 1
  `;
  return Object.fromEntries(rows.map((row) => [row.name, row.definition]));
}

/** source_import_runs as Office 0.1.30 has it: none of the new keys, nor the columns only they index. */
/**
 * Keys the Office 0.1.30 schema has into import runs and raw snapshots that
 * this release's schema no longer declares: the Channels boundary keeps only
 * the id column and its index (KID-297, ADR-0013). 014 runs on the Office
 * schema, where its row cleanup still follows them.
 */
const OFFICE_ONLY_KEYS = [
  { table: 'channel_scrape_runs', column: 'source_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_listings', column: 'last_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_listing_options', column: 'last_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_ad_target_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
] as const;

async function officeImportRunShape(tx: Prisma.TransactionClient): Promise<void> {
  for (const index of IMPORT_RUN_KEYS) {
    await tx.$executeRaw`DROP INDEX ${Prisma.raw(`"${index}"`)}`;
  }
  for (const column of Object.keys(NEW_IMPORT_RUN_KEY_COLUMNS)) {
    await tx.$executeRaw`ALTER TABLE source_import_runs DROP COLUMN ${Prisma.raw(column)}`;
  }
  for (const key of OFFICE_ONLY_KEYS) {
    await tx.$executeRaw`
      ALTER TABLE ${Prisma.raw(key.table)}
        ADD CONSTRAINT ${Prisma.raw(`office_${key.table}_${key.column}_fkey`)}
        FOREIGN KEY (${Prisma.raw(key.column)}, organization_id)
        REFERENCES ${Prisma.raw(key.references)} (id, organization_id) ON DELETE RESTRICT
    `;
  }
}

async function importRunStatuses(db: Db): Promise<Record<string, string>> {
  const runs = await db.sourceImportRun.findMany({ select: { id: true, status: true } });
  return Object.fromEntries(runs.map((run) => [run.id, run.status]));
}

async function createAccount(tx: Prisma.TransactionClient, organizationId: string, label: string): Promise<string> {
  const account = await tx.channelAccount.create({
    data: { organizationId, channel: 'coupang', name: `KID-239 ${label}`, externalAccountId: randomUUID() },
  });
  return account.id;
}

async function createImportRun(
  tx: Prisma.TransactionClient,
  input: {
    sourceType: string;
    status: string;
    minute: number;
    organizationId?: string;
    channelAccountId?: string | null;
    freshnessGeneration?: bigint | null;
    id?: string;
  },
): Promise<string> {
  const run = await tx.sourceImportRun.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      organizationId: input.organizationId ?? TEST_ORGANIZATION_ID,
      sourceType: input.sourceType,
      channelAccountId: input.channelAccountId ?? null,
      status: input.status,
      freshnessGeneration: input.freshnessGeneration ?? null,
      createdAt: new Date(CAPTURED_AT.getTime() + input.minute * 60_000),
    },
    // Office 0.1.30 has none of v0.1.31's new columns to read back.
    select: { id: true },
  });
  return run.id;
}

async function createReceipt(tx: Prisma.TransactionClient, channelAccountId: string, effectRunId: string): Promise<string> {
  const receipt = await tx.coupangDirectTransportReceipt.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      effectSourceImportRunId: effectRunId,
      transport: 'SHIPMENT',
      payloadChecksum: 'b'.repeat(64),
      collectedLines: [],
      matchedLines: [],
      unmatchedLines: [],
    },
    select: { id: true },
  });
  return receipt.id;
}

/** A Rocket purchase confirmation with one line and one transmission, cited by `runId`. */
async function createRocketConfirmation(tx: Prisma.TransactionClient, channelAccountId: string, runId: string): Promise<string> {
  const confirmation = await tx.rocketPurchaseConfirmation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId,
      sourceImportRunId: runId,
      idempotencyKey: randomUUID(),
      requestHash: sha256(`kid-239-confirmation:${runId}`),
      confirmedBy: TEST_USER_ID,
    },
    select: { id: true },
  });
  await tx.rocketPurchaseConfirmationLine.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      confirmationId: confirmation.id,
      poLineId: 'kid-239-po-line',
      poNumber: 'kid-239-po',
      productNo: 'kid-239-product',
      productName: 'Pencil case',
      orderQuantity: 10,
      confirmedQuantity: 10,
    },
    select: { id: true },
  });
  await tx.rocketPurchaseConfirmationTransmission.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      confirmationId: confirmation.id,
      sourceImportRunId: runId,
      transport: 'SHIPMENT',
    },
    select: { id: true },
  });
  return confirmation.id;
}

/** What 014 changes in the rows `seedImportRunDuplicates` writes, key by key. */
const CHANGED_IMPORT_RUN_KEYS = {
  source_import_runs_ad_keyword_running_key: {
    duplicateGroups: 1,
    deletedRows: 1,
    neutralizedRows: 1,
    keptReferences: { 'orders.source_import_run_id': 1 },
  },
  source_import_runs_ads_daily_running_key: {
    duplicateGroups: 1,
    neutralizedRows: 1,
    keptReferences: { 'coupang_direct_transport_consumptions.source_import_run_id': 1 },
  },
  source_import_runs_wing_itemwinner_running_key: {
    duplicateGroups: 1,
    deletedRows: 1,
    dependentRows: { channel_scrape_runs: 1 },
  },
  source_import_runs_sellpia_sales_running_key: { duplicateGroups: 1, deletedRows: 1 },
  source_import_runs_rocket_po_generation_key: {
    duplicateGroups: 1,
    deletedRows: 2,
    dependentRows: {
      rocket_purchase_confirmation_lines: 1,
      rocket_purchase_confirmation_transmissions: 1,
      rocket_purchase_confirmations: 1,
    },
    unlinkedRows: {
      'coupang_direct_transport_receipts.rocket_purchase_confirmation_id': 1,
      'orders.source_import_run_id': 1,
    },
    keptReferences: {
      'coupang_direct_transport_receipts.rocket_purchase_confirmation_id': 1,
      'orders.source_import_run_id': 1,
    },
  },
  source_import_runs_shipment_summary_generation_key: { duplicateGroups: 1, deletedRows: 1 },
};
/** Six runs removed, two marked failed, four rows taken along, and two pointers cleared. */
const EXPECTED_IMPORT_RUN_CHANGES = 6 + 2 + 4 + 2;

/**
 * Duplicates under each kind of new key, as Office 0.1.30 rows would hold
 * them after 007 and 012, with the rows each outcome needs.
 */
async function seedImportRunDuplicates(tx: Prisma.TransactionClient) {
  const accountA = await createAccount(tx, TEST_ORGANIZATION_ID, 'A');
  const accountB = await createAccount(tx, TEST_ORGANIZATION_ID, 'B');
  const otherAccount = await createAccount(tx, OTHER_ORGANIZATION_ID, 'other');
  const run = (input: Parameters<typeof createImportRun>[1]) => createImportRun(tx, input);
  const adKeyword = { sourceType: 'coupang_ad_keyword', channelAccountId: accountA };

  // One running ad-keyword attempt per account: the newest stays, an older one
  // an order cites (ADR-0010 keeps orders) is marked failed, the oldest goes.
  const keywordNewest = await run({ ...adKeyword, status: 'running', minute: 3 });
  const keywordCited = await run({ ...adKeyword, status: 'running', minute: 2 });
  const keywordOldest = await run({ ...adKeyword, status: 'running', minute: 1 });
  const untouched = [
    keywordNewest,
    await run({ ...adKeyword, channelAccountId: accountB, status: 'running', minute: 1 }),
    // A NULL key column never collides.
    await run({ ...adKeyword, channelAccountId: null, status: 'running', minute: 1 }),
    await run({ ...adKeyword, channelAccountId: null, status: 'running', minute: 2 }),
    // Outside the predicate.
    await run({ ...adKeyword, status: 'completed', minute: 4 }),
    await run({ ...adKeyword, status: 'failed', minute: 5 }),
    // Another organization's attempt is its own key.
    await run({ ...adKeyword, organizationId: OTHER_ORGANIZATION_ID, channelAccountId: otherAccount, status: 'running', minute: 1 }),
  ];
  await tx.order.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA,
      externalOrderId: 'kid-239-cited-order',
      sourceImportRunId: keywordCited,
    },
    select: { id: true },
  });

  // A Coupang direct transport consumption (kept) cites the older ads-daily attempt.
  const adsNewest = await run({ sourceType: 'coupang_ads_daily', status: 'running', minute: 2 });
  const adsConsumed = await run({ sourceType: 'coupang_ads_daily', status: 'running', minute: 1 });
  const effect = await run({ sourceType: 'coupang_direct_orders', channelAccountId: accountA, status: 'completed', minute: 1 });
  const receipt = await createReceipt(tx, accountA, effect);
  await tx.coupangDirectTransportConsumption.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: adsConsumed,
      receiptId: receipt,
      transport: 'SHIPMENT',
    },
  });

  // A collected scrape run cites the older item-winner attempt and goes with it.
  const winnerNewest = await run({ sourceType: 'coupang_wing_itemwinner', channelAccountId: accountA, status: 'running', minute: 2 });
  const winnerScraped = await run({ sourceType: 'coupang_wing_itemwinner', channelAccountId: accountA, status: 'running', minute: 1 });
  await tx.channelScrapeRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA,
      sourceImportRunId: winnerScraped,
      channel: 'coupang',
      source: 'kid-239',
      pageType: 'itemwinner',
    },
    select: { id: true },
  });

  // Equal creation times: the higher id stays.
  const salesLow = await run({ id: '00000000-0000-4000-8000-000000002391', sourceType: 'sellpia_sales_daily', status: 'running', minute: 1 });
  const salesHigh = await run({ id: '00000000-0000-4000-8000-000000002392', sourceType: 'sellpia_sales_daily', status: 'running', minute: 1 });

  // A shared generation: the newest keeps it, whatever the older ones' status.
  // An older run takes its Rocket confirmation chain, and the kept receipt
  // and order that pointed at them lose only their pointers.
  const rocket = { sourceType: 'coupang_rocket_po_catalog', channelAccountId: accountA };
  const rocketNewest = await run({ ...rocket, status: 'failed', freshnessGeneration: 7n, minute: 3 });
  const rocketConfirmed = await run({ ...rocket, status: 'completed', freshnessGeneration: 7n, minute: 2 });
  const rocketOrdered = await run({ ...rocket, status: 'failed', freshnessGeneration: 7n, minute: 1 });
  const confirmation = await createRocketConfirmation(tx, accountA, rocketConfirmed);
  await tx.coupangDirectTransportReceipt.update({
    where: { id: receipt },
    data: { rocketPurchaseConfirmationId: confirmation },
    select: { id: true },
  });
  await tx.order.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA,
      externalOrderId: 'kid-239-generation-order',
      sourceImportRunId: rocketOrdered,
    },
    select: { id: true },
  });
  untouched.push(
    rocketNewest,
    await run({ ...rocket, status: 'completed', freshnessGeneration: 8n, minute: 1 }),
    await run({ ...rocket, status: 'completed', freshnessGeneration: null, minute: 1 }),
    await run({ ...rocket, status: 'completed', freshnessGeneration: null, minute: 2 }),
  );
  const shipmentNewest = await run({ sourceType: 'coupang_shipment_summary', status: 'completed', freshnessGeneration: 3n, minute: 2 });
  const shipmentOlder = await run({ sourceType: 'coupang_shipment_summary', status: 'completed', freshnessGeneration: 3n, minute: 1 });
  // The ads-daily generation key covers only runs with an account.
  untouched.push(
    shipmentNewest,
    await run({ sourceType: 'coupang_ads_daily', status: 'completed', freshnessGeneration: 5n, minute: 1 }),
    await run({ sourceType: 'coupang_ads_daily', status: 'completed', freshnessGeneration: 5n, minute: 2 }),
  );

  return {
    deleted: [keywordOldest, winnerScraped, salesLow, rocketConfirmed, rocketOrdered, shipmentOlder],
    neutralized: [keywordCited, adsConsumed],
    untouched: [...untouched, adsNewest, effect, winnerNewest, salesHigh],
  };
}

/**
 * An Office 0.1.30 evidence chain on top of the base runs: observations, a
 * keyword observation, a market shadow fact, recommendation and validation
 * links, a review hand-off, a registered supplier offer with a price tier, a
 * launch plan, two decisions, and a procurement intent.
 */
async function seedIngestionRunChain(tx: Prisma.TransactionClient) {
  const organizationId = TEST_ORGANIZATION_ID;
  const runA = await tx.sourcingEvidenceIngestionRun.create({ data: ingestionRun(organizationId, '1688.offer') });
  const runB = await tx.sourcingEvidenceIngestionRun.create({
    data: ingestionRun(OTHER_ORGANIZATION_ID, 'market_shadow_signals'),
  });
  const original = await tx.sourcingEvidenceObservation.create({ data: observation(organizationId, runA.id, 'original') });
  const revision = await tx.sourcingEvidenceObservation.create({
    data: { ...observation(organizationId, runA.id, 'revision'), revision: 2, supersedesObservationId: original.id },
  });
  const shadow = await tx.sourcingEvidenceObservation.create({
    data: observation(OTHER_ORGANIZATION_ID, runB.id, 'shadow'),
  });
  await tx.sourcingMarketShadowFact.create({
    data: {
      organizationId: OTHER_ORGANIZATION_ID,
      evidenceObservationId: shadow.id,
      ingestionRunId: runB.id,
      schemaVersion: 'kid-239/v1',
      businessDate: BUSINESS_DATE,
      document: {},
      capturedAt: CAPTURED_AT,
    },
  });
  const keyword = await tx.sourcing1688OfferKeywordObservation.create({
    data: {
      organizationId,
      evidenceObservationId: original.id,
      ingestionRunId: runA.id,
      businessDate: BUSINESS_DATE,
      sourceKeywordNormalized: 'pencil case',
      externalOfferId: 'kid-239-offer',
      capturedAt: CAPTURED_AT,
    },
  });

  const recommendationRun = await tx.sourcingRecommendationRun.create({
    data: {
      organizationId,
      policyKey: 'kid-239',
      policyVersion: 'v1',
      modelVersion: 'v1',
      calculationVersion: 'v1',
      inputManifestHash: sha256('kid-239-manifest'),
      inputManifest: {},
      status: 'complete',
      businessDate: BUSINESS_DATE,
      generatedAt: CAPTURED_AT,
      completedAt: CAPTURED_AT,
      warningCodes: [],
    },
  });
  const recommendationItem = await tx.sourcingRecommendationItem.create({
    data: {
      organizationId,
      recommendationRunId: recommendationRun.id,
      itemKey: sha256('kid-239-item'),
      sourcePlatform: '1688',
      externalOfferId: 'kid-239-offer',
      variantKeyNormalized: '',
      displayName: 'Pencil case',
      rank: 1,
      score: 80,
      grade: 'A',
      baselineAction: 'order',
      reasonCodes: [],
      riskCodes: [],
      scoreComponents: {},
      sourceSnapshot: {},
    },
  });
  await tx.sourcingRecommendationItemEvidence.create({
    data: { organizationId, recommendationItemId: recommendationItem.id, evidenceObservationId: revision.id, role: 'demand' },
  });
  const episode = await tx.sourcingValidationEpisode.create({
    data: {
      organizationId,
      recommendationRunId: recommendationRun.id,
      recommendationItemId: recommendationItem.id,
      status: 'blocked',
      policyKey: 'kid-239',
      policyVersion: 'v1',
      evidenceCutoffAt: CAPTURED_AT,
      completedAt: CAPTURED_AT,
      summary: {},
    },
  });
  const check = await tx.sourcingValidationCheck.create({
    data: { organizationId, validationEpisodeId: episode.id, checkKey: 'kid-239', status: 'passed' },
  });
  await tx.sourcingValidationCheckEvidence.create({
    data: { organizationId, validationCheckId: check.id, evidenceObservationId: original.id, role: 'supply' },
  });
  const reviewBatch = await tx.sourcingReviewBatch.create({
    data: {
      organizationId,
      recommendationRunId: recommendationRun.id,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: randomUUID(),
      requestHash: sha256('kid-239-review'),
    },
  });
  await tx.sourcingReviewBatchItem.create({
    data: {
      organizationId,
      reviewBatchId: reviewBatch.id,
      recommendationItemId: recommendationItem.id,
      offerKeywordObservationId: keyword.id,
    },
  });

  const snapshot = await tx.supplierOfferSkuSnapshot.create({
    data: {
      organizationId,
      evidenceObservationId: original.id,
      identityStatus: 'offer_only',
      sourcePlatform: '1688',
      externalOfferId: 'kid-239-offer',
      productName: 'Pencil case',
      currency: 'CNY',
      capturedAt: CAPTURED_AT,
      snapshotHash: sha256('kid-239-snapshot'),
    },
  });
  const tier = await tx.supplierOfferPriceTier.create({
    data: { organizationId, supplierOfferSkuSnapshotId: snapshot.id, minQuantity: 10, unitPriceCny: '12.30' },
  });
  const account = await createAccount(tx, organizationId, 'launch');
  const launch = await tx.sourcingLaunchCandidate.create({
    data: {
      organizationId,
      supplierOfferSkuSnapshotId: snapshot.id,
      targetChannelAccountId: account,
      candidateSeriesKey: sha256('kid-239-series'),
      revision: 1,
      identityHash: sha256('kid-239-identity'),
      name: 'Pencil case launch',
      productConceptVersionKey: 'concept-v1',
      koreanSellableBundleVersionKey: 'bundle-v1',
      launchPlanVersionKey: 'launch-v1',
      complianceAssessmentVersionKey: 'compliance-v1',
      ipClearanceVersionKey: 'ip-v1',
      qualitySpecVersionKey: 'quality-v1',
      intendedUse: 'school supplies',
      materialProfileKey: 'material-v1',
      labelingProfileKey: 'label-v1',
      unitsPerSellableBundle: 1,
      initialOrderQuantity: 10,
      targetSalePriceKrw: 9_900,
      fulfillmentMode: 'rocket',
      createdByUserId: TEST_USER_ID,
    },
  });
  const decision = await tx.sourcingDecisionBatch.create({
    data: {
      organizationId,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: randomUUID(),
      requestHash: sha256('kid-239-decision'),
      businessDate: BUSINESS_DATE,
      decisionAt: CAPTURED_AT,
      evidenceCutoffAt: CAPTURED_AT,
      policyKey: 'kid-239',
      policyVersion: 'v1',
      status: 'active',
      keyword: 'pencil case',
      modelPipeline: 'deterministic',
      modelGeneratorVersion: 'v1',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
  });
  const decisionItem = (itemKey: string, rank: number) => ({
    organizationId,
    decisionBatchId: decision.id,
    itemKey: sha256(itemKey),
    modelCandidateId: itemKey,
    displayName: 'Pencil case',
    rank,
    baselineDecision: 'test_order',
    decision: 'test_order',
    confidenceKind: 'coverage',
  });
  const offered = await tx.sourcingDecisionBatchItem.create({
    data: { ...decisionItem('offered', 1), launchCandidateId: launch.id, supplierOfferSkuSnapshotId: snapshot.id },
  });
  const withoutOffer = await tx.sourcingDecisionBatchItem.create({ data: decisionItem('without-offer', 2) });
  await tx.sourcingDecisionEvidence.create({
    data: { organizationId, decisionBatchItemId: withoutOffer.id, evidenceObservationId: revision.id, role: 'demand' },
  });
  await tx.procurementTestIntent.create({
    data: {
      organizationId,
      decisionBatchItemId: offered.id,
      launchCandidateId: launch.id,
      supplierOfferSkuSnapshotId: snapshot.id,
      selectedPriceTierId: tier.id,
      sourceRecommendationArtifactId: offered.id,
      requestedByUserId: TEST_USER_ID,
      kind: 'test_order',
      idempotencyKey: randomUUID(),
      requestHash: sha256('kid-239-intent'),
    },
  });
  return { decisionItemWithoutOffer: withoutOffer.id };
}

function ingestionRun(organizationId: string, sourceKey: string) {
  const idempotencyKey = randomUUID();
  return {
    organizationId,
    sourceKey,
    targetKey: 'kid-239',
    idempotencyKey,
    requestHash: sha256(idempotencyKey),
    collectorKey: 'kid-239-cleanup-test',
    collectorVersion: 'v1',
    triggerKind: 'manual',
    status: 'COMPLETE',
  };
}

function observation(organizationId: string, ingestionRunId: string, label: string) {
  return {
    organizationId,
    ingestionRunId,
    sourceKey: '1688.offer',
    platform: '1688',
    evidenceFamily: 'supplier_offer',
    signalRole: 'supply',
    observationKey: sha256(`kid-239-observation:${label}`),
    sourceEntityType: 'supplier_offer',
    sourceEntityKey: 'kid-239-offer',
    observationType: 'offer_snapshot',
    schemaVersion: 'kid-239/v1',
    evidenceClass: 'measured',
    observedAt: CAPTURED_AT,
    availableAt: CAPTURED_AT,
    payloadHash: sha256(`kid-239-payload:${label}`),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
      requestHash: sha256(idempotencyKey),
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
