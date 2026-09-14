import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * Make `alerts.read_at` say exactly what `alerts.is_read` says, so the alert
 * read derives read state from `read_at` alone and the schema cutover (KID-90)
 * can drop `is_read`.
 *
 * Until 2026-05-08 an alert was marked read by setting `is_read` only; a row
 * kept from then would come back unread once readers look at `read_at`. The
 * reverse disagreement — unread, yet stamped — is cleared as well. Afterwards
 * the two columns agree on every row, so every alert reads as it did before.
 *
 * `updated_at` is the closest recorded moment for a read that stamped nothing,
 * and raw SQL leaves it untouched. Fixed identifiers keep this migration valid
 * after the Prisma client loses `isRead`, and a database that already lost the
 * column has nothing to reconcile. Pre-schema, so it runs before any schema
 * step in the same train removes the column.
 */
export async function backfillAlertReadAtFromIsRead(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const [isReadColumn] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'alerts'
        AND column_name = 'is_read'
    ) AS present
  `;
  if (isReadColumn?.present !== true) {
    return {
      affectedRows: 0,
      details: { stampedReadRows: 0, clearedStampRows: 0, isReadColumnPresent: false },
    };
  }

  const stampedReadRows = await tx.$executeRaw`
    UPDATE alerts
    SET read_at = updated_at
    WHERE is_read = TRUE AND read_at IS NULL
  `;
  const clearedStampRows = await tx.$executeRaw`
    UPDATE alerts
    SET read_at = NULL
    WHERE is_read = FALSE AND read_at IS NOT NULL
  `;
  return {
    affectedRows: stampedReadRows + clearedStampRows,
    details: { stampedReadRows, clearedStampRows, isReadColumnPresent: true },
  };
}

export const backfillAlertReadAtFromIsReadMigration: DataMigration = {
  id: 'v0.1.31:008_backfill_alert_read_at_from_is_read',
  releaseVersion: '0.1.31',
  name: 'Backfill alert read_at from is_read before reads derive from it',
  phase: 'pre-schema',
  run: backfillAlertReadAtFromIsRead,
};
