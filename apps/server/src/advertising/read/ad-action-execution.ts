import { Prisma } from '@prisma/client';
import type { AdActionExecution } from '../application/port/out/repository/ad-action.repository.port';
import {
  EXECUTION_DEADLINE_EXCEEDED_MESSAGE,
  executionDeadlineCutoff,
  isExpiredRunningExecutionTask,
  type ExecutionTaskStatus,
} from '../domain/execution-task-lifecycle';

/**
 * An AdAction's execution state is its latest ExecutionTask; the action keeps
 * no copy of it (KID-122). This module states that rule once: the TypeScript
 * derivation, and the SQL predicates generated from the same status map, so a
 * filter or a count cannot disagree with the words an action displays.
 *
 * - Latest task: the greatest `created_at`, then the greatest `id`.
 * - No task: `queued`. A proposal awaiting review has no task yet and is still
 *   open work, as the stored column's default said.
 * - `cancelled` reads `queued`: a rejected action keeps the word it showed
 *   while the stored copy existed, and its approval status keeps it out of
 *   every execution queue. A status outside the map passes through unchanged,
 *   so an unexpected word never reads as queued work.
 * - A `running` task past its execution deadline reads `failed` with the
 *   deadline message (KID-160). Reading writes nothing; approval or a late
 *   report closes the task. A read judges the deadline at one `now`, and the
 *   SQL twin compares against the same instant.
 * - `errorMessage` is the failure message of a failed task and `executedAt` the
 *   finish time of a done task; `beforeJson` / `afterJson` are the task's own.
 */
type AdActionExecuteStatus = 'queued' | 'running' | 'done' | 'failed';

const EXECUTE_STATUS_BY_TASK_STATUS: Readonly<
  Record<ExecutionTaskStatus, AdActionExecuteStatus>
> = {
  queued: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed',
  cancelled: 'queued',
};

const NO_TASK_EXECUTE_STATUS: AdActionExecuteStatus = 'queued';
const EXPIRED_RUNNING_EXECUTE_STATUS: AdActionExecuteStatus = 'failed';

