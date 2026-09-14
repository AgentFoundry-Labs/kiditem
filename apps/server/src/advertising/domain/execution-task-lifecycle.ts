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

/**
 * - `apply`: move the latest task to the reported status.
 * - `replay`: the latest task already has that outcome; a repeated done or
 *   failed report changes nothing.
 * - `conflict`: the report is not the executor's to make — the action has no
 *   attempt, its attempt was cancelled, a different outcome is already
 *   recorded, or the attempt is already running. The extension never repeats a
 *   running report the server applied (it retries only a request refused with
 *   401), so a second running report comes from another executor and must not
 *   reach Coupang.
 */
export type ExecutionReportDecision = 'apply' | 'replay' | 'conflict';

/** An attempt waiting for or undergoing execution. Approval adds no attempt while one is open. */
export function isOpenExecutionTaskStatus(
  status: string | null | undefined,
): boolean {
  return status === 'queued' || status === 'running';
}

export function resolveExecutionReport(
  latestTaskStatus: string | null,
  reported: ExecutionReportStatus,
): ExecutionReportDecision {
  if (latestTaskStatus === 'queued') return 'apply';
  if (latestTaskStatus === 'running') {
    return reported === 'running' ? 'conflict' : 'apply';
  }
  if (latestTaskStatus === reported) return 'replay';
  return 'conflict';
}
