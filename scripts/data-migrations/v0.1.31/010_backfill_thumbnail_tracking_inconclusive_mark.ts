import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type ShapeRow = {
  table_exists: boolean;
  status_column_exists: boolean;
};

type Shape = {
  thumbnailTrackingTablePresent: boolean;
  statusColumnPresent: boolean;
};

/**
 * KID-90: keep the operator's 결론 없음 judgment as `marked_inconclusive_at`
 * before the schema drops the stored `status` word. AI derives tracking /
 * measured / inconclusive from that mark and the CTR before and after.
 *
 * A row stored as `inconclusive` gets its `updated_at`, the closest recorded
 * moment: the word was written by an update at or before that time. `tracking`
 * and `measured` rows carry nothing, because their CTR facts already derive a
 * status. Every row fits the new schema, so nothing is deleted (ADR-0010).
 *
 * Pre-schema with fixed identifiers, because the current Prisma client no
 * longer knows `status`. The column is added with the type `db push` creates,
 * so the schema step leaves it alone. It is guarded on information_schema, so a
 * re-run copies nothing, including after `db push` dropped `status`.
 */
export async function backfillThumbnailTrackingInconclusiveMark(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const [row] = await tx.$queryRaw<ShapeRow[]>`
    SELECT
      to_regclass('public.thumbnail_trackings') IS NOT NULL AS table_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'thumbnail_trackings'
          AND column_name = 'status'
      ) AS status_column_exists
  `;
  const shape: Shape = {
    thumbnailTrackingTablePresent: row?.table_exists === true,
    statusColumnPresent: row?.status_column_exists === true,
  };
  if (!shape.thumbnailTrackingTablePresent) return result(shape, 0);

  await tx.$executeRaw`
    ALTER TABLE thumbnail_trackings
    ADD COLUMN IF NOT EXISTS marked_inconclusive_at timestamptz
  `;
  if (!shape.statusColumnPresent) return result(shape, 0);

  const markedInconclusiveRows = await tx.$executeRaw`
    UPDATE thumbnail_trackings
    SET marked_inconclusive_at = updated_at
    WHERE status = 'inconclusive'
      AND marked_inconclusive_at IS NULL
  `;
  return result(shape, markedInconclusiveRows);
}

export const backfillThumbnailTrackingInconclusiveMarkMigration: DataMigration = {
  id: 'v0.1.31:010_backfill_thumbnail_tracking_inconclusive_mark',
  releaseVersion: '0.1.31',
  name: 'Keep the thumbnail tracking inconclusive mark before status is dropped',
  phase: 'pre-schema',
  run: backfillThumbnailTrackingInconclusiveMark,
};

function result(shape: Shape, markedInconclusiveRows: number): MigrationResult {
  return {
    affectedRows: markedInconclusiveRows,
    details: { ...shape, markedInconclusiveRows },
  };
}
