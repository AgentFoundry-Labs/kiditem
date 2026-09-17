import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type ShapeRow = {
  ad_actions_exists: boolean;
  execution_tasks_exists: boolean;
  stored_execution_columns: bigint | number | string;
};

type StatusCountRow = {
  status: string;
  row_count: bigint | number | string;
};

type StatusCount = { status: string; rows: number };

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

/** The failure message of any other approval closed at the cutover. */
export const CUTOVER_CLOSED_APPROVAL_MESSAGE =
  '배포 전환 때 실행하지 않고 닫은 옛 승인입니다. 필요하면 다시 승인해 주세요.';

/**
 * KID-122: an AdAction's execution state is its latest ExecutionTask, and the
 * five stored AdAction execution columns are dropped. Before they go, the
 * latest task must say what the stored columns say.
 *
 * Until KID-122 the browser extension's markRunning / markDone / markFailed
 * reports wrote only the AdAction copy, so every task it executed is still
 * `queued`. Read from those tasks, the actions would be queued for the
 * extension again and repeat their Coupang changes. For every action whose
 * stored word is running, done or failed and whose latest task reads
 * otherwise:
 *   - a latest task still `queued` takes the stored word, payload and message;
 *   - otherwise (no task, or a latest task that finished or was cancelled) a
 *     new task after it carries the stored word.
 * An approved action without any task gets a task carrying its stored word, so
 * every approved action has an attempt to report against. A stored `queued`
 * never rewrites a task that ran or was cancelled: that task stays the
 * action's state. Tasks leased by the retired worker lease route never started
 * and become `queued`.
 *
 * KID-230: after the cutover, no approval the old Office left unexecuted stays
 * executable. Office keeps its extension build from before #515 (1.0.23)
 * until the operator updates it. That build claims an action without naming
 * the attempt, ignores the server's answer, and writes to Coupang anyway. The
 * new server refuses those reports, so the action would stay queued and run
 * again on every "승인 액션 실행". That build also registers a campaign
 * without checking the existing ones, so a campaign could be registered
 * twice. Last, every approved action whose latest task still reads queued
 * ends failed. A task reads queued when it is `queued` or `cancelled`, and
 * the steps above gave every approved action a task.
 *   - A latest `queued` task becomes `failed` in place.
 *   - A latest `cancelled` task gets a new `failed` task after it.
 * A `MANUAL_AD_ACTION_TYPES` action, which the operator applies in the ad
 * center (KID-138), carries `MANUAL_AD_ACTION_MESSAGE`. Any other action
 * carries `CUTOVER_CLOSED_APPROVAL_MESSAGE`. Actions in review or rejected,
 * and the outcomes carried above, stay as they are.
 *
 * The latest-task rule (created_at, then id) and the status words restate
 * apps/server/src/advertising/read/ad-action-execution.ts, and the manual
 * types and message restate
 * apps/server/src/advertising/domain/execution-task-lifecycle.ts, as of this
 * release, so later code cannot change what this migration did.
 *
 * Pre-schema with fixed identifiers, because the Prisma client loses the
 * stored fields when they drop. It is guarded on information_schema, so a run
 * after `db push` dropped the columns changes nothing.
 */
