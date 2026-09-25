import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
  SOURCE_IMPORT_RUN_STATUSES,
} from '@kiditem/shared/source-import';
import { dataMigrations } from '../data-migrations';
import { ADR_0010_KEPT_TABLES } from '../data-migrations/helpers/dependent-row-removal';
import type { RequiredColumnCleanup } from '../data-migrations/helpers/required-column-row-cleanup';
import { uniqueKeyPredicateText } from '../data-migrations/helpers/unique-key-row-cleanup';
import {
  removeRowsBlockingRequiredColumnsMigration,
  REQUIRED_COLUMN_CLEANUPS,
  UNIQUE_KEY_CLEANUPS,
  UNIQUE_KEYS_WITHOUT_CLEANUP,
} from '../data-migrations/v0.1.31/014_remove_rows_blocking_required_columns';
import {
  type FakeForeignKey,
  type FakeRankedRow,
  type FakeTableState,
  requiredColumnCleanupTransaction,
} from './fixtures/required-column-cleanup-transaction';

const repoRoot = join(__dirname, '..', '..');
const RUNS = 'sourcing_evidence_ingestion_runs';
const OBSERVATIONS = 'sourcing_evidence_observations';
const OFFER_KEYWORDS = 'sourcing_1688_offer_keyword_observations';
const SNAPSHOTS = 'supplier_offer_sku_snapshots';
const LAUNCHES = 'sourcing_launch_candidates';
const ITEMS = 'sourcing_decision_batch_items';
const TIERS = 'supplier_offer_price_tiers';
const INTENTS = 'procurement_test_intents';

/** The list as this spec pins it: table, then the column the schema requires. */
const REQUIRED = {
  naver_keyword_daily_snapshots: 'ingestion_run_id',
  naver_popular_keyword_daily_snapshots: 'ingestion_run_id',
  shorts_trend_daily_snapshots: 'ingestion_run_id',
  live_commerce_broadcast_daily_snapshots: 'ingestion_run_id',
  live_commerce_product_daily_snapshots: 'ingestion_run_id',
  tiktok_creative_trend_daily_snapshots: 'ingestion_run_id',
  alerts: 'dedupe_key',
  [RUNS]: 'is_current_complete',
} as const;

type Table = keyof typeof REQUIRED;

/**
 * The column's name in today's schema. v0.1.31:030 renames the sourcing ledgers'
 * `ingestion_run_id` to `operation_id` after this migration, before `db push`
 * (KID-360), so the schema declares the renamed column.
 */
const SCHEMA_COLUMN = (table: Table): string =>
  REQUIRED[table] === 'ingestion_run_id' ? 'operation_id' : REQUIRED[table];

const TABLES = Object.keys(REQUIRED) as Table[];
const ROW_TABLES = TABLES.filter((table) => table !== RUNS);
const SOURCING_TABLES = ROW_TABLES.filter((table) => table !== 'alerts');

const PRE_SCHEMA_ROWS: Record<Table, number> = {
  naver_keyword_daily_snapshots: 4,
  naver_popular_keyword_daily_snapshots: 6,
  shorts_trend_daily_snapshots: 2,
  live_commerce_broadcast_daily_snapshots: 3,
  live_commerce_product_daily_snapshots: 5,
  tiktok_creative_trend_daily_snapshots: 1,
  // Office 0.1.30 signal alerts: v0.1.31:005 keeps them.
  alerts: 8,
  [RUNS]: 2,
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
  [RUNS]: ['organization_id', 'status', 'cancel_requested_at'],
};

/** Every foreign key Office 0.1.30 has into an ingestion run or a row that must go first. */
const OFFICE_RUN_FOREIGN_KEYS: FakeForeignKey[] = [
  { table: OFFER_KEYWORDS, column: 'ingestion_run_id', references: RUNS },
  { table: OBSERVATIONS, column: 'ingestion_run_id', references: RUNS },
  { table: 'sourcing_review_batch_items', column: 'offer_keyword_observation_id', references: OFFER_KEYWORDS },
  { table: OFFER_KEYWORDS, column: 'evidence_observation_id', references: OBSERVATIONS },
  { table: OBSERVATIONS, column: 'supersedes_observation_id', references: OBSERVATIONS },
  { table: 'sourcing_decision_evidence', column: 'evidence_observation_id', references: OBSERVATIONS },
  { table: 'sourcing_recommendation_item_evidence', column: 'evidence_observation_id', references: OBSERVATIONS },
  { table: 'sourcing_validation_check_evidence', column: 'evidence_observation_id', references: OBSERVATIONS },
  { table: SNAPSHOTS, column: 'evidence_observation_id', references: OBSERVATIONS },
  { table: LAUNCHES, column: 'supplier_offer_sku_snapshot_id', references: SNAPSHOTS },
  { table: ITEMS, column: 'supplier_offer_sku_snapshot_id', references: SNAPSHOTS },
  { table: TIERS, column: 'supplier_offer_sku_snapshot_id', references: SNAPSHOTS },
  { table: INTENTS, column: 'supplier_offer_sku_snapshot_id', references: SNAPSHOTS },
  { table: LAUNCHES, column: 'supersedes_launch_candidate_id', references: LAUNCHES },
  { table: ITEMS, column: 'launch_candidate_id', references: LAUNCHES },
  { table: INTENTS, column: 'launch_candidate_id', references: LAUNCHES },
  { table: 'sourcing_decision_evidence', column: 'decision_batch_item_id', references: ITEMS },
  { table: INTENTS, column: 'decision_batch_item_id', references: ITEMS },
  { table: INTENTS, column: 'selected_price_tier_id', references: TIERS },
];

