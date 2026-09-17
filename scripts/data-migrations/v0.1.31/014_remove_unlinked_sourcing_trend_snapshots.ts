import { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * The sourcing trend snapshot tables whose `ingestion_run_id` the v0.1.31
 * source-owner cutover (#493) made required: `uuid NOT NULL` with no database
 * default, a foreign key to `sourcing_evidence_ingestion_runs`, and a unique
 * key that includes it. The Naver and Shorts rows cascade with their run; the
 * live commerce and TikTok rows restrict deleting it. No table references any
 * of them. Restated because a migration records one moment.
 */
export const SOURCING_TREND_SNAPSHOT_TABLES = [
  'naver_keyword_daily_snapshots',
  'naver_popular_keyword_daily_snapshots',
  'shorts_trend_daily_snapshots',
  'live_commerce_broadcast_daily_snapshots',
  'live_commerce_product_daily_snapshots',
  'tiktok_creative_trend_daily_snapshots',
] as const;

type SnapshotTable = (typeof SOURCING_TREND_SNAPSHOT_TABLES)[number];

type ShapeRow = { table_name: string; ingestion_run_id_present: boolean };

type TableDetails = {
  tablePresent: boolean;
  ingestionRunIdPresent: boolean;
  deletedRows: number;
};

/**
 * KID-239: before `db push` adds the required `ingestion_run_id`, delete the
 * sourcing trend snapshot rows written before it existed, under the data-loss
 * policy (ADR-0010).
 *
 * Such a row names no ingestion attempt, so it cannot satisfy the new NOT NULL
 * foreign key, and `db push` cannot add a required column without a default to
 * a table that still has rows. v0.1.30:005 kept these rows as canonical
 * inputs. Sourcing is not in service yet, so they are deleted, not backfilled,
 * and the sources collect again as attempts.
 *
 * Pre-schema with whitelisted identifiers. A table the database does not have
 * is skipped. A table that already has `ingestion_run_id` is on the new
 * schema, where every row names its run, so nothing is deleted from it and a
 * run after `db push` affects no rows. A second run before `db push` finds the
 * tables already empty.
 */
export async function removeUnlinkedSourcingTrendSnapshots(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const shapes = await tx.$queryRaw<ShapeRow[]>`
    SELECT
      t.table_name::text AS table_name,
      EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
          AND c.column_name = 'ingestion_run_id'
      ) AS ingestion_run_id_present
    FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_name::text = ANY(${[...SOURCING_TREND_SNAPSHOT_TABLES]}::text[])
  `;
  const shapeByTable = new Map(shapes.map((shape) => [shape.table_name, shape]));

  const tables: Array<[SnapshotTable, TableDetails]> = [];
  for (const table of SOURCING_TREND_SNAPSHOT_TABLES) {
    const shape = shapeByTable.get(table);
    const tablePresent = shape !== undefined;
    const ingestionRunIdPresent = shape?.ingestion_run_id_present === true;
    const deletedRows = tablePresent && !ingestionRunIdPresent
      ? await tx.$executeRaw`DELETE FROM ${snapshotTable(table)}`
      : 0;
    tables.push([table, { tablePresent, ingestionRunIdPresent, deletedRows }]);
  }

  return {
    affectedRows: tables.reduce((total, [, details]) => total + details.deletedRows, 0),
    details: Object.fromEntries(tables),
  };
}

export const removeUnlinkedSourcingTrendSnapshotsMigration: DataMigration = {
  id: 'v0.1.31:014_remove_unlinked_sourcing_trend_snapshots',
  releaseVersion: '0.1.31',
  name: 'Remove sourcing trend snapshot rows without an ingestion run before the schema requires one',
  phase: 'pre-schema',
  run: removeUnlinkedSourcingTrendSnapshots,
};

function snapshotTable(table: SnapshotTable): Prisma.Sql {
  if (!SOURCING_TREND_SNAPSHOT_TABLES.includes(table)) {
    throw new Error(`Unexpected sourcing trend snapshot table: ${table}`);
  }
  return Prisma.raw(table);
}
