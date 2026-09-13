import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type ShapeRow = {
  table_exists: boolean;
  approval_status_column_exists: boolean;
};

type DeletedMisfitRow = {
  approval_status: string;
  status: string;
  deleted_rows: bigint | number | string;
};

/**
 * KID-123: keep only the user's approval outcome, as `approval_decision`,
 * before the schema drops the stored `approval_status` word. Agent OS derives
 * not_required / pending / expired / approved / rejected from the admission
 * facts, the decision, the invocation status, and the evaluation time.
 *
 * approved and rejected rows carry that decision; every other kept row has
 * none. A row is kept only when its facts still produce its stored word:
 *   - not_required: no approval request and no decision facts;
 *   - pending: a complete request (input hash, request and expiry times), no
 *     decision facts, and a pending invocation. A lapsed window reads as
 *     expired, as the lazy expiry already treated it;
 *   - expired: a complete request, no decision facts, and a closed window or a
 *     finished invocation;
 *   - approved / rejected: a complete request and a decision time.
 * Every other row, unknown words included, is deleted (ADR-0010). No foreign
 * key references capability_invocations, so a deletion removes only that row.
 *
 * Pre-schema with fixed identifiers, because the current Prisma client no
 * longer knows `approvalStatus`. It is guarded on information_schema, so a run
 * after `db push` dropped the column adds nothing and deletes nothing.
 */
export async function backfillCapabilityApprovalDecision(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const [shape] = await tx.$queryRaw<ShapeRow[]>`
    SELECT
      to_regclass('public.capability_invocations') IS NOT NULL AS table_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'capability_invocations'
          AND column_name = 'approval_status'
      ) AS approval_status_column_exists
  `;
  const capabilityInvocationTablePresent = shape?.table_exists === true;
  const approvalStatusColumnPresent = shape?.approval_status_column_exists === true;
  if (!capabilityInvocationTablePresent) {
    return unchanged({ capabilityInvocationTablePresent, approvalStatusColumnPresent });
  }

  await tx.$executeRaw`
    ALTER TABLE capability_invocations
    ADD COLUMN IF NOT EXISTS approval_decision text
  `;
  if (!approvalStatusColumnPresent) {
    return unchanged({ capabilityInvocationTablePresent, approvalStatusColumnPresent });
  }

  const deleted = await tx.$queryRaw<DeletedMisfitRow[]>`
    WITH deleted AS (
      DELETE FROM capability_invocations
      WHERE (
        (approval_decision IS NULL OR approval_decision = approval_status)
        AND (
          (
            approval_status = 'not_required'
            AND approval_input_hash IS NULL
            AND approval_requested_at IS NULL
            AND approval_expires_at IS NULL
            AND approval_decided_at IS NULL
            AND approval_decided_by_user_id IS NULL
            AND approval_decision_reason IS NULL
          )
          OR (
            approval_input_hash IS NOT NULL
            AND approval_requested_at IS NOT NULL
            AND approval_expires_at IS NOT NULL
            AND (
              (
                approval_status IN ('approved', 'rejected')
                AND approval_decided_at IS NOT NULL
              )
              OR (
                approval_decided_at IS NULL
                AND approval_decided_by_user_id IS NULL
                AND approval_decision_reason IS NULL
                AND (
                  (approval_status = 'pending' AND status = 'pending')
                  OR (
                    approval_status = 'expired'
                    AND (status <> 'pending' OR approval_expires_at <= now())
                  )
                )
              )
            )
          )
        )
      ) IS NOT TRUE
      RETURNING approval_status, status
    )
    SELECT
      left(approval_status, 64) AS approval_status,
      left(status, 64) AS status,
      COUNT(*)::bigint AS deleted_rows
    FROM deleted
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  const deletedMisfits = deleted.map((row) => ({
    approvalStatus: row.approval_status,
    status: row.status,
    rows: toCount(row.deleted_rows),
  }));
  const deletedMisfitRows = deletedMisfits.reduce((total, row) => total + row.rows, 0);

  const carriedDecisionRows = await tx.$executeRaw`
    UPDATE capability_invocations
    SET approval_decision = approval_status
    WHERE approval_status IN ('approved', 'rejected')
      AND approval_decision IS DISTINCT FROM approval_status
  `;

  return {
    affectedRows: deletedMisfitRows + carriedDecisionRows,
    details: {
      capabilityInvocationTablePresent,
      approvalStatusColumnPresent,
      deletedMisfitRows,
      deletedMisfits,
      carriedDecisionRows,
    },
  };
}

export const backfillCapabilityApprovalDecisionMigration: DataMigration = {
  id: 'v0.1.31:009_backfill_capability_approval_decision',
  releaseVersion: '0.1.31',
  name: 'Keep capability approval decisions before approval_status is dropped',
  phase: 'pre-schema',
  run: backfillCapabilityApprovalDecision,
};

function unchanged(shape: {
  capabilityInvocationTablePresent: boolean;
  approvalStatusColumnPresent: boolean;
}): MigrationResult {
  return {
    affectedRows: 0,
    details: {
      ...shape,
      deletedMisfitRows: 0,
      deletedMisfits: [],
      carriedDecisionRows: 0,
    },
  };
}

function toCount(value: DeletedMisfitRow['deleted_rows']): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Capability approval cleanup returned an invalid row count.');
  }
  return count;
}
