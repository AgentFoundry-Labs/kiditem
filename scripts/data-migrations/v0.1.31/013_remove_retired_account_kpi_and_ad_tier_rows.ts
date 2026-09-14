import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * The retired ad tier ladder's budget key. Nothing has read it since KID-90
 * removed its default, and the ladder itself is gone. Restated because a
 * migration records one moment.
 */
const RETIRED_AD_TIER_DAILY_BUDGET_KEY = 'ads.tier.dailyBudget';

type ShapeRow = { account_kpi_table_present: boolean };
type DeletedKpiRow = { raw_snapshot_id: string | null };

type Details = {
  accountKpiTablePresent: boolean;
  deletedAccountKpiRows: number;
  accountKpiRawSnapshotRows: number;
  deletedAccountKpiRawSnapshotRows: number;
  retainedSharedRawSnapshotRows: number;
  deletedAdTierDailyBudgetSettingRows: number;
};

/**
 * KID-90: remove the rows the schema drop leaves without a purpose before
 * `db push` runs, under the data-loss policy (ADR-0010).
 *
 * - Account-day KPI rows. Their table is dropped, and they go first because
 *   `channel_account_daily_kpi_snapshots.raw_snapshot_id` restricts deleting
 *   the raw rows they point at.
 * - The raw scrape rows only those KPI rows used. A raw row that a
 *   listing-day, option-day or ad-target-day fact still references stays: each
 *   of those references also restricts the delete, and the kept ledgers read
 *   that evidence.
 * - The `ads.tier.dailyBudget` system setting.
 *
 * Every other dropped table or column leaves with its rows in the schema step.
 * Users and organizations, channel accounts, confirmed recipes, orders and
 * transport receipts are not touched.
 *
 * Pre-schema with fixed identifiers, because the post-drop Prisma client has
 * no KPI model. The KPI table is guarded on information_schema, so a second
 * run, before or after `db push`, affects no rows.
 */
export async function removeRetiredAccountKpiAndAdTierRows(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const [shape] = await tx.$queryRaw<ShapeRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'channel_account_daily_kpi_snapshots'
    ) AS account_kpi_table_present
  `;
  const accountKpiTablePresent = shape?.account_kpi_table_present === true;

  let deletedAccountKpiRows = 0;
  let accountKpiRawSnapshotRows = 0;
  let deletedAccountKpiRawSnapshotRows = 0;
  if (accountKpiTablePresent) {
    const deletedKpis = await tx.$queryRaw<DeletedKpiRow[]>`
      DELETE FROM channel_account_daily_kpi_snapshots
      RETURNING raw_snapshot_id::text AS raw_snapshot_id
    `;
    deletedAccountKpiRows = deletedKpis.length;
    const rawSnapshotIds = [
      ...new Set(
        deletedKpis
          .map((row) => row.raw_snapshot_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    accountKpiRawSnapshotRows = rawSnapshotIds.length;
    if (rawSnapshotIds.length > 0) {
      // These are the kept tables whose raw_snapshot_id references
      // channel_scrape_snapshots with ON DELETE RESTRICT. The KPI rows were
      // the fourth, and they are gone above.
      deletedAccountKpiRawSnapshotRows = await tx.$executeRaw`
        DELETE FROM channel_scrape_snapshots snapshot
        WHERE snapshot.id = ANY(${rawSnapshotIds}::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM channel_listing_daily_snapshots fact
            WHERE fact.raw_snapshot_id = snapshot.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM channel_listing_option_daily_snapshots fact
            WHERE fact.raw_snapshot_id = snapshot.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM channel_ad_target_daily_snapshots fact
            WHERE fact.raw_snapshot_id = snapshot.id
          )
      `;
    }
  }

  const deletedAdTierDailyBudgetSettingRows = await tx.$executeRaw`
    DELETE FROM system_settings
    WHERE key = ${RETIRED_AD_TIER_DAILY_BUDGET_KEY}
  `;

  const details: Details = {
    accountKpiTablePresent,
    deletedAccountKpiRows,
    accountKpiRawSnapshotRows,
    deletedAccountKpiRawSnapshotRows,
    retainedSharedRawSnapshotRows:
      accountKpiRawSnapshotRows - deletedAccountKpiRawSnapshotRows,
    deletedAdTierDailyBudgetSettingRows,
  };
  return {
    affectedRows:
      deletedAccountKpiRows +
      deletedAccountKpiRawSnapshotRows +
      deletedAdTierDailyBudgetSettingRows,
    details,
  };
}

export const removeRetiredAccountKpiAndAdTierRowsMigration: DataMigration = {
  id: 'v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows',
  releaseVersion: '0.1.31',
  name: 'Remove account-day KPI rows, their raw scrape rows and the ad tier budget setting before the schema drop',
  phase: 'pre-schema',
  run: removeRetiredAccountKpiAndAdTierRows,
};
