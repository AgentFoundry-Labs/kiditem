/**
 * ExecutionTask lifecycle of an approved ad action. The action's execution
 * state is its latest task (`read/ad-action-execution.ts`); this policy decides
 * which browser execution reports may move that task.
 *
 * - `queued`: approved and waiting for the browser extension.
 * - `running`: the extension reported that it started.
 * - `done` / `failed`: the extension reported the outcome.
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
  | 'invalid_transition';

/** An attempt waiting for or undergoing execution. Approval adds no attempt while one is open. */
export function isOpenExecutionTaskStatus(
  status: string | null | undefined,
): boolean {
  return status === 'queued' || status === 'running';
}

export function resolveExecutionReport(
  latestTask: { id: string; status: string } | null,
  report: ExecutionReportTarget,
): ExecutionReportDecision {
  if (!latestTask || latestTask.id !== report.executionTaskId) {
    return 'not_latest_attempt';
  }
  if (latestTask.status === 'queued') return 'apply';
  if (latestTask.status === 'running') {
    return report.status === 'running' ? 'invalid_transition' : 'apply';
  }
  if (latestTask.status === report.status) return 'replay';
  return 'invalid_transition';
}
