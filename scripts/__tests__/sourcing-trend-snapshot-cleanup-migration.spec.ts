import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { dataMigrations } from '../data-migrations';
import {
  removeUnlinkedSourcingTrendSnapshots,
  removeUnlinkedSourcingTrendSnapshotsMigration,
  SOURCING_TREND_SNAPSHOT_TABLES,
} from '../data-migrations/v0.1.31/014_remove_unlinked_sourcing_trend_snapshots';

const repoRoot = join(__dirname, '..', '..');

const TABLES = [
  'naver_keyword_daily_snapshots',
  'naver_popular_keyword_daily_snapshots',
  'shorts_trend_daily_snapshots',
  'live_commerce_broadcast_daily_snapshots',
  'live_commerce_product_daily_snapshots',
  'tiktok_creative_trend_daily_snapshots',
] as const;

type Table = (typeof TABLES)[number];

/** One table as the database holds it. */
type TableState = { rows: number; ingestionRunId: boolean };

const PRE_SCHEMA_ROWS: Record<Table, number> = {
  naver_keyword_daily_snapshots: 4,
  naver_popular_keyword_daily_snapshots: 6,
  shorts_trend_daily_snapshots: 2,
  live_commerce_broadcast_daily_snapshots: 3,
  live_commerce_product_daily_snapshots: 5,
  tiktok_creative_trend_daily_snapshots: 1,
};

const deleted = (deletedRows: number) => ({
  tablePresent: true,
  ingestionRunIdPresent: false,
  deletedRows,
});
const LINKED = { tablePresent: true, ingestionRunIdPresent: true, deletedRows: 0 };
const ABSENT = { tablePresent: false, ingestionRunIdPresent: false, deletedRows: 0 };

function tablesWith(ingestionRunId: boolean): Record<string, TableState> {
  return Object.fromEntries(
    TABLES.map((table) => [table, { rows: PRE_SCHEMA_ROWS[table], ingestionRunId }]),
  );
}

/**
 * A transaction over named tables. SQL is rendered by Prisma itself, so a
 * whitelisted identifier arrives inline. Like PostgreSQL, it refuses to delete
 * from a table the database does not have, and it refuses to delete from one
 * that already has `ingestion_run_id`, so a passing run proves the migration
 * never reached for either. The catalog lookup answers for the tables it was
 * asked about and, like a careless catalog, for every `unrequested` table too.
 */
function fakeTransaction(
  tables: Record<string, TableState>,
  unrequested: Record<string, TableState> = {},
) {
  const state = new Map(Object.entries({ ...tables, ...unrequested }));
  const statements: string[] = [];
  const catalogLookups: unknown[][] = [];
  const render = (strings: TemplateStringsArray, values: unknown[]) => {
    const query = Prisma.sql(strings, ...values);
    return { sql: query.sql.replace(/\s+/g, ' ').trim(), values: query.values };
  };

  return {
    statements,
    catalogLookups,
    deletes: () => statements.filter((sql) => sql.startsWith('DELETE')),
    rowsOf: (table: string) => state.get(table)?.rows,
    tx: {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, values: bound } = render(strings, values);
        statements.push(sql);
        if (!sql.includes('FROM information_schema.tables')) {
          throw new Error(`Unexpected query: ${sql}`);
        }
        catalogLookups.push(bound);
        const requested = new Set(bound[0] as string[]);
        return [...state]
          .filter(([table]) => requested.has(table) || table in unrequested)
          .map(([table, { ingestionRunId }]) => ({
            table_name: table,
            ingestion_run_id_present: ingestionRunId,
          }));
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, values: bound } = render(strings, values);
        statements.push(sql);
        const table = sql.match(/^DELETE FROM ([a-z0-9_]+)$/)?.[1];
        if (!table || bound.length > 0) throw new Error(`Unexpected statement: ${sql}`);
        const current = state.get(table);
        if (!current) throw new Error(`relation "${table}" does not exist`);
        if (current.ingestionRunId) throw new Error(`${table} already has ingestion_run_id`);
        state.set(table, { ...current, rows: 0 });
        return current.rows;
      }),
    },
  };
}

