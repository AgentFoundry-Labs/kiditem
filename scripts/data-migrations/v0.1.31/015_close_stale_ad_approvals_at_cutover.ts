import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type ShapeRow = {
  ad_actions_exists: boolean;
  execution_tasks_exists: boolean;
  stored_execution_columns: bigint | number | string;
};

/** Whether a closed approval is one the operator applies by hand. */
type ClosedKind = 'manual' | 'other';

type ClosedKindCountRow = {
  kind: ClosedKind;
  row_count: bigint | number | string;
};

type ClosedKindCount = { kind: ClosedKind; rows: number };

const STORED_EXECUTION_COLUMNS = 5;

/** Action types the operator applies by hand in the Coupang ad center. */
export const MANUAL_AD_ACTION_TYPES = [
  'pause_keyword',
  'change_bid',
  'change_daily_budget',
] as const;

/** The failure message of a closed approval of a `MANUAL_AD_ACTION_TYPES` type. */
export const MANUAL_AD_ACTION_MESSAGE =
  '자동 실행하지 않는 액션입니다. 광고센터에서 직접 처리해 주세요.';

/**
 * The failure message of any other closed approval. Such an action is a
 * campaign registration: the web requests it again through
 * `POST /api/ads/campaigns/register`, and a failed registration does not hold
 * its campaign name.
 */
export const CUTOVER_CLOSED_APPROVAL_MESSAGE =
  '배포 전환 때 실행하지 않고 닫은 옛 승인입니다. 캠페인 등록이 필요하면 다시 요청해 주세요.';

/**
 * KID-230 (decision of 2026-09-18): after the v0.1.31 cutover, no ad action
 * that the old Office approved but never ran can be executed.
 *
 * Office keeps the extension built from `release/office` 2f0625cbc (manifest
 * 1.0.23, before #515) until the operator updates it. That build runs every
 * approved queued action from the popup's "승인 액션 실행" and in any tab
 * opened with `kiditemExecuteActions=1`. Its reports carry no
 * executionTaskId, so the new server answers 400 and the attempt never moves;
 * the build ignores the answer and writes to Coupang anyway, so every run
 * repeats the same approvals. Its campaign registration does not check the
 * existing campaigns, so a repeat registers a duplicate campaign.
 *
 * Every approved action whose latest execution task still reads queued
 * therefore ends failed:
 *   - A latest `queued` task becomes `failed` in place.
 *   - A latest `cancelled` task, which also reads queued, gets a new `failed`
 *     task after it, created and finished at one instant, so the new task is
 *     the latest.
 * A `MANUAL_AD_ACTION_TYPES` action, which the operator applies in the ad
 * center (KID-138), carries `MANUAL_AD_ACTION_MESSAGE`. Any other action,
 * campaign registrations included, carries `CUTOVER_CLOSED_APPROVAL_MESSAGE`.
 * Actions in review or rejected, and running, done or failed tasks, stay as
 * they are.
 *
 * It runs in the pre-schema phase after v0.1.31:011, which has carried the
 * stored execution words into the latest tasks and given every approved
 * action a task, so a task that still reads queued never ran. Like 011 it acts
 * only while ad_actions keeps its five stored execution columns, that is on
 * the old schema before `db push` drops them. A database past the schema step,
 * or created from the current schema, records a no-op, so an approval made
 * after the cutover is never closed.
 *
 * It is a new migration rather than an edit to 011 because local and QA
 * databases already ran 011, and an edited 011 reports source drift there.
 *
 * The latest-task rule (created_at, then id) and the status words restate
 * apps/server/src/advertising/read/ad-action-execution.ts, and the manual
 * types and message restate
 * apps/server/src/advertising/domain/execution-task-lifecycle.ts, as of this
 * release, so later code cannot change what this migration did.
 */
