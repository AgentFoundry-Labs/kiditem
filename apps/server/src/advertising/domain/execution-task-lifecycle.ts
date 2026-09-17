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

/**
 * The 409 code of a running or done report refused as `manual_action`. The
 * extension counts a claim refused with it apart and tells the operator to
 * apply the action in the ad center (`MANUAL_ACTION_REFUSAL_CODE` in
 * `extensions/kiditem-os/content/coupang/ads-report.js`, held equal by an
 * extension test).
 */
export const EXECUTION_REPORT_MANUAL_ACTION = 'EXECUTION_REPORT_MANUAL_ACTION';

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

/** A browser execution report names the attempt it reports for. */
export interface ExecutionReportTarget {
  executionTaskId: string;
  status: ExecutionReportStatus;
}

/**
 * Decided in this order:
 *
 * - `not_latest_attempt`: the report names an attempt that is not the action's
 *   latest. A newer attempt replaced it (or the action never had one), and a
 *   report for the old attempt must not move the new one.
 * - `expired`: the report names the latest attempt, but it is running past its
 *   deadline. The report is refused and the attempt is closed as failed, so
 *   approving the action again adds a new one.
 * - `replay`: the latest task already has that outcome; a repeated done or
 *   failed report changes nothing, whatever the action type.
 * - `manual_action`: a running or done report for an action of a
 *   `MANUAL_AD_ACTION_TYPES` type. No executor may apply it, so the report is
 *   refused, and a queued attempt (one left from an approval before KID-138
 *   decision A) is closed as failed with `MANUAL_AD_ACTION_MESSAGE`. A failure
 *   report for such an action changes nothing in the ad center and follows the
 *   rules below.
 * - `apply`: move the latest task to the reported status.
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
  | 'manual_action'
  | 'invalid_transition';

export function resolveExecutionReport(
  actionType: string,
  latestTask: ({ id: string } & ExecutionTaskTiming) | null,
  report: ExecutionReportTarget,
  now: Date,
): ExecutionReportDecision {
  if (!latestTask || latestTask.id !== report.executionTaskId) {
    return 'not_latest_attempt';
  }
  if (isExpiredRunningExecutionTask(latestTask, now)) return 'expired';
  // A running report is never a replay: the extension does not repeat one the
  // server applied.
  if (report.status !== 'running' && latestTask.status === report.status) return 'replay';
  if (isManualAdActionType(actionType) && report.status !== 'failed') {
    return 'manual_action';
  }
  if (latestTask.status === 'queued') return 'apply';
  if (latestTask.status === 'running') {
    return report.status === 'running' ? 'invalid_transition' : 'apply';
  }
  return 'invalid_transition';
}