export interface LatestExecutionTask {
  id: string;
  status: string;
  beforeJson: Prisma.JsonValue | null;
  afterJson: Prisma.JsonValue | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export function deriveAdActionExecution(
  latestTask: LatestExecutionTask | null,
  now: Date,
): AdActionExecution {
  if (!latestTask) {
    return {
      executionTaskId: null,
      executeStatus: NO_TASK_EXECUTE_STATUS,
      beforeJson: null,
      afterJson: null,
      errorMessage: null,
      executedAt: null,
    };
  }
  if (isExpiredRunningExecutionTask(latestTask, now)) {
    return {
      executionTaskId: latestTask.id,
      executeStatus: EXPIRED_RUNNING_EXECUTE_STATUS,
      beforeJson: latestTask.beforeJson,
      afterJson: latestTask.afterJson,
      errorMessage: EXECUTION_DEADLINE_EXCEEDED_MESSAGE,
      executedAt: null,
    };
  }
  const executeStatus: string = Object.prototype.hasOwnProperty.call(
    EXECUTE_STATUS_BY_TASK_STATUS,
    latestTask.status,
  )
    ? EXECUTE_STATUS_BY_TASK_STATUS[latestTask.status as ExecutionTaskStatus]
    : latestTask.status;
  return {
    executionTaskId: latestTask.id,
    executeStatus,
    beforeJson: latestTask.beforeJson,
    afterJson: latestTask.afterJson,
    errorMessage: executeStatus === 'failed' ? latestTask.errorMessage : null,
    executedAt: executeStatus === 'done' ? latestTask.finishedAt : null,
  };
}

/**
 * `LEFT JOIN LATERAL` of the latest task of each `ad_actions action` row. Its
 * columns are NULL when the action has no task. Queries that read execution
 * state alias the action table `action` and join this.
 */
export const LATEST_EXECUTION_TASK_JOIN = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT task.id, task.status, task.before_json, task.after_json,
      task.error_message, task.started_at, task.finished_at
    FROM execution_tasks task
    WHERE task.action_id = action.id
    ORDER BY task.created_at DESC, task.id DESC
    LIMIT 1
  ) latest_execution_task ON true`;

/** The joined latest task's columns; read them back with `latestExecutionTaskOf`. */
export const LATEST_EXECUTION_TASK_COLUMNS = Prisma.sql`
  latest_execution_task.id AS "latestTaskId",
  latest_execution_task.status AS "latestTaskStatus",
  latest_execution_task.before_json AS "latestTaskBeforeJson",
  latest_execution_task.after_json AS "latestTaskAfterJson",
  latest_execution_task.error_message AS "latestTaskErrorMessage",
  latest_execution_task.started_at AS "latestTaskStartedAt",
  latest_execution_task.finished_at AS "latestTaskFinishedAt"`;

export interface LatestExecutionTaskColumns {
  latestTaskId: string | null;
  latestTaskStatus: string | null;
  latestTaskBeforeJson: Prisma.JsonValue | null;
  latestTaskAfterJson: Prisma.JsonValue | null;
  latestTaskErrorMessage: string | null;
  latestTaskStartedAt: Date | null;
  latestTaskFinishedAt: Date | null;
}

export function latestExecutionTaskOf(
  row: LatestExecutionTaskColumns,
): LatestExecutionTask | null {
  if (row.latestTaskId === null || row.latestTaskStatus === null) return null;
  return {
    id: row.latestTaskId,
    status: row.latestTaskStatus,
    beforeJson: row.latestTaskBeforeJson,
    afterJson: row.latestTaskAfterJson,
    errorMessage: row.latestTaskErrorMessage,
    startedAt: row.latestTaskStartedAt,
    finishedAt: row.latestTaskFinishedAt,
  };
}

/**
 * SQL twin of `deriveAdActionExecution(..., now).executeStatus`, built from the
 * same status map and the same deadline cutoff.
 */
function derivedExecuteStatus(now: Date): Prisma.Sql {
  return Prisma.sql`COALESCE(
    CASE
      WHEN latest_execution_task.status = 'running'
        AND (
          latest_execution_task.started_at IS NULL
          OR latest_execution_task.started_at < ${executionDeadlineCutoff(now)}::timestamptz
        )
        THEN ${EXPIRED_RUNNING_EXECUTE_STATUS}::text
      ELSE CASE latest_execution_task.status
        ${Prisma.join(
          Object.entries(EXECUTE_STATUS_BY_TASK_STATUS).map(
            ([taskStatus, executeStatus]) =>
              Prisma.sql`WHEN ${taskStatus}::text THEN ${executeStatus}::text`,
          ),
          ' ',
        )}
        ELSE latest_execution_task.status
      END
    END,
    ${NO_TASK_EXECUTE_STATUS}::text
  )`;
}

/**
 * The action's derived execution word at `now` is one of `statuses`. Requires
 * `LATEST_EXECUTION_TASK_JOIN`.
 */
export function derivedExecuteStatusIn(
  statuses: readonly string[],
  now: Date,
): Prisma.Sql {
  if (statuses.length === 0) {
    throw new Error('derivedExecuteStatusIn requires at least one status.');
  }
  return Prisma.sql`${derivedExecuteStatus(now)} IN (${Prisma.join(
    statuses.map((status) => Prisma.sql`${status}::text`),
  )})`;
}

/** The latest task of each action in the organization; an action without one maps to null. */
export async function readLatestExecutionTasks(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; actionIds: readonly string[] },
): Promise<Map<string, LatestExecutionTask | null>> {
  if (input.actionIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<
    Array<{ actionId: string } & LatestExecutionTaskColumns>
  >(Prisma.sql`
    SELECT action.id AS "actionId", ${LATEST_EXECUTION_TASK_COLUMNS}
    FROM ad_actions action
    ${LATEST_EXECUTION_TASK_JOIN}
    WHERE action.organization_id = ${input.organizationId}::uuid
      AND action.id IN (${Prisma.join(
        input.actionIds.map((id) => Prisma.sql`${id}::uuid`),
      )})
  `);
  return new Map(rows.map((row) => [row.actionId, latestExecutionTaskOf(row)]));
}
