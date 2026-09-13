import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type CountRow = { retired_alert_rows: bigint | number | string };

/**
 * The surviving alert kind at this release. `ALERT_KINDS` in
 * `@kiditem/shared/alerts` is the live contract; it is restated here rather than
 * imported because a migration is a record of one moment and must not drift when
 * that contract later gains a kind.
 */
const SURVIVING_KIND = 'signal';

/**
 * Remove the retired `operation` alerts before the strict alert schema is
 * deployed — the sibling of `004`, for the same reason and in the same phase.
 *
 * These rows belong to the generic Operation/Automation concept this cutover
 * removes. They are keyed by `alerts.operation_key`, a column the schema step
 * drops, and they carry `kind = 'operation'`, which `ALERT_KINDS` no longer
 * admits: after the schema step the alert read cannot parse them at all.
 *
 * They also block the schema step outright. `Alert.dedupeKey` arrives as
 * `@default(uuid())`, which Prisma generates client-side and so leaves no
 * database DEFAULT behind — `db push` refuses to add a required column to a
 * table that has rows. Backfilling a dedupe key for these rows was the obvious
 * reading, and it is the wrong one: it would mint fresh identity for rows the
 * post-cutover contract cannot represent, and the `(organizationId, dedupeKey)`
 * unique index would then be protecting nothing. Removing them empties the
 * table, and the column arrives against no rows.
 *
 * Deliberately narrow: only the retired kind is removed. A `signal` alert is
 * current-contract data and is never touched here.
 */
export const removeRetiredOperationAlerts: DataMigration = {
  id: 'v0.1.31:005_remove_retired_operation_alerts',
  releaseVersion: '0.1.31',
  name: 'Remove retired operation alerts before the strict alert schema',
  phase: 'pre-schema',
  async run(tx: Prisma.TransactionClient): Promise<MigrationResult> {
    const [before] = await tx.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS retired_alert_rows
      FROM alerts
      WHERE kind <> ${SURVIVING_KIND}
    `;
    const retiredAlertRows = toCount(before?.retired_alert_rows);
    const [survivors] = await tx.$queryRaw<Array<{ surviving_rows: bigint | number | string }>>`
      SELECT COUNT(*)::bigint AS surviving_rows
      FROM alerts
      WHERE kind = ${SURVIVING_KIND}
    `;
    const survivingRows = toCount(survivors?.surviving_rows);

    if (retiredAlertRows === 0) {
      return {
        affectedRows: 0,
        details: { retiredAlertRows: 0, removedAlertRows: 0, survivingRows },
      };
    }

    const removedAlertRows = await tx.$executeRaw`
      DELETE FROM alerts
      WHERE kind <> ${SURVIVING_KIND}
    `;
    // A count that moved between the read and the delete means a writer is still
    // running, which the cutover's writer-stop gate is supposed to rule out.
    if (removedAlertRows !== retiredAlertRows) {
      throw new Error('Retired alert cleanup changed an unexpected number of rows.');
    }

    return {
      affectedRows: removedAlertRows,
      details: {
        retiredAlertRows,
        removedAlertRows,
        // Recorded so the ledger shows what the schema step will face: a
        // surviving row still needs a dedupe key from somewhere.
        survivingRows,
      },
    };
  },
};

function toCount(value: bigint | number | string | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}