/** One Office 0.1.30 chain from two runs down to a procurement intent. */
function officeRunChain(): Record<string, FakeTableState> {
  return {
    [RUNS]: { columns: PRE_SCHEMA_COLUMNS[RUNS], records: [{ id: 'run-1' }, { id: 'run-2' }] },
    [OBSERVATIONS]: {
      columns: ['id', 'ingestion_run_id', 'supersedes_observation_id'],
      records: [
        { id: 'obs-1', ingestion_run_id: 'run-1', supersedes_observation_id: null },
        { id: 'obs-2', ingestion_run_id: 'run-2', supersedes_observation_id: 'obs-1' },
      ],
    },
    [OFFER_KEYWORDS]: {
      columns: ['id', 'ingestion_run_id', 'evidence_observation_id'],
      records: [{ id: 'kw-1', ingestion_run_id: 'run-1', evidence_observation_id: 'obs-1' }],
    },
    sourcing_review_batch_items: {
      columns: ['id', 'offer_keyword_observation_id'],
      records: [{ id: 'review-item-1', offer_keyword_observation_id: 'kw-1' }],
    },
    sourcing_decision_evidence: {
      columns: ['id', 'evidence_observation_id', 'decision_batch_item_id'],
      records: [{ id: 'decision-evidence-1', evidence_observation_id: 'obs-2', decision_batch_item_id: 'item-2' }],
    },
    sourcing_recommendation_item_evidence: {
      columns: ['id', 'evidence_observation_id'],
      records: [{ id: 'recommendation-evidence-1', evidence_observation_id: 'obs-2' }],
    },
    sourcing_validation_check_evidence: {
      columns: ['id', 'evidence_observation_id'],
      records: [{ id: 'validation-evidence-1', evidence_observation_id: 'obs-1' }],
    },
    [SNAPSHOTS]: {
      columns: ['id', 'evidence_observation_id'],
      records: [{ id: 'snapshot-1', evidence_observation_id: 'obs-1' }],
    },
    [TIERS]: {
      columns: ['id', 'supplier_offer_sku_snapshot_id'],
      records: [{ id: 'tier-1', supplier_offer_sku_snapshot_id: 'snapshot-1' }],
    },
    [LAUNCHES]: {
      columns: ['id', 'supplier_offer_sku_snapshot_id', 'supersedes_launch_candidate_id'],
      records: [{ id: 'launch-1', supplier_offer_sku_snapshot_id: 'snapshot-1', supersedes_launch_candidate_id: null }],
    },
    [ITEMS]: {
      columns: ['id', 'supplier_offer_sku_snapshot_id', 'launch_candidate_id'],
      records: [
        { id: 'item-1', supplier_offer_sku_snapshot_id: 'snapshot-1', launch_candidate_id: 'launch-1' },
        // A decision with no offer or launch pointer stays.
        { id: 'item-2', supplier_offer_sku_snapshot_id: null, launch_candidate_id: null },
      ],
    },
    [INTENTS]: {
      columns: ['id', 'decision_batch_item_id', 'supplier_offer_sku_snapshot_id', 'launch_candidate_id', 'selected_price_tier_id'],
      records: [{
        id: 'intent-1',
        decision_batch_item_id: 'item-1',
        supplier_offer_sku_snapshot_id: 'snapshot-1',
        launch_candidate_id: 'launch-1',
        selected_price_tier_id: 'tier-1',
      }],
    },
  };
}


const IMPORT_RUNS = 'source_import_runs';
const CONFIRMATIONS = 'rocket_purchase_confirmations';
const LINES = 'rocket_purchase_confirmation_lines';
const ALLOCATIONS = 'rocket_purchase_confirmation_allocations';
const TRANSMISSIONS = 'rocket_purchase_confirmation_transmissions';
const RECEIPTS = 'coupang_direct_transport_receipts';
const CONSUMPTIONS = 'coupang_direct_transport_consumptions';

/**
 * Every foreign key Office 0.1.30 has into an import run, or into a row a
 * removed run takes with it.
 */
