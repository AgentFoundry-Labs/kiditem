/**
 * ExecutionTask lifecycle of an approved ad action. The action's execution
 * state is its latest task (`read/ad-action-execution.ts`); this policy decides
 * which browser execution reports may move that task.
 *
 * - `queued`: approved and waiting for the browser extension.
 * - `running`: the extension reported that it started. It stays open only
 *   until its execution deadline.
 * - `done` / `failed`: the extension reported the outcome, or the attempt was
 *   closed after its deadline passed.
 * - `cancelled`: the action was rejected before its attempt started.
 */
export const EXECUTION_TASK_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
] as const;
export type ExecutionTaskStatus = (typeof EXECUTION_TASK_STATUSES)[number];

export type ExecutionReportStatus = Extract<
  ExecutionTaskStatus,
  'running' | 'done' | 'failed'
>;

/**
 * How long a running attempt may go without an outcome report (KID-160). An
 * executor that stopped (a sleeping PC, a closed tab) leaves its attempt
 * running. Past this deadline the attempt reads failed, approving the action
 * again closes it and queues a new one, and a late report for it is refused.
 * The extension gives up before writing to Coupang well inside this deadline
 * (`ACTION_WRITE_DEADLINE_MS` in `extensions/kiditem-os/content/coupang/ads-report.js`).
 */
export const EXECUTION_TASK_RUNNING_DEADLINE_MS = 30 * 60 * 1000;

/** The failure message of a running attempt closed after its deadline. */
export const EXECUTION_DEADLINE_EXCEEDED_MESSAGE = '실행 기한 초과';

export interface ExecutionTaskTiming {
  status: string;
  startedAt: Date | null;
}

/** A running attempt that started before this instant is past its deadline at `now`. */
export function executionDeadlineCutoff(now: Date): Date {
  return new Date(now.getTime() - EXECUTION_TASK_RUNNING_DEADLINE_MS);
}

/**
 * A running attempt that started more than the deadline ago. A running attempt
 * without a start time predates recorded start times, so no executor can still
 * be reporting for it either.
 */
export function isExpiredRunningExecutionTask(
  task: ExecutionTaskTiming,
  now: Date,
): boolean {
  if (task.status !== 'running') return false;
  return (
    task.startedAt === null ||
    task.startedAt.getTime() < executionDeadlineCutoff(now).getTime()
  );
}

/**
 * An attempt waiting for or undergoing execution: queued, or running within its
 * deadline. Approval adds no attempt while one is open.
 */
export function isOpenExecutionTask(
  task: ExecutionTaskTiming | null,
  now: Date,
): boolean {
  if (!task) return false;
  if (task.status === 'queued') return true;
  return task.status === 'running' && !isExpiredRunningExecutionTask(task, now);
}

/** A browser execution report names the attempt it reports for. */
export interface ExecutionReportTarget {
  executionTaskId: string;
  status: ExecutionReportStatus;
}

/**
 * - `apply`: move the latest task to the reported status.
 * - `replay`: the latest task already has that outcome; a repeated done or
 *   failed report changes nothing.
 * - `not_latest_attempt`: the report names an attempt that is not the action's
 *   latest. A newer attempt replaced it (or the action never had one), and a
 *   report for the old attempt must not move the new one.
 * - `expired`: the report names the latest attempt, but it is running past its
 *   deadline. The report is refused and the attempt is closed as failed, so
 *   approving the action again queues a new one.
 * - `invalid_transition`: the report names the latest attempt but is not the
 *   executor's to make — the attempt was cancelled, a different outcome is
 *   already recorded, or it is already running. The extension never repeats a
 *   running report the server applied (it retries only a request refused with
 *   401), so a second running report comes from another executor and must not
 *   reach Coupang.
 */
export type ExecutionReportDecision =
  | 'apply'
  | 'replay'
  | 'not_latest_attempt'
  | 'expired'
  | 'invalid_transition';

export function resolveExecutionReport(
  latestTask: ({ id: string } & ExecutionTaskTiming) | null,
  report: ExecutionReportTarget,
  now: Date,
): ExecutionReportDecision {
  if (!latestTask || latestTask.id !== report.executionTaskId) {
    return 'not_latest_attempt';
  }
  if (isExpiredRunningExecutionTask(latestTask, now)) return 'expired';
  if (latestTask.status === 'queued') return 'apply';
  if (latestTask.status === 'running') {
    return report.status === 'running' ? 'invalid_transition' : 'apply';
  }
  if (latestTask.status === report.status) return 'replay';
  return 'invalid_transition';
}