export async function backfillAdActionExecutionTasks(
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

  const normalizedLeasedTasks = await tx.$executeRaw`
    UPDATE execution_tasks
    SET status = 'queued'
    WHERE status = 'leased'
  `;

  const carried = await tx.$queryRaw<StatusCountRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (task.action_id) task.id, task.action_id, task.status
      FROM execution_tasks task
      ORDER BY task.action_id, task.created_at DESC, task.id DESC
    ),
    carried AS (
      UPDATE execution_tasks task
      SET
        status = action.execute_status,
        finished_at = CASE
          WHEN action.execute_status = 'done' THEN action.executed_at
          ELSE task.finished_at
        END,
        before_json = action.before_json,
        after_json = action.after_json,
        error_message = CASE
          WHEN action.execute_status = 'failed' THEN action.error_message
          ELSE NULL
        END
      FROM latest
      JOIN ad_actions action ON action.id = latest.action_id
      WHERE task.id = latest.id
        AND latest.status = 'queued'
        AND action.execute_status IN ('running', 'done', 'failed')
      RETURNING task.status
    )
    SELECT left(status, 64) AS status, COUNT(*)::bigint AS row_count
    FROM carried
    GROUP BY 1
    ORDER BY 1
  `;

  const inserted = await tx.$queryRaw<StatusCountRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (task.action_id) task.action_id, task.status, task.created_at
      FROM execution_tasks task
      ORDER BY task.action_id, task.created_at DESC, task.id DESC
    ),
    inserted AS (
      INSERT INTO execution_tasks (
        id,
        action_id,
        status,
        finished_at,
        before_json,
        after_json,
        error_message,
        created_at
      )
      SELECT
        gen_random_uuid(),
        action.id,
        action.execute_status,
        CASE WHEN action.execute_status = 'done' THEN action.executed_at END,
        action.before_json,
        action.after_json,
        CASE WHEN action.execute_status = 'failed' THEN action.error_message END,
        CASE
          WHEN latest.action_id IS NULL THEN COALESCE(action.approved_at, action.created_at)
          ELSE GREATEST(now(), latest.created_at + interval '1 millisecond')
        END
      FROM ad_actions action
      LEFT JOIN latest ON latest.action_id = action.id
      WHERE (
          action.execute_status IN ('running', 'done', 'failed')
          AND COALESCE(
            CASE latest.status
              WHEN 'queued' THEN 'queued'
              WHEN 'cancelled' THEN 'queued'
              WHEN 'running' THEN 'running'
              WHEN 'done' THEN 'done'
              WHEN 'failed' THEN 'failed'
              ELSE latest.status
            END,
            'queued'
          ) <> action.execute_status
        )
        OR (action.approval_status = 'approved' AND latest.action_id IS NULL)
      RETURNING status
    )
    SELECT left(status, 64) AS status, COUNT(*)::bigint AS row_count
    FROM inserted
    GROUP BY 1
    ORDER BY 1
  `;

  // KID-230: every approved action whose latest task still reads queued ends
  // failed. A task added after a cancelled one is created and finished at the
  // same instant, after the cancelled one, so it becomes the latest.
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

  const carriedIntoQueuedTasks = toStatusCounts(carried);
  const insertedTasks = toStatusCounts(inserted);
  const closedAtCutover = toClosedKindCounts(closed);
  return {
    affectedRows:
      normalizedLeasedTasks +
      sumRows(carriedIntoQueuedTasks) +
      sumRows(insertedTasks) +
      sumRows(closedAtCutover),
    details: {
      storedExecutionColumnsPresent,
      normalizedLeasedTasks,
      carriedIntoQueuedTasks,
      insertedTasks,
      closedAtCutover,
    },
  };
}

export const backfillAdActionExecutionTasksMigration: DataMigration = {
  id: 'v0.1.31:011_backfill_ad_action_execution_tasks',
  releaseVersion: '0.1.31',
  name: 'Carry stored ad action execution state into the latest execution task and close approvals that never ran, before the stored columns drop',
  phase: 'pre-schema',
  run: backfillAdActionExecutionTasks,
};

function unchanged(): MigrationResult {
  return {
    affectedRows: 0,
    details: {
      storedExecutionColumnsPresent: false,
      normalizedLeasedTasks: 0,
      carriedIntoQueuedTasks: [],
      insertedTasks: [],
      closedAtCutover: [],
    },
  };
}

function toStatusCounts(rows: StatusCountRow[]): StatusCount[] {
  return rows.map((row) => ({ status: row.status, rows: toRowCount(row.row_count) }));
}

function toClosedKindCounts(rows: ClosedKindCountRow[]): ClosedKindCount[] {
  return rows.map((row) => ({ kind: row.kind, rows: toRowCount(row.row_count) }));
}

function toRowCount(value: bigint | number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Ad action execution backfill returned an invalid row count.');
  }
  return count;
}

function sumRows(counts: ReadonlyArray<{ rows: number }>): number {
  return counts.reduce((total, row) => total + row.rows, 0);
}