const OFFICE_IMPORT_RUN_FOREIGN_KEYS: FakeForeignKey[] = [
  { table: 'orders', column: 'source_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_listings', column: 'last_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_listing_options', column: 'last_import_run_id', references: IMPORT_RUNS },
  { table: 'sellpia_inventory_skus', column: 'last_import_run_id', references: IMPORT_RUNS },
  { table: 'sellpia_inventory_states', column: 'last_completed_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_scrape_runs', column: 'source_import_run_id', references: IMPORT_RUNS },
  { table: 'rocket_po_catalog_snapshots', column: 'source_import_run_id', references: IMPORT_RUNS },
  { table: CONFIRMATIONS, column: 'source_import_run_id', references: IMPORT_RUNS },
  { table: TRANSMISSIONS, column: 'source_import_run_id', references: IMPORT_RUNS },
  { table: 'channel_scrape_chunks', column: 'scrape_run_id', references: 'channel_scrape_runs' },
  { table: 'channel_scrape_snapshots', column: 'scrape_run_id', references: 'channel_scrape_runs' },
  { table: 'channel_account_daily_kpi_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { table: 'channel_ad_target_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { table: 'channel_listing_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { table: 'channel_listing_option_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { table: 'ad_actions', column: 'ad_target_daily_id', references: 'channel_ad_target_daily_snapshots' },
  { table: 'rocket_po_catalog_lines', column: 'snapshot_id', references: 'rocket_po_catalog_snapshots' },
  { table: LINES, column: 'confirmation_id', references: CONFIRMATIONS },
  { table: TRANSMISSIONS, column: 'confirmation_id', references: CONFIRMATIONS },
  { table: ALLOCATIONS, column: 'confirmation_line_id', references: LINES },
];

/** The keys v0.1.31 adds between a Rocket confirmation chain and the kept transport tables. */
const TRANSPORT_FOREIGN_KEYS: FakeForeignKey[] = [
  { table: RECEIPTS, column: 'rocket_purchase_confirmation_id', references: CONFIRMATIONS },
  { table: RECEIPTS, column: 'effect_source_import_run_id', references: IMPORT_RUNS },
  { table: CONSUMPTIONS, column: 'source_import_run_id', references: IMPORT_RUNS },
];

const IMPORT_RUN_COLUMNS = ['id', 'created_at', 'organization_id', 'source_type', 'channel_account_id', 'status', 'freshness_generation'];

/**
 * Import runs with the rows a removal reaches: an order cites one run, a
 * Rocket confirmation chain hangs off two, and a transport receipt that
 * another run produced points at one of those confirmations.
 */
function importRunDatabase(consumedRun = 'run-effect'): Record<string, FakeTableState> {
  return {
    [IMPORT_RUNS]: {
      columns: IMPORT_RUN_COLUMNS,
      records: ['run-new', 'run-cited', 'run-confirmed', 'gen-new', 'gen-confirmed', 'run-effect']
        .map((id) => ({ id, status: 'running' })),
    },
    orders: { columns: ['id', 'source_import_run_id'], records: [{ id: 'order-1', source_import_run_id: 'run-cited' }] },
    [CONFIRMATIONS]: {
      columns: ['id', 'source_import_run_id'],
      records: [
        { id: 'confirmation-1', source_import_run_id: 'run-confirmed' },
        { id: 'confirmation-2', source_import_run_id: 'gen-confirmed' },
      ],
    },
    [LINES]: {
      columns: ['id', 'confirmation_id'],
      records: [
        { id: 'line-1', confirmation_id: 'confirmation-1' },
        { id: 'line-2', confirmation_id: 'confirmation-2' },
      ],
    },
    [ALLOCATIONS]: { columns: ['id', 'confirmation_line_id'], records: [{ id: 'allocation-1', confirmation_line_id: 'line-1' }] },
    [TRANSMISSIONS]: {
      columns: ['id', 'confirmation_id', 'source_import_run_id'],
      records: [
        { id: 'transmission-1', confirmation_id: 'confirmation-1', source_import_run_id: 'run-confirmed' },
        { id: 'transmission-2', confirmation_id: 'confirmation-2', source_import_run_id: 'run-effect' },
      ],
    },
    [RECEIPTS]: {
      columns: ['id', 'effect_source_import_run_id', 'rocket_purchase_confirmation_id'],
      records: [{ id: 'receipt-1', effect_source_import_run_id: 'run-effect', rocket_purchase_confirmation_id: 'confirmation-2' }],
    },
    [CONSUMPTIONS]: {
      columns: ['id', 'source_import_run_id'],
      records: [{ id: 'consumption-1', source_import_run_id: consumedRun }],
    },
  };
}

const RUN_DEPENDENT_TABLES = [...new Set(REQUIRED_COLUMN_CLEANUPS.at(-1)!.dependents!.map((step) => step.table))];
const IMPORT_RUN_STEPS = UNIQUE_KEY_CLEANUPS[0]!.dependents!;

const shape = (table: Table, tablePresent: boolean, requiredColumnPresent: boolean, deletedRows: number) => ({
  requiredColumn: REQUIRED[table],
  tablePresent,
  requiredColumnPresent,
  deletedRows,
  ...(table === RUNS ? { dependentRows: {} } : {}),
});
const deleted = (table: Table, deletedRows: number) => shape(table, true, false, deletedRows);
const kept = (table: Table) => shape(table, true, true, 0);
const absent = (table: Table) => shape(table, false, false, 0);

function preSchemaTable(table: Table): FakeTableState {
  return { rows: PRE_SCHEMA_ROWS[table], columns: PRE_SCHEMA_COLUMNS[table] };
}

function newSchemaTable(table: Table): FakeTableState {
  return { rows: PRE_SCHEMA_ROWS[table], columns: [...PRE_SCHEMA_COLUMNS[table], REQUIRED[table]] };
}

function database(tableShape: (table: Table) => FakeTableState, tables: readonly Table[] = TABLES) {
  return Object.fromEntries(tables.map((table) => [table, tableShape(table)]));
}

function transaction(
  tables: Record<string, FakeTableState>,
  extra: Omit<Parameters<typeof requiredColumnCleanupTransaction>[0], 'tables' | 'requiredColumns'> = {},
) {
  return requiredColumnCleanupTransaction({ tables, requiredColumns: REQUIRED, ...extra });
}

/** The registered migration, with its two lists' details apart. */
async function run(db: ReturnType<typeof transaction>) {
  const result = await removeRowsBlockingRequiredColumnsMigration.run(db.tx as never);
  const details = result.details as { requiredColumns: Record<string, unknown>; uniqueKeys: Record<string, unknown> };
  return { affectedRows: result.affectedRows, requiredColumns: details.requiredColumns, uniqueKeys: details.uniqueKeys };
}

const untouchedKey = (tablePresent: boolean, indexPresent: boolean) => ({
  table: IMPORT_RUNS,
  tablePresent,
  indexPresent,
  duplicateGroups: 0,
  deletedRows: 0,
  neutralizedRows: 0,
  dependentRows: {},
  unlinkedRows: {},
  keptReferences: {},
});
const keysWith = (tablePresent: boolean, indexPresent: boolean) =>
  Object.fromEntries(UNIQUE_KEY_CLEANUPS.map(({ index }) => [index, untouchedKey(tablePresent, indexPresent)]));

type PrismaModel = { name: string; body: string };

/** Prisma models keyed by their table name. */
function prismaModelsByTable(): Map<string, PrismaModel> {
  const models = new Map<string, PrismaModel>();
  for (const match of prismaSchema().matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const name = match[1]!;
    const body = match[2]!;
    models.set(body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name, { name, body });
  }
  return models;
}

function prismaSchema(): string {
  const modelsDir = join(repoRoot, 'prisma', 'models');
  return readdirSync(modelsDir)
    .filter((file) => file.endsWith('.prisma'))
    .map((file) => readFileSync(join(modelsDir, file), 'utf8'))
    .join('\n');
}

function columnByField(model: PrismaModel): Map<string, string> {
  const columns = new Map<string, string>();
  for (const line of model.body.split('\n')) {
    const field = line.match(/^\s*(\w+)\s+\w+/);
    if (!field || field[1]!.startsWith('@@')) continue;
    columns.set(field[1]!, line.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1]!);
  }
  return columns;
}

describe('v0.1.31:014 remove rows blocking required columns and unique keys', () => {
  it('deletes each table that lacks its column, the approved ingestion-run chain children first, and nothing on a second run', async () => {
    const db = transaction({ ...database(preSchemaTable), ...officeRunChain() }, { foreignKeys: OFFICE_RUN_FOREIGN_KEYS });
    const chain = {
      [INTENTS]: 1,
      sourcing_decision_evidence: 1,
      [ITEMS]: 1,
      [LAUNCHES]: 1,
      [TIERS]: 1,
      [SNAPSHOTS]: 1,
      sourcing_review_batch_items: 1,
      sourcing_recommendation_item_evidence: 1,
      sourcing_validation_check_evidence: 1,
      [OFFER_KEYWORDS]: 1,
      [OBSERVATIONS]: 2,
    };

    await expect(run(db)).resolves.toEqual({
      affectedRows: 29 + 2 + 12,
      requiredColumns: {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 4),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 6),
        shorts_trend_daily_snapshots: deleted('shorts_trend_daily_snapshots', 2),
        live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 3),
        live_commerce_product_daily_snapshots: deleted('live_commerce_product_daily_snapshots', 5),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 1),
        alerts: deleted('alerts', 8),
        [RUNS]: { ...deleted(RUNS, 2), dependentRows: chain },
      },
      uniqueKeys: keysWith(false, false),
    });
    expect(db.deletes()).toEqual([
      ...ROW_TABLES.map((table) => `DELETE FROM "${table}"`),
      ...Object.keys(chain)
        .sort((left, right) => RUN_DEPENDENT_TABLES.indexOf(left) - RUN_DEPENDENT_TABLES.indexOf(right))
        .map((table) => `DELETE FROM "${table}" WHERE id = ANY($1::uuid[])`),
      `DELETE FROM "${RUNS}"`,
    ]);
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(0);
    expect(db.idsOf(ITEMS)).toEqual(['item-2']);

    // Before `db push` the columns are still missing, and nothing is left to delete.
    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      requiredColumns: Object.fromEntries(TABLES.map((table) => [table, deleted(table, 0)])),
      uniqueKeys: keysWith(false, false),
    });
  });

  it('skips a table the database does not have', async () => {
    const present = TABLES.filter((table) => !table.startsWith('live_commerce_') && table !== RUNS);
    const db = transaction(database(preSchemaTable, present));

    await expect(run(db)).resolves.toEqual({
      affectedRows: 21,
      requiredColumns: {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 4),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 6),
        shorts_trend_daily_snapshots: deleted('shorts_trend_daily_snapshots', 2),
        live_commerce_broadcast_daily_snapshots: absent('live_commerce_broadcast_daily_snapshots'),
        live_commerce_product_daily_snapshots: absent('live_commerce_product_daily_snapshots'),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 1),
        alerts: deleted('alerts', 8),
        [RUNS]: absent(RUNS),
      },
      uniqueKeys: keysWith(false, false),
    });
    expect(db.deletes()).toEqual(present.map((table) => `DELETE FROM "${table}"`));
  });

  it('only reads the catalog when the database has none of the tables', async () => {
    const db = transaction({});

    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      requiredColumns: Object.fromEntries(TABLES.map((table) => [table, absent(table)])),
      uniqueKeys: keysWith(false, false),
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.reachLookups).toHaveLength(1);
    expect(db.catalogLookups).toHaveLength(1);
    expect(db.foreignKeyLookups).toHaveLength(0);
    expect(db.statements).toHaveLength(3);
  });

  it('deletes nothing on a database already on the new schema, where every alert has a dedupe key and every key its index', async () => {
    const db = transaction(
      { ...database(newSchemaTable), [IMPORT_RUNS]: { rows: 3, columns: IMPORT_RUN_COLUMNS } },
      { indexes: UNIQUE_KEY_CLEANUPS.map(({ index }) => index) },
    );

    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      requiredColumns: Object.fromEntries(TABLES.map((table) => [table, kept(table)])),
      uniqueKeys: keysWith(true, true),
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(PRE_SCHEMA_ROWS[table]);
    expect(db.rowsOf(IMPORT_RUNS)).toBe(3);
  });

  it('leaves alerts and runs alone once their columns exist, while deleting sourcing rows that still lack ingestion_run_id', async () => {
    const db = transaction({
      ...database(preSchemaTable, ROW_TABLES),
      shorts_trend_daily_snapshots: newSchemaTable('shorts_trend_daily_snapshots'),
      alerts: newSchemaTable('alerts'),
      [RUNS]: newSchemaTable(RUNS),
    });

    await expect(run(db)).resolves.toMatchObject({
      affectedRows: 19,
      requiredColumns: {
        naver_keyword_daily_snapshots: deleted('naver_keyword_daily_snapshots', 4),
        naver_popular_keyword_daily_snapshots: deleted('naver_popular_keyword_daily_snapshots', 6),
        shorts_trend_daily_snapshots: kept('shorts_trend_daily_snapshots'),
        live_commerce_broadcast_daily_snapshots: deleted('live_commerce_broadcast_daily_snapshots', 3),
        live_commerce_product_daily_snapshots: deleted('live_commerce_product_daily_snapshots', 5),
        tiktok_creative_trend_daily_snapshots: deleted('tiktok_creative_trend_daily_snapshots', 1),
        alerts: kept('alerts'),
        [RUNS]: kept(RUNS),
      },
    });
    expect(db.rowsOf('shorts_trend_daily_snapshots')).toBe(2);
    expect(db.rowsOf('alerts')).toBe(8);
    expect(db.rowsOf(RUNS)).toBe(2);
  });

  it('deletes signal alerts without dedupe_key even when every sourcing table is already on the new schema', async () => {
    const db = transaction({
      ...database(newSchemaTable, [...SOURCING_TABLES, RUNS]),
      alerts: preSchemaTable('alerts'),
    });

    await expect(run(db)).resolves.toMatchObject({
      affectedRows: 8,
      requiredColumns: {
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
    const db = transaction(database(preSchemaTable, ROW_TABLES), {
      unrequested: {
        trend_seed_keywords: { rows: 7, columns: ['organization_id'] },
        system_settings: { rows: 3, columns: ['organization_id'] },
        activity_events: { rows: 5, columns: ['organization_id'] },
      },
    });

    const result = await run(db);

    const deletedTables = [...TABLES, ...RUN_DEPENDENT_TABLES.filter((table) => !TABLES.includes(table as Table))];
    expect(db.reachLookups).toEqual([[deletedTables, Object.values(ADR_0010_KEPT_TABLES).flat()]]);
    expect(db.catalogLookups).toEqual([[TABLES, TABLES.map((table) => REQUIRED[table])]]);
    expect(Object.keys(result.requiredColumns)).toEqual(TABLES);
    expect(result.affectedRows).toBe(29);
    expect(db.deletes()).toEqual(ROW_TABLES.map((table) => `DELETE FROM "${table}"`));
    expect(db.rowsOf('trend_seed_keywords')).toBe(7);
    expect(db.rowsOf('system_settings')).toBe(3);
    expect(db.rowsOf('activity_events')).toBe(5);
  });
  it('keeps the newest run of a duplicated key, marks one an order cites failed, and removes the rest with their Rocket confirmations', async () => {
    const [running, generation] = UNIQUE_KEY_CLEANUPS;
    const ranked: FakeRankedRow[][] = [
      [{ id: 'run-new', position: 1 }, { id: 'run-cited', position: 2 }, { id: 'run-confirmed', position: 3 }],
      [{ id: 'gen-new', position: 1 }, { id: 'gen-confirmed', position: 2 }],
    ];
    const db = transaction(importRunDatabase(), {
      foreignKeys: [...OFFICE_IMPORT_RUN_FOREIGN_KEYS, ...TRANSPORT_FOREIGN_KEYS],
      ranked,
    });

    const result = await run(db);

    expect(result.affectedRows).toBe(11);
    expect(result.requiredColumns).toEqual(Object.fromEntries(TABLES.map((table) => [table, absent(table)])));
    expect(result.uniqueKeys).toEqual({
      ...keysWith(true, false),
      [running!.index]: {
        ...untouchedKey(true, false),
        duplicateGroups: 1,
        deletedRows: 1,
        neutralizedRows: 1,
        dependentRows: { [ALLOCATIONS]: 1, [LINES]: 1, [TRANSMISSIONS]: 1, [CONFIRMATIONS]: 1 },
        keptReferences: { 'orders.source_import_run_id': 1 },
      },
      // Without a neutral value, the kept receipt loses its confirmation pointer.
      [generation!.index]: {
        ...untouchedKey(true, false),
        duplicateGroups: 1,
        deletedRows: 1,
        dependentRows: { [LINES]: 1, [TRANSMISSIONS]: 1, [CONFIRMATIONS]: 1 },
        unlinkedRows: { [`${RECEIPTS}.rocket_purchase_confirmation_id`]: 1 },
        keptReferences: { [`${RECEIPTS}.rocket_purchase_confirmation_id`]: 1 },
      },
    });
    expect(db.idsOf(IMPORT_RUNS)).toEqual(['run-new', 'run-cited', 'gen-new', 'run-effect']);
    expect(db.recordsOf(IMPORT_RUNS)?.find((record) => record.id === 'run-cited')?.status)
      .toBe(SOURCE_IMPORT_RUN_FAILED_STATUS);
    for (const table of [CONFIRMATIONS, LINES, ALLOCATIONS, TRANSMISSIONS]) expect(db.rowsOf(table), table).toBe(0);
    // ADR-0010 kept rows stay: the order still cites its run, and the receipt
    // only lost its pointer to the removed confirmation.
    expect(db.recordsOf('orders')).toEqual([{ id: 'order-1', source_import_run_id: 'run-cited' }]);
    expect(db.recordsOf(RECEIPTS)).toEqual([
      { id: 'receipt-1', effect_source_import_run_id: 'run-effect', rocket_purchase_confirmation_id: null },
    ]);
    expect(db.rowsOf(CONSUMPTIONS)).toBe(1);
    expect(db.statements.filter((sql) => sql.startsWith('DELETE FROM') && sql.includes('"orders"'))).toEqual([]);
  });

  it('stops on a duplicated generation that a Coupang direct transport consumption cites', async () => {
    const db = transaction(importRunDatabase('gen-confirmed'), {
      foreignKeys: [...OFFICE_IMPORT_RUN_FOREIGN_KEYS, ...TRANSPORT_FOREIGN_KEYS],
      ranked: [[], [{ id: 'gen-new', position: 1 }, { id: 'gen-confirmed', position: 2 }]],
    });

    await expect(run(db)).rejects.toThrow(
      'Unique-key cleanup for source_import_runs_ad_keyword_generation_key cannot remove a duplicate row that '
        + 'ADR-0010 kept rows reference: coupang_direct_transport_receipts.rocket_purchase_confirmation_id (1), '
        + "coupang_direct_transport_consumptions.source_import_run_id (1). The migration's transaction rolls back.",
    );
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('lists each table once, with its required column and a reason, the ingestion runs last with the recorded approval', () => {
    expect(REQUIRED_COLUMN_CLEANUPS.map(({ table, requiredColumn }) => [table, requiredColumn]))
      .toEqual(Object.entries(REQUIRED));
    const keptTables: string[] = Object.values(ADR_0010_KEPT_TABLES).flat();
    const listed: readonly RequiredColumnCleanup[] = REQUIRED_COLUMN_CLEANUPS;
    for (const { table, reason, dependents } of listed) {
      expect(keptTables, table).not.toContain(table);
      expect(reason.trim().length, table).toBeGreaterThan(40);
      for (const step of dependents ?? []) {
        expect(step.action, `${step.table}.${step.column}`).toBe('delete');
        expect(keptTables, step.table).not.toContain(step.table);
      }
    }
    expect(listed.map(({ ownerApproval }) => ownerApproval ?? null)).toEqual([
      ...ROW_TABLES.map(() => null),
      { by: 'release owner', at: '2026-09-17', scope: 'v0.1.31 cutover impact inventory (KID-239)' },
    ]);
    expect(Object.isFrozen(REQUIRED_COLUMN_CLEANUPS)).toBe(true);

    const runs = REQUIRED_COLUMN_CLEANUPS.at(-1)!;
    // Every Office foreign key is a declared step, and the six snapshot tables
    // are declared for a database where v0.1.31's keys already exist.
    for (const foreignKey of OFFICE_RUN_FOREIGN_KEYS) {
      expect(runs.dependents, `${foreignKey.table}.${foreignKey.column}`).toContainEqual(
        expect.objectContaining(foreignKey),
      );
    }
    for (const table of SOURCING_TABLES) {
      expect(runs.dependents).toContainEqual({
        action: 'delete',
        table,
        column: 'ingestion_run_id',
        references: RUNS,
        kind: 'collected',
      });
    }
    expect(RUN_DEPENDENT_TABLES.filter((table) =>
      runs.dependents!.some((step) => step.table === table && step.action === 'delete' && step.kind === 'human-entered')))
      .toEqual([INTENTS, 'sourcing_decision_evidence', ITEMS, LAUNCHES, TIERS, SNAPSHOTS, 'sourcing_review_batch_items']);
  });

  it('removes an import run with every Office foreign key declared, and only unlinks or keeps ADR-0010 kept rows', () => {
    const keptTables: string[] = Object.values(ADR_0010_KEPT_TABLES).flat();
    for (const cleanup of UNIQUE_KEY_CLEANUPS) {
      expect(cleanup.dependents, cleanup.index).toBe(IMPORT_RUN_STEPS);
      expect(cleanup.ownerApproval, cleanup.index)
        .toEqual({ by: 'release owner', at: '2026-09-17', scope: 'v0.1.31 cutover impact inventory (KID-239)' });
    }
    for (const foreignKey of [...OFFICE_IMPORT_RUN_FOREIGN_KEYS, ...TRANSPORT_FOREIGN_KEYS]) {
      expect(IMPORT_RUN_STEPS, `${foreignKey.table}.${foreignKey.column}`).toContainEqual(
        expect.objectContaining(foreignKey),
      );
    }
    const byAction = (action: string) => IMPORT_RUN_STEPS
      .filter((step) => step.action === action)
      .map((step) => `${step.table}.${step.column}`);
    expect(byAction('keep')).toEqual([
      'coupang_direct_transport_receipts.effect_source_import_run_id',
      'coupang_direct_transport_consumptions.source_import_run_id',
    ]);
    for (const step of IMPORT_RUN_STEPS.filter((candidate) => keptTables.includes(candidate.table))) {
      expect(step.action, `${step.table}.${step.column}`).not.toBe('delete');
    }
    expect(byAction('unlink')).toEqual(expect.arrayContaining([
      'coupang_direct_transport_receipts.rocket_purchase_confirmation_id',
      'orders.source_import_run_id',
    ]));
    // The owner accepted losing the Rocket purchase confirmations a removed run takes with it.
    expect([...new Set(IMPORT_RUN_STEPS
      .filter((step) => step.action === 'delete' && step.kind === 'human-entered')
      .map((step) => step.table))]).toEqual([ALLOCATIONS, LINES, TRANSMISSIONS, CONFIRMATIONS]);
  });

  it('lists tables whose schema requires the column; only the ingestion runs have a database default, and nothing has foreign keys into the ledgers', () => {
    const models = prismaModelsByTable();
    const foreignKeysInto = (modelName: string) =>
      [...models.values()]
        .filter(({ body }) =>
          new RegExp(`^\\s*\\w+\\s+${modelName}\\??\\s+@relation\\([^)]*\\bfields\\s*:`, 'm').test(body))
        .map(({ name }) => name);
    const listedModels = TABLES.map((table) => models.get(table)?.name);

    expect(listedModels).not.toContain(undefined);
    // The pattern does find foreign keys. The ledgers keep `operationId` as a
    // plain scalar with no relation to the run table (KID-360).
    expect(foreignKeysInto('Organization')).toContain('Alert');
    expect(foreignKeysInto('SourcingEvidenceIngestionRun')).toEqual([]);

    for (const table of TABLES) {
      const model = models.get(table)!;
      const field = model.body
        .split('\n')
        .map((line) => line.match(/^\s*(\w+)\s+(\w+)(\??)(\[\])?\s+(.*)$/))
        .find((match) => match?.[5]?.includes(`@map("${SCHEMA_COLUMN(table)}")`));

      expect(field, `${table}.${SCHEMA_COLUMN(table)}`).toBeDefined();
      const [, , type, optional, list, attributes] = field!;
      // Required scalar: `db push` adds it as NOT NULL.
      expect(optional, table).toBe('');
      expect(list, table).toBeUndefined();
      if (table === RUNS) {
        // The marker has a database default, so old runs fit it; the entry
        // exists because v0.1.31 cannot read them.
        expect(type, table).toBe('Boolean');
        expect(attributes, table).toMatch(/@default\(false\)/);
        continue;
      }
      expect(type, table).toBe('String');
      // `@default(uuid())` is generated by the Prisma client, so the database
      // gets no DEFAULT to fill existing rows; any other default would.
      const defaultsInDatabase = /@default\(/.test(attributes!) && !/@default\(uuid\(\)\)/.test(attributes!);
      expect(defaultsInDatabase, table).toBe(false);
      // Nothing restricts deleting these rows, and no delete cascades from them.
      expect(foreignKeysInto(model.name), table).toEqual([]);
    }
  });

  it('pins every unique-key entry to the index core.prisma declares', () => {
    const model = prismaModelsByTable().get(IMPORT_RUNS)!;
    const columns = columnByField(model);
    const declared = new Map<string, { columns: string[]; where: string | null }>();
    for (const match of model.body.matchAll(/@@unique\(\[([^\]]+)\], map: "([^"]+)"(?:, where: raw\("(.*)"\))?\)/g)) {
      declared.set(match[2]!, {
        columns: match[1]!.split(',').map((field) => columns.get(field.trim())!),
        where: match[3] ?? null,
      });
    }

    expect(UNIQUE_KEY_CLEANUPS).toHaveLength(16);
    for (const cleanup of UNIQUE_KEY_CLEANUPS) {
      expect(cleanup.table).toBe(IMPORT_RUNS);
      expect(declared.get(cleanup.index), cleanup.index).toEqual({
        columns: [...cleanup.columns],
        where: uniqueKeyPredicateText(cleanup),
      });
    }
  });

  it('marks a stale running duplicate failed, a status the constraint allows, and never neutralizes a generation', () => {
    expect(SOURCE_IMPORT_RUN_STATUSES).toContain(SOURCE_IMPORT_RUN_FAILED_STATUS);
    for (const cleanup of UNIQUE_KEY_CLEANUPS) {
      const running = cleanup.where.some((term) =>
        term.column === 'status' && 'equals' in term && term.equals === SOURCE_IMPORT_RUN_RUNNING_STATUS);
      expect(cleanup.neutralize, cleanup.index).toEqual(
        running ? { column: 'status', value: SOURCE_IMPORT_RUN_FAILED_STATUS } : undefined,
      );
      expect(cleanup.index.endsWith(running ? '_running_key' : '_generation_key'), cleanup.index).toBe(true);
    }
  });

  it('accounts for every other unique index the release adds to a table Office already has', () => {
    const schema = prismaSchema();
    const skipped = Object.keys(UNIQUE_KEYS_WITHOUT_CLEANUP);
    expect(skipped).toHaveLength(27);
    for (const index of skipped) {
      // The six snapshot keys carry Prisma's generated names; the PostgreSQL
      // spec finds every name on the pushed schema.
      const generated = SOURCING_TABLES.some((table) => index.startsWith(`${table}_organization_id_`));
      if (!generated) expect(schema, index).toContain(`map: "${index}"`);
      expect(UNIQUE_KEY_CLEANUPS.map((cleanup) => cleanup.index), index).not.toContain(index);
      expect(UNIQUE_KEYS_WITHOUT_CLEANUP[index]!.length, index).toBeGreaterThan(40);
    }
    expect(Object.isFrozen(UNIQUE_KEYS_WITHOUT_CLEANUP)).toBe(true);
  });

  it('registers as a v0.1.31 pre-schema migration after 007 and 012', () => {
    expect(removeRowsBlockingRequiredColumnsMigration).toMatchObject({
      id: 'v0.1.31:014_remove_rows_blocking_required_columns',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
    expect(dataMigrations).toContain(removeRowsBlockingRequiredColumnsMigration);
    const ids = dataMigrations.map((migration) => migration.id);
    expect(ids.indexOf('v0.1.31:014_remove_rows_blocking_required_columns'))
      .toBeGreaterThan(ids.indexOf('v0.1.31:012_constrain_source_import_run_status'));
    expect(ids.indexOf('v0.1.31:012_constrain_source_import_run_status'))
      .toBeGreaterThan(ids.indexOf('v0.1.31:007_normalize_source_import_run_completed_status'));
  });
});
