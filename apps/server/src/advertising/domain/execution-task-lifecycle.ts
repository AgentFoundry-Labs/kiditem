/**
 * ExecutionTask lifecycle of an approved ad action. The action's execution
 * state is its latest task (`read/ad-action-execution.ts`); this policy decides
 * which browser execution reports may move that task, and which action types
 * the operator applies by hand (`MANUAL_AD_ACTION_TYPES`).
 *
 * - `queued`: approved and waiting for the browser extension.
 * - `running`: the extension reported that it started. It stays open only
 *   until its execution deadline.
 * - `done` / `failed`: the extension reported the outcome, or the attempt was
 *   closed after its deadline passed. An approved manual action's attempt is
 *   recorded `failed` with `MANUAL_AD_ACTION_MESSAGE` and never queued.
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

/**
 * Ad actions the operator applies by hand in the Coupang ad center (KID-138
 * decision A, 2026-09-17). Approving one records the operator's confirmation
 * that the proposal is right. Approval therefore queues no attempt for these
 * types, and the server refuses every executor claim (running report) and done
 * report for one; extension builds since #515 (KID-90) write to Coupang only
 * after an accepted claim.
 *
 * Why: the executor could not locate these targets in the ad center. The
 * campaign list it opened is a div grid with campaign-level switches only, and
 * it matched table rows by text containment, so every such action ended "대상
 * 행을 찾지 못했습니다" and a match could have hit the wrong row.
 *
 * A new executor for one of these types is added by removing its type here.
 * Then revisit what assumes an approved keyword pause is applied by hand: the
 * keyword tab's proposal states and its approve and close messages
 * (`apps/web/src/app/(advertising)/ad-ops/lib/keyword-pause-proposal.ts`).
 */
export const MANUAL_AD_ACTION_TYPES = [
  'pause_keyword',
  'change_bid',
  'change_daily_budget',
] as const;

/** The failure message a manual action's attempt carries. */
export const MANUAL_AD_ACTION_MESSAGE =
  '자동 실행하지 않는 액션입니다. 광고센터에서 직접 처리해 주세요.';

export function isManualAdActionType(actionType: string): boolean {
  return (MANUAL_AD_ACTION_TYPES as readonly string[]).includes(actionType);
}

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
