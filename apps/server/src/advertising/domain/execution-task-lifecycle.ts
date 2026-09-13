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
 * - `replay`: the latest task already has it; a repeated report changes nothing.
 * - `conflict`: the report is stale — the action has no attempt, its attempt
 *   was cancelled, or a different outcome is already recorded.
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
  if (latestTaskStatus === reported) return 'replay';
  if (latestTaskStatus === 'queued') return 'apply';
  if (latestTaskStatus === 'running' && reported !== 'running') return 'apply';
  return 'conflict';
}
