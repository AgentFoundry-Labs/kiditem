import { Prisma } from '@prisma/client';
import {
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_STATUSES,
} from '@kiditem/shared/source-import';
import {
  ensureSourceImportRunStatusCheck,
  type SourceImportRunStatusCheckOutcome,
} from '../helpers/source-import-run-status-check';
import type { DataMigration, MigrationResult } from '../types';

const RUNS = 'source_import_runs';
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/** What happens to a row whose foreign key reaches a run with an unknown status. */
export type SourceImportRunCleanupStep = Readonly<{
  /**
   * keep: the row is carried forward, so its run stays and is marked failed.
   * clear: the row stays and the pointer becomes NULL.
   * delete: the row is deleted.
   */
  action: 'keep' | 'clear' | 'delete';
  table: string;
  column: string;
  /** `source_import_runs`, or a table a `delete` step empties by run. */
  references: string;
  /** Columns cleared together with `column`. */
  alsoClear?: readonly string[];
}>;

export type SourceImportRunCleanupDetails = {
  allowedStatuses: string[];
  unknownStatuses: Array<{ status: string; runs: number }>;
  failedCarriedForwardRuns: number;
  deletedRuns: number;
  deletedRows: Record<string, number>;
  clearedReferences: Record<string, number>;
  statusCheck: SourceImportRunStatusCheckOutcome;
};

type StatusCountRow = { status: string; row_count: bigint | number | string };
type ColumnRow = { table_name: string; column_name: string };

/** A publication is all of these or none of them. */
const ABC_PUBLICATION = [
  'published_sellpia_source_import_run_id',
  'published_advertising_source_import_run_id',
  'published_mapping_generation',
  'published_at',
  'official_cutoff_date',
] as const;

/**
 * Every foreign key into source_import_runs, or into a table this cleanup
 * empties by run, as of this release and the Office schema before it. Steps
 * run in this order, so a reference into a row is cleared or deleted before
 * the row itself goes.
 */
export const SOURCE_IMPORT_RUN_CLEANUP_STEPS: readonly SourceImportRunCleanupStep[] = [
  // Transport receipts and Rocket purchase confirmations and transmissions are
  // carried forward (ADR-0010): losing them could repeat a transport effect.
  { action: 'keep', table: 'coupang_direct_transport_receipts', column: 'effect_source_import_run_id', references: RUNS },
  { action: 'keep', table: 'rocket_purchase_confirmations', column: 'source_import_run_id', references: RUNS },
  { action: 'keep', table: 'rocket_purchase_confirmation_transmissions', column: 'source_import_run_id', references: RUNS },

  // Collected facts and collection evidence go with the run.
  { action: 'clear', table: 'ad_actions', column: 'ad_target_daily_id', references: 'channel_ad_target_daily_snapshots' },
  { action: 'delete', table: 'channel_ad_target_daily_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'clear', table: 'channel_ad_target_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { action: 'clear', table: 'channel_listing_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { action: 'clear', table: 'channel_listing_option_daily_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { action: 'clear', table: 'channel_account_daily_kpi_snapshots', column: 'raw_snapshot_id', references: 'channel_scrape_snapshots' },
  { action: 'delete', table: 'channel_scrape_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'clear', table: 'channel_scrape_snapshots', column: 'scrape_run_id', references: 'channel_scrape_runs' },
  { action: 'delete', table: 'channel_scrape_chunks', column: 'scrape_run_id', references: 'channel_scrape_runs' },
  { action: 'delete', table: 'channel_scrape_runs', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'rocket_po_catalog_lines', column: 'snapshot_id', references: 'rocket_po_catalog_snapshots' },
  { action: 'delete', table: 'rocket_po_catalog_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'channel_ad_listing_product_monthly_facts', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'coupang_keyword_rank_daily_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'coupang_keyword_serp_daily_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'coupang_wing_sales_rank_daily_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'coupang_shipment_date_summaries', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'sellpia_sales_daily_snapshots', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'sellpia_product_monthly_sales', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'order_collection_artifacts', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'coupang_direct_transport_consumptions', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'review_collection_chunks', column: 'source_import_run_id', references: RUNS },
  { action: 'delete', table: 'reviews', column: 'source_import_run_id', references: RUNS },

  // ABC calculations published from the run go, and a publication citing it is withdrawn.
  { action: 'delete', table: 'master_product_abc_evaluations', column: 'sellpia_source_import_run_id', references: RUNS },
  { action: 'delete', table: 'master_product_abc_evaluations', column: 'advertising_source_import_run_id', references: RUNS },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'previous_sellpia_source_import_run_id', references: RUNS },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'next_sellpia_source_import_run_id', references: RUNS },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'previous_advertising_source_import_run_id', references: RUNS },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'next_advertising_source_import_run_id', references: RUNS },
  { action: 'clear', table: 'master_product_abc_formula_states', column: 'published_sellpia_source_import_run_id', references: RUNS, alsoClear: ABC_PUBLICATION },
  { action: 'clear', table: 'master_product_abc_formula_states', column: 'published_advertising_source_import_run_id', references: RUNS, alsoClear: ABC_PUBLICATION },

  // Carried-forward rows lose only their pointer to the run.
  { action: 'clear', table: 'orders', column: 'source_import_run_id', references: RUNS },
  { action: 'clear', table: 'channel_listings', column: 'last_import_run_id', references: RUNS },
  { action: 'clear', table: 'channel_listing_options', column: 'last_import_run_id', references: RUNS },
  { action: 'clear', table: 'sellpia_inventory_skus', column: 'last_import_run_id', references: RUNS },
  { action: 'clear', table: 'sellpia_inventory_states', column: 'last_completed_import_run_id', references: RUNS },
];

