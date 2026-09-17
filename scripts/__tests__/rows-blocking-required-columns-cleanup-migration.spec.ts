import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataMigrations } from '../data-migrations';
import { ADR_0010_KEPT_TABLES } from '../data-migrations/helpers/required-column-row-cleanup';
import {
  removeRowsBlockingRequiredColumnsMigration,
  REQUIRED_COLUMN_CLEANUPS,
} from '../data-migrations/v0.1.31/014_remove_rows_blocking_required_columns';
import {
  type FakeTableState,
  requiredColumnCleanupTransaction,
} from './fixtures/required-column-cleanup-transaction';

const repoRoot = join(__dirname, '..', '..');

/** The list as this spec pins it: table, then the column the schema requires. */
const REQUIRED = {
  naver_keyword_daily_snapshots: 'ingestion_run_id',
  naver_popular_keyword_daily_snapshots: 'ingestion_run_id',
  shorts_trend_daily_snapshots: 'ingestion_run_id',
  live_commerce_broadcast_daily_snapshots: 'ingestion_run_id',
  live_commerce_product_daily_snapshots: 'ingestion_run_id',
  tiktok_creative_trend_daily_snapshots: 'ingestion_run_id',
  alerts: 'dedupe_key',
} as const;

type Table = keyof typeof REQUIRED;

const TABLES = Object.keys(REQUIRED) as Table[];
const SOURCING_TABLES = TABLES.filter((table) => table !== 'alerts');

const PRE_SCHEMA_ROWS: Record<Table, number> = {
  naver_keyword_daily_snapshots: 4,
  naver_popular_keyword_daily_snapshots: 6,
  shorts_trend_daily_snapshots: 2,
  live_commerce_broadcast_daily_snapshots: 3,
  live_commerce_product_daily_snapshots: 5,
  tiktok_creative_trend_daily_snapshots: 1,
  // Office 0.1.30 signal alerts: v0.1.31:005 keeps them.
  alerts: 8,
};

/** Office 0.1.30 columns next to the one the schema step would add. */
const PRE_SCHEMA_COLUMNS: Record<Table, readonly string[]> = {
  naver_keyword_daily_snapshots: ['organization_id', 'keyword'],
  naver_popular_keyword_daily_snapshots: ['organization_id', 'keyword'],
  shorts_trend_daily_snapshots: ['organization_id', 'video_key'],
  live_commerce_broadcast_daily_snapshots: ['organization_id', 'broadcast_id'],
  live_commerce_product_daily_snapshots: ['organization_id', 'product_id'],
  tiktok_creative_trend_daily_snapshots: ['organization_id', 'entity_key'],
  alerts: ['organization_id', 'kind', 'is_read'],
};

const deleted = (table: Table, deletedRows: number) => ({
  requiredColumn: REQUIRED[table],
  tablePresent: true,
  requiredColumnPresent: false,
  deletedRows,
});
const kept = (table: Table) => ({
  requiredColumn: REQUIRED[table],
  tablePresent: true,
  requiredColumnPresent: true,
  deletedRows: 0,
});
const absent = (table: Table) => ({
  requiredColumn: REQUIRED[table],
  tablePresent: false,
  requiredColumnPresent: false,
  deletedRows: 0,
});

function preSchemaTable(table: Table): FakeTableState {
  return { rows: PRE_SCHEMA_ROWS[table], columns: PRE_SCHEMA_COLUMNS[table] };
}

function newSchemaTable(table: Table): FakeTableState {
  return { rows: PRE_SCHEMA_ROWS[table], columns: [...PRE_SCHEMA_COLUMNS[table], REQUIRED[table]] };
}

function database(shape: (table: Table) => FakeTableState, tables: readonly Table[] = TABLES) {
  return Object.fromEntries(tables.map((table) => [table, shape(table)]));
}

function transaction(tables: Record<string, FakeTableState>, unrequested?: Record<string, FakeTableState>) {
  return requiredColumnCleanupTransaction({ tables, unrequested, requiredColumns: REQUIRED });
}

function run(db: ReturnType<typeof transaction>) {
  return removeRowsBlockingRequiredColumnsMigration.run(db.tx as never);
}

