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

const STORED_EXECUTION_COLUMNS = 5;

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
 * The latest-task rule (created_at, then id) and the status words restate
 * apps/server/src/advertising/read/ad-action-execution.ts as of this release,
 * so later code cannot change what this migration did.
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

  const carriedIntoQueuedTasks = toStatusCounts(carried);
  const insertedTasks = toStatusCounts(inserted);
  return {
    affectedRows:
      normalizedLeasedTasks + sumRows(carriedIntoQueuedTasks) + sumRows(insertedTasks),
    details: {
      storedExecutionColumnsPresent,
      normalizedLeasedTasks,
      carriedIntoQueuedTasks,
      insertedTasks,
    },
  };
}

export const backfillAdActionExecutionTasksMigration: DataMigration = {
  id: 'v0.1.31:011_backfill_ad_action_execution_tasks',
  releaseVersion: '0.1.31',
  name: 'Carry stored ad action execution state into the latest execution task before its columns drop',
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
    },
  };
}

function toStatusCounts(rows: StatusCountRow[]): StatusCount[] {
  return rows.map((row) => {
    const count = Number(row.row_count);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Ad action execution backfill returned an invalid row count.');
    }
    return { status: row.status, rows: count };
  });
}

function sumRows(counts: StatusCount[]): number {
  return counts.reduce((total, row) => total + row.rows, 0);
}