/**
 * KID-124: `SourceImportRun.status` admits only `SOURCE_IMPORT_RUN_STATUSES`,
 * and PostgreSQL enforces the set with `source_import_runs_status_check`.
 *
 * 007 has already renamed the legacy `complete` spelling. Every run whose
 * status is still outside the set is deleted without inspecting it first
 * (ADR-0010). Collected facts, collection evidence and ABC calculations that
 * depend on it go with it and are collected or published again later. Rows
 * the cleanup carries forward lose only their pointer, and an ABC publication
 * citing the run is withdrawn whole. A run a transport receipt or a Rocket
 * purchase confirmation or transmission cites cannot go without them, so it is
 * kept and marked `failed`, the reading source-import-run-state already gives
 * an unknown status. The unknown words and every count are recorded.
 *
 * Pre-schema with fixed identifiers, because the tables differ between the
 * Office schema and this release. Each step runs only when its columns exist,
 * so a run after a later schema step removed a table skips that table, and a
 * second run deletes and clears nothing.
 */
export async function constrainSourceImportRunStatus(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const allowed = Prisma.join(SOURCE_IMPORT_RUN_STATUSES);
  const unknownRuns = Prisma.sql`
    SELECT id, organization_id FROM source_import_runs WHERE status NOT IN (${allowed})
  `;
  const unknownStatuses = toStatusCounts(await tx.$queryRaw<StatusCountRow[]>`
    SELECT left(status, 64) AS status, COUNT(*)::bigint AS row_count
    FROM source_import_runs
    WHERE status NOT IN (${allowed})
    GROUP BY 1
    ORDER BY 1
  `);
  const { steps, present } = await presentSteps(tx);

  const carriedForward = steps.filter((step) => step.action === 'keep');
  const failedCarriedForwardRuns = carriedForward.length === 0 ? 0 : await tx.$executeRaw`
    UPDATE source_import_runs run
    SET status = ${SOURCE_IMPORT_RUN_FAILED_STATUS}
    WHERE run.status NOT IN (${allowed})
      AND (${Prisma.join(carriedForward.map((step) => Prisma.sql`EXISTS (
        SELECT 1 FROM ${identifier(step.table)} cited
        WHERE cited.${identifier(step.column)} = run.id
          AND cited.organization_id = run.organization_id
      )`), ' OR ')})
  `;

  const deletedRows: Record<string, number> = {};
  const clearedReferences: Record<string, number> = {};
  for (const step of steps) {
    if (step.action === 'keep') continue;
    const matched = Prisma.sql`
      (${identifier(step.column)}, organization_id) IN (${referencedRows(steps, step, unknownRuns)})
    `;
    if (step.action === 'delete') {
      const deleted = await tx.$executeRaw`DELETE FROM ${identifier(step.table)} WHERE ${matched}`;
      deletedRows[step.table] = (deletedRows[step.table] ?? 0) + deleted;
      continue;
    }
    const cleared = [
      step.column,
      ...(step.alsoClear ?? []).filter((column) =>
        column !== step.column && present.has(`${step.table}.${column}`)),
    ];
    clearedReferences[`${step.table}.${step.column}`] = await tx.$executeRaw`
      UPDATE ${identifier(step.table)}
      SET ${Prisma.join(cleared.map((column) => Prisma.sql`${identifier(column)} = NULL`))}
      WHERE ${matched}
    `;
  }

  const deletedRuns = await tx.$executeRaw`
    DELETE FROM source_import_runs WHERE status NOT IN (${allowed})
  `;
  const statusCheck = await ensureSourceImportRunStatusCheck(tx);

  const details: SourceImportRunCleanupDetails = {
    allowedStatuses: [...SOURCE_IMPORT_RUN_STATUSES],
    unknownStatuses,
    failedCarriedForwardRuns,
    deletedRuns,
    deletedRows,
    clearedReferences,
    statusCheck,
  };
  return {
    affectedRows: failedCarriedForwardRuns + deletedRuns + sum(deletedRows) + sum(clearedReferences),
    details,
  };
}