/** Prisma models keyed by their table name. */
function prismaModelsByTable(): Map<string, { name: string; body: string }> {
  const modelsDir = join(repoRoot, 'prisma', 'models');
  const schema = readdirSync(modelsDir)
    .filter((file) => file.endsWith('.prisma'))
    .map((file) => readFileSync(join(modelsDir, file), 'utf8'))
    .join('\n');
  const models = new Map<string, { name: string; body: string }>();
  for (const match of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const name = match[1]!;
    const body = match[2]!;
    models.set(body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name, { name, body });
  }
  return models;
}

describe('v0.1.31:014 remove rows blocking required columns', () => {
  it('deletes every row of each table that lacks its required column, signal alerts included, and nothing on a second run', async () => {
    const db = transaction(database(preSchemaTable));

    await expect(run(db)).resolves.toEqual({
      affectedRows: 29,
      details: {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 4),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 6),
        shorts_trend_daily_snapshots: deleted('shorts_trend_daily_snapshots', 2),
        live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 3),
        live_commerce_product_daily_snapshots: deleted('live_commerce_product_daily_snapshots', 5),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 1),
        alerts: deleted('alerts', 8),
      },
    });
    expect(db.deletes()).toEqual(TABLES.map((table) => `DELETE FROM "${table}"`));
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(0);

    // Before `db push` the columns are still missing, and nothing is left to delete.
    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, deleted(table, 0)])),
    });
  });

  it('skips a table the database does not have', async () => {
    const present = TABLES.filter((table) => !table.startsWith('live_commerce_'));
    const db = transaction(database(preSchemaTable, present));

    await expect(run(db)).resolves.toEqual({
      affectedRows: 21,
      details: {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 4),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 6),
        shorts_trend_daily_snapshots: deleted('shorts_trend_daily_snapshots', 2),
        live_commerce_broadcast_daily_snapshots: absent('live_commerce_broadcast_daily_snapshots'),
        live_commerce_product_daily_snapshots: absent('live_commerce_product_daily_snapshots'),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 1),
        alerts: deleted('alerts', 8),
      },
    });
    expect(db.deletes()).toEqual(present.map((table) => `DELETE FROM "${table}"`));
  });

  it('only reads the catalog when the database has none of the tables', async () => {
    const db = transaction({});

    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, absent(table)])),
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.reachLookups).toHaveLength(1);
    expect(db.catalogLookups).toHaveLength(1);
    expect(db.statements).toHaveLength(2);
  });

  it('deletes nothing on a database already on the new schema, where every alert has a dedupe key', async () => {
    const db = transaction(database(newSchemaTable));

    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, kept(table)])),
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(PRE_SCHEMA_ROWS[table]);
  });

  it('leaves alerts alone once dedupe_key exists, while deleting sourcing rows that still lack ingestion_run_id', async () => {
    const db = transaction({
      ...database(preSchemaTable),
      shorts_trend_daily_snapshots: newSchemaTable('shorts_trend_daily_snapshots'),
      alerts: newSchemaTable('alerts'),
    });

    await expect(run(db)).resolves.toEqual({
      affectedRows: 19,
      details: {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 4),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 6),
        shorts_trend_daily_snapshots: kept('shorts_trend_daily_snapshots'),
        live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 3),
        live_commerce_product_daily_snapshots: deleted('live_commerce_product_daily_snapshots', 5),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 1),
        alerts: kept('alerts'),
      },
    });
    expect(db.rowsOf('shorts_trend_daily_snapshots')).toBe(2);
    expect(db.rowsOf('alerts')).toBe(8);
  });

  it('deletes signal alerts without dedupe_key even when every sourcing table is already on the new schema', async () => {
    const db = transaction({
      ...database(newSchemaTable, SOURCING_TABLES),
      alerts: preSchemaTable('alerts'),
    });

    await expect(run(db)).resolves.toEqual({
      affectedRows: 8,
      details: {
        ...Object.fromEntries(SOURCING_TABLES.map((table) => [table, kept(table)])),
        alerts: deleted('alerts', 8),
      },
    });
    expect(db.deletes()).toEqual(['DELETE FROM "alerts"']);
    for (const table of SOURCING_TABLES) expect(db.rowsOf(table)).toBe(PRE_SCHEMA_ROWS[table]);
  });

  it('asks the catalog about the listed table and column pairs only, and never deletes outside the list', async () => {
    // Neighbouring tables without a listed column must survive even if the
    // catalog reports them.
    const db = transaction(database(preSchemaTable), {
      trend_seed_keywords: { rows: 7, columns: ['organization_id'] },
      sourcing_evidence_ingestion_runs: { rows: 9, columns: ['organization_id'] },
      system_settings: { rows: 3, columns: ['organization_id'] },
      activity_events: { rows: 5, columns: ['organization_id'] },
    });

    const result = await run(db);

    expect(db.reachLookups).toEqual([[TABLES, Object.values(ADR_0010_KEPT_TABLES).flat()]]);
    expect(db.catalogLookups).toEqual([[TABLES, TABLES.map((table) => REQUIRED[table])]]);
    expect(Object.keys(result.details)).toEqual(TABLES);
    expect(result.affectedRows).toBe(29);
    expect(db.deletes()).toEqual(TABLES.map((table) => `DELETE FROM "${table}"`));
    expect(db.rowsOf('trend_seed_keywords')).toBe(7);
    expect(db.rowsOf('sourcing_evidence_ingestion_runs')).toBe(9);
    expect(db.rowsOf('system_settings')).toBe(3);
    expect(db.rowsOf('activity_events')).toBe(5);
  });

  it('lists each table once, with its required column and a reason, and none that ADR-0010 keeps', () => {
    expect(REQUIRED_COLUMN_CLEANUPS.map(({ table, requiredColumn }) => [table, requiredColumn]))
      .toEqual(Object.entries(REQUIRED));
    const keptTables: string[] = Object.values(ADR_0010_KEPT_TABLES).flat();
    for (const { table, reason } of REQUIRED_COLUMN_CLEANUPS) {
      expect(keptTables, table).not.toContain(table);
      expect(reason.trim().length, table).toBeGreaterThan(40);
    }
    expect(Object.isFrozen(REQUIRED_COLUMN_CLEANUPS)).toBe(true);
  });

  it('lists tables whose schema requires the column without a database default, and that no foreign key references', () => {
    const models = prismaModelsByTable();
    const foreignKeysInto = (modelName: string) =>
      [...models.values()]
        .filter(({ body }) =>
          new RegExp(`^\\s*\\w+\\s+${modelName}\\??\\s+@relation\\([^)]*\\bfields\\s*:`, 'm').test(body))
        .map(({ name }) => name);
    const listedModels = TABLES.map((table) => models.get(table)?.name);

    expect(listedModels).not.toContain(undefined);
    // The pattern does find foreign keys: each listed model owns at least one.
    expect(foreignKeysInto('SourcingEvidenceIngestionRun')).toEqual(
      expect.arrayContaining(listedModels.filter((name) => name !== 'Alert')),
    );
    expect(foreignKeysInto('Organization')).toContain('Alert');

    for (const table of TABLES) {
      const model = models.get(table)!;
      const field = model.body
        .split('\n')
        .map((line) => line.match(/^\s*(\w+)\s+(\w+)(\??)(\[\])?\s+(.*)$/))
        .find((match) => match?.[5]?.includes(`@map("${REQUIRED[table]}")`));

      expect(field, `${table}.${REQUIRED[table]}`).toBeDefined();
      const [, , type, optional, list, attributes] = field!;
      // Required scalar: `db push` adds it as NOT NULL.
      expect(optional, table).toBe('');
      expect(list, table).toBeUndefined();
      expect(type, table).toBe('String');
      // `@default(uuid())` is generated by the Prisma client, so the database
      // gets no DEFAULT to fill existing rows; any other default would.
      const defaultsInDatabase = /@default\(/.test(attributes!) && !/@default\(uuid\(\)\)/.test(attributes!);
      expect(defaultsInDatabase, table).toBe(false);
      // Nothing restricts deleting these rows, and no delete cascades from them.
      expect(foreignKeysInto(model.name), table).toEqual([]);
    }
  });

  it('registers as a v0.1.31 pre-schema migration', () => {
    expect(removeRowsBlockingRequiredColumnsMigration).toMatchObject({
      id: 'v0.1.31:014_remove_rows_blocking_required_columns',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
    expect(dataMigrations).toContain(removeRowsBlockingRequiredColumnsMigration);
  });
});