function run(db: ReturnType<typeof fakeTransaction>) {
  return removeUnlinkedSourcingTrendSnapshots(db.tx as never);
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

describe('removeUnlinkedSourcingTrendSnapshots', () => {
  it('deletes every row of each table without ingestion_run_id, and nothing on a second run', async () => {
    const db = fakeTransaction(tablesWith(false));

    await expect(run(db)).resolves.toEqual({
      affectedRows: 21,
      details: {
        naver_keyword_daily_snapshots: deleted(4),
        naver_popular_keyword_daily_snapshots: deleted(6),
        shorts_trend_daily_snapshots: deleted(2),
        live_commerce_broadcast_daily_snapshots: deleted(3),
        live_commerce_product_daily_snapshots: deleted(5),
        tiktok_creative_trend_daily_snapshots: deleted(1),
      },
    });
    expect(db.deletes()).toEqual(TABLES.map((table) => `DELETE FROM ${table}`));
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(0);

    // Before `db push` the column is still missing, and nothing is left to delete.
    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, deleted(0)])),
    });
  });

  it('skips a table the database does not have', async () => {
    const {
      live_commerce_broadcast_daily_snapshots: _broadcasts,
      live_commerce_product_daily_snapshots: _products,
      ...present
    } = tablesWith(false);
    const db = fakeTransaction(present);

    await expect(run(db)).resolves.toEqual({
      affectedRows: 13,
      details: {
        naver_keyword_daily_snapshots: deleted(4),
        naver_popular_keyword_daily_snapshots: deleted(6),
        shorts_trend_daily_snapshots: deleted(2),
        live_commerce_broadcast_daily_snapshots: ABSENT,
        live_commerce_product_daily_snapshots: ABSENT,
        tiktok_creative_trend_daily_snapshots: deleted(1),
      },
    });
    expect(db.deletes()).toEqual([
      'DELETE FROM naver_keyword_daily_snapshots',
      'DELETE FROM naver_popular_keyword_daily_snapshots',
      'DELETE FROM shorts_trend_daily_snapshots',
      'DELETE FROM tiktok_creative_trend_daily_snapshots',
    ]);
  });

  it('only reads the catalog when the database has none of the tables', async () => {
    const db = fakeTransaction({});

    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, ABSENT])),
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.statements).toHaveLength(1);
  });

  it('deletes nothing on a database already on the new schema', async () => {
    // Every table has ingestion_run_id, so each row already names its run.
    const db = fakeTransaction(tablesWith(true));

    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: Object.fromEntries(TABLES.map((table) => [table, LINKED])),
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(PRE_SCHEMA_ROWS[table]);
  });

  it('deletes only from the tables that still lack ingestion_run_id', async () => {
    const db = fakeTransaction({
      ...tablesWith(false),
      shorts_trend_daily_snapshots: { rows: 2, ingestionRunId: true },
      tiktok_creative_trend_daily_snapshots: { rows: 1, ingestionRunId: true },
    });

    await expect(run(db)).resolves.toEqual({
      affectedRows: 18,
      details: {
        naver_keyword_daily_snapshots: deleted(4),
        naver_popular_keyword_daily_snapshots: deleted(6),
        shorts_trend_daily_snapshots: LINKED,
        live_commerce_broadcast_daily_snapshots: deleted(3),
        live_commerce_product_daily_snapshots: deleted(5),
        tiktok_creative_trend_daily_snapshots: LINKED,
      },
    });
    expect(db.rowsOf('shorts_trend_daily_snapshots')).toBe(2);
    expect(db.rowsOf('tiktok_creative_trend_daily_snapshots')).toBe(1);
  });

  it('asks the catalog about the whitelist only and never deletes outside it', async () => {
    // Neighbouring sourcing tables without the column must survive even if the
    // catalog reports them.
    const db = fakeTransaction(tablesWith(false), {
      trend_seed_keywords: { rows: 7, ingestionRunId: false },
      sourcing_evidence_ingestion_runs: { rows: 9, ingestionRunId: false },
    });

    const result = await run(db);

    expect(db.catalogLookups).toEqual([[[...TABLES]]]);
    expect(Object.keys(result.details)).toEqual([...TABLES]);
    expect(result.affectedRows).toBe(21);
    expect(db.deletes()).toEqual(TABLES.map((table) => `DELETE FROM ${table}`));
    expect(db.rowsOf('trend_seed_keywords')).toBe(7);
    expect(db.rowsOf('sourcing_evidence_ingestion_runs')).toBe(9);
  });

  it('whitelists the tables whose schema requires an ingestion run and that no foreign key references', () => {
    expect(SOURCING_TREND_SNAPSHOT_TABLES).toEqual(TABLES);

    const models = prismaModelsByTable();
    const foreignKeysInto = (modelName: string) =>
      [...models.values()]
        .filter(({ body }) =>
          new RegExp(`^\\s*\\w+\\s+${modelName}\\??\\s+@relation\\([^)]*\\bfields\\s*:`, 'm').test(body))
        .map(({ name }) => name);
    const snapshotModels = TABLES.map((table) => models.get(table)?.name);

    expect(snapshotModels).not.toContain(undefined);
    // The pattern does find foreign keys: each snapshot model owns one into its run.
    expect(foreignKeysInto('SourcingEvidenceIngestionRun')).toEqual(
      expect.arrayContaining(snapshotModels),
    );
    for (const table of TABLES) {
      const model = models.get(table)!;
      expect(model.body, table).toMatch(
        /^\s*ingestionRunId\s+String\s+@map\("ingestion_run_id"\)\s+@db\.Uuid\s*$/m,
      );
      expect(model.body, table).toMatch(
        /^\s*ingestionRun\s+SourcingEvidenceIngestionRun\s+@relation\(/m,
      );
      // Nothing restricts deleting these rows.
      expect(foreignKeysInto(model.name), table).toEqual([]);
    }
  });

  it('registers as a v0.1.31 pre-schema migration', () => {
    expect(removeUnlinkedSourcingTrendSnapshotsMigration).toMatchObject({
      id: 'v0.1.31:014_remove_unlinked_sourcing_trend_snapshots',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
    expect(dataMigrations).toContain(removeUnlinkedSourcingTrendSnapshotsMigration);
  });
});