export const constrainSourceImportRunStatusMigration: DataMigration = {
  id: 'v0.1.31:012_constrain_source_import_run_status',
  releaseVersion: '0.1.31',
  name: 'Delete SourceImportRun rows with unknown statuses and constrain the status set',
  phase: 'pre-schema',
  run: constrainSourceImportRunStatus,
};

async function presentSteps(tx: Prisma.TransactionClient): Promise<{
  steps: readonly SourceImportRunCleanupStep[];
  present: ReadonlySet<string>;
}> {
  const tables = [...new Set(SOURCE_IMPORT_RUN_CLEANUP_STEPS.map((step) => step.table))];
  const rows = await tx.$queryRaw<ColumnRow[]>`
    SELECT table_name::text AS table_name, column_name::text AS column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name::text IN (${Prisma.join(tables)})
  `;
  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const withColumns = SOURCE_IMPORT_RUN_CLEANUP_STEPS.filter((step) =>
    present.has(`${step.table}.${step.column}`) && present.has(`${step.table}.organization_id`));
  const steps = withColumns.filter((step) =>
    step.references === RUNS || runDeletion(withColumns, step.references) !== undefined);
  return { steps, present };
}

/** The rows `step` points at: unknown-status runs, or rows deleted because they cite one. */
function referencedRows(
  steps: readonly SourceImportRunCleanupStep[],
  step: SourceImportRunCleanupStep,
  unknownRuns: Prisma.Sql,
): Prisma.Sql {
  if (step.references === RUNS) return unknownRuns;
  const parent = runDeletion(steps, step.references);
  if (!parent) throw new Error(`No run deletion for ${step.references}.`);
  return Prisma.sql`
    SELECT id, organization_id FROM ${identifier(parent.table)}
    WHERE (${identifier(parent.column)}, organization_id) IN (${unknownRuns})
  `;
}

function runDeletion(
  steps: readonly SourceImportRunCleanupStep[],
  table: string,
): SourceImportRunCleanupStep | undefined {
  return steps.find((step) =>
    step.action === 'delete' && step.table === table && step.references === RUNS);
}

function identifier(name: string): Prisma.Sql {
  if (!IDENTIFIER.test(name)) throw new Error(`Unexpected identifier: ${name}`);
  return Prisma.raw(name);
}

function toStatusCounts(rows: StatusCountRow[]): Array<{ status: string; runs: number }> {
  return rows.map((row) => {
    const runs = Number(row.row_count);
    if (!Number.isSafeInteger(runs) || runs < 0) {
      throw new Error('SourceImportRun status cleanup read an invalid row count.');
    }
    return { status: row.status, runs };
  });
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}