export async function closeStaleAdApprovalsAtCutover(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const [shape] = await tx.$queryRaw<ShapeRow[]>`
    SELECT
      to_regclass('public.ad_actions') IS NOT NULL AS ad_actions_exists,
      to_regclass('public.execution_tasks') IS NOT NULL AS execution_tasks_exists,
      (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ad_actions'
          AND column_name IN (
            'execute_status',
            'before_json',
            'after_json',
            'error_message',
            'executed_at'
          )
      ) AS stored_execution_columns
  `;
  const storedExecutionColumnsPresent =
    shape?.ad_actions_exists === true &&
    shape.execution_tasks_exists === true &&
    Number(shape.stored_execution_columns) === STORED_EXECUTION_COLUMNS;
  if (!storedExecutionColumnsPresent) return unchanged();

  const closed = await tx.$queryRaw<ClosedKindCountRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (task.action_id) task.id, task.action_id, task.status, task.created_at
      FROM execution_tasks task
      ORDER BY task.action_id, task.created_at DESC, task.id DESC
    ),
    stale AS (
      SELECT
        latest.id AS task_id,
        latest.action_id,
        latest.status,
        GREATEST(now(), latest.created_at + interval '1 millisecond') AS next_task_at,
        CASE
          WHEN action.action_type = ANY(${[...MANUAL_AD_ACTION_TYPES]}::text[]) THEN 'manual'
          ELSE 'other'
        END AS kind
      FROM latest
      JOIN ad_actions action ON action.id = latest.action_id
      WHERE action.approval_status = 'approved'
        AND latest.status IN ('queued', 'cancelled')
    ),
    closing AS (
      SELECT
        stale.*,
        CASE stale.kind
          WHEN 'manual' THEN ${MANUAL_AD_ACTION_MESSAGE}::text
          ELSE ${CUTOVER_CLOSED_APPROVAL_MESSAGE}::text
        END AS error_message
      FROM stale
    ),
    closed_in_place AS (
      UPDATE execution_tasks task
      SET
        status = 'failed',
        finished_at = now(),
        error_message = closing.error_message
      FROM closing
      WHERE task.id = closing.task_id
        AND closing.status = 'queued'
      RETURNING closing.kind
    ),
    closed_after_cancel AS (
      INSERT INTO execution_tasks (
        id,
        action_id,
        status,
        finished_at,
        error_message,
        created_at
      )
      SELECT
        gen_random_uuid(),
        closing.action_id,
        'failed',
        closing.next_task_at,
        closing.error_message,
        closing.next_task_at
      FROM closing
      WHERE closing.status = 'cancelled'
      RETURNING action_id
    ),
    closed AS (
      SELECT kind FROM closed_in_place
      UNION ALL
      SELECT closing.kind
      FROM closed_after_cancel
      JOIN closing ON closing.action_id = closed_after_cancel.action_id
    )
    SELECT kind, COUNT(*)::bigint AS row_count
    FROM closed
    GROUP BY kind
    ORDER BY kind
  `;

  const closedAtCutover = closed.map((row) => ({
    kind: row.kind,
    rows: toRowCount(row.row_count),
  }));
  return {
    affectedRows: closedAtCutover.reduce((total, row) => total + row.rows, 0),
    details: { storedExecutionColumnsPresent, closedAtCutover },
  };
}

export const closeStaleAdApprovalsAtCutoverMigration: DataMigration = {
  id: 'v0.1.31:015_close_stale_ad_approvals_at_cutover',
  releaseVersion: '0.1.31',
  name: 'Close approved ad actions the old Office never ran before the stored execution columns drop',
  phase: 'pre-schema',
  run: closeStaleAdApprovalsAtCutover,
};

function unchanged(): MigrationResult {
  const closedAtCutover: ClosedKindCount[] = [];
  return {
    affectedRows: 0,
    details: { storedExecutionColumnsPresent: false, closedAtCutover },
  };
}

function toRowCount(value: bigint | number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Stale ad approval closure returned an invalid row count.');
  }
  return count;
}
