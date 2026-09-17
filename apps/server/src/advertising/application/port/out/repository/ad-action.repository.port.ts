// Outgoing port for the `AdAction` aggregate. Combines query (review list,
// latest target rows) with writes (generate, approve, reject, execution
// reports). Transaction-spanning writes are adapter-internal so
// `application/service/**` never imports `Prisma.TransactionClient`.

import type { AdAction } from '@prisma/client';
import type {
  AdActionExpectedApprovalStatus,
  AdKeywordPauseProposal,
} from '@kiditem/shared/advertising';
import type { ActionCandidate } from '../../../../domain/ad-action-rules';

export const AD_ACTION_REPOSITORY_PORT = Symbol('AdActionRepositoryPort');

export interface AdActionQuery {
  approvalStatus?: string;
  executeStatus?: string;
  listingId?: string;
  optionId?: string;
  targetType?: string;
  priority?: string;
  limit?: number;
}

export interface LatestTargetRow {
  id: string;
  targetType: string;
  targetKey: string;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
  /** Advertised option (Coupang vendorItemId) when the row names exactly one. */
  externalOptionId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  keyword: string | null;
  status: string | null;
  currentBid: number | null;
  dailyBudget: number | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  /**
   * `null` when the provider table behind the row did not carry the conversion
   * column; a stored 0 there is not zero conversions, so no rule reads it.
   */
  conversions: number | null;
  abcGrade: string | null;
  /**
   * The listing's channel account channel, which decides whether a sales
   * commission and other per-sale cost apply (`channelAccountSalesCosts`).
   * `null` when the target is not attributable to an active listing.
   */
  listingChannel: string | null;
  productName: string | null;
}

export interface AdActionReviewSummary {
  pendingReview: number;
  approvedQueued: number;
  running: number;
  done: number;
  failed: number;
  latestSnapshotAt: Date | null;
  latestSnapshotPageType: string | null;
}

/**
 * The execution words an action reads from its latest ExecutionTask
 * (`read/ad-action-execution.ts`). AdAction stores no copy; the wire keeps
 * these field names.
 */
export interface AdActionExecution {
  /**
   * The latest ExecutionTask: the attempt an executor names in every report
   * (KID-160). `null` while the action has no attempt.
   */
  executionTaskId: string | null;
  executeStatus: string;
  beforeJson: unknown;
  afterJson: unknown;
  errorMessage: string | null;
  executedAt: Date | null;
}

/** An AdAction row with the execution words of its latest ExecutionTask. */
export type AdActionRecord = Omit<AdAction, keyof AdActionExecution> &
  AdActionExecution;

export interface HydratedAdAction extends AdActionRecord {
  listing: {
    id: string;
    externalId: string;
    channelName: string | null;
    master: {
      id: string;
      code: string;
      name: string;
      abcGrade: string | null;
    };
  } | null;
  adTargetDaily: {
    id: string;
    targetType: string;
    campaignName: string | null;
    keyword: string | null;
    businessDate: Date;
    lastObservedAt: Date | null;
  } | null;
}

export interface AdActionReviewResult {
  items: HydratedAdAction[];
  summary: AdActionReviewSummary;
}

/**
 * Existing in-flight action dedup row. Service composes the dedup key
 * inside the application layer; the port surfaces only the columns needed.
 */
export interface ExistingAdActionDedupRow {
  actionType: string;
  externalId: string | null;
  targetLabel: string;
  currentValue: number | null;
  proposedValue: number | null;
}

/**
 * A keyword's latest `pause_keyword` proposal, unless that proposal was
 * rejected, with the execution state its latest attempt reads. The keyword view
 * shows it as "연관 없음" and offers its review actions.
 */
export interface KeywordPauseProposalRow extends AdKeywordPauseProposal {
  /** The advertised option the proposal pauses the keyword on. */
  externalId: string | null;
  /** The keyword text. */
  targetLabel: string;
  reason: string;
}

/**
 * How an approve or reject treats the actions it names. With
 * `expectedApprovalStatus`, only the actions still in that review change, checked
 * under their row locks; the others are skipped and not counted.
 */
export interface AdActionReviewOptions {
  expectedApprovalStatus?: AdActionExpectedApprovalStatus;
}

/**
 * A browser execution report for one attempt of an approved action. It names
 * the attempt (`executionTaskId`, from the action listing) so it can move only
 * that attempt, and only while it is the action's latest.
 */
export type AdActionExecutionReport = { executionTaskId: string } & (
  | { status: 'running'; beforeJson?: Record<string, unknown> }
  | { status: 'done'; afterJson?: Record<string, unknown> }
  | {
      status: 'failed';
      errorMessage: string;
      afterJson?: Record<string, unknown>;
    }
);

export interface AdActionRepositoryPort {
  // Reads
  findAdActionsForReview(
    query: AdActionQuery,
    organizationId: string,
  ): Promise<AdActionReviewResult>;

  findLatestTargetRows(organizationId: string): Promise<LatestTargetRow[]>;

  /**
   * Actions created since `sinceCreatedAt` that are still open work: awaiting
   * review, or approved with the latest attempt queued or running within its
   * execution deadline. An approved action of a type the operator applies by
   * hand (`MANUAL_AD_ACTION_TYPES`) stays open until it is rejected or its
   * latest attempt is done.
   */
  findExistingInflightActions(
    organizationId: string,
    sinceCreatedAt: Date,
  ): Promise<ExistingAdActionDedupRow[]>;

  /**
   * At most one row per keyword (advertised option and keyword text): its
   * latest `pause_keyword` proposal whatever its execution state, and none when
   * that latest proposal was rejected, so an older one does not come back. A
   * keyword with one is what the keyword view shows as "연관 없음"; the verdict
   * itself is not a daily fact and is not stored on the fact row.
   */
  findKeywordPauseProposals(
    organizationId: string,
  ): Promise<KeywordPauseProposalRow[]>;

  // Writes
  /**
   * Insert the candidates as proposals awaiting review. A `pause_keyword`
   * candidate is skipped when its keyword already has an open proposal, under
   * the same open-work rule as `findExistingInflightActions`, so a pause the
   * operator approved is not proposed again until it is rejected.
   */
  createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdActionRecord[]>;

  /**
   * Approve and, in the same $transaction, add a new ExecutionTask for each
   * action whose latest task is not open (queued, or running within its
   * execution deadline). A running task past its deadline is closed as failed
   * first. The new task is queued for the browser extension, except for an
   * action of a `MANUAL_AD_ACTION_TYPES` type (KID-138 decision A): approval
   * records the operator's confirmation, and the task is recorded failed with
   * `MANUAL_AD_ACTION_MESSAGE` so it never reaches the executor queue. Returns
   * how many distinct actions of the organization it approved: every one the
   * ids name, or with `expectedApprovalStatus` only those still in that review.
   */
  approveAdActions(
    ids: string[],
    organizationId: string,
    options?: AdActionReviewOptions,
  ): Promise<number>;

  /**
   * Reject + cancel not-yet-started execution tasks inside a single
   * $transaction. Returns how many distinct actions of the organization it
   * rejected: every one the ids name, or with `expectedApprovalStatus` only
   * those still in that review. Throws ConflictException and rejects none when
   * one of them has an attempt running within its execution deadline
   * (`EXECUTION_TASK_RUNNING`) or a latest attempt that is done
   * (`EXECUTION_TASK_DONE`).
   */
  rejectAdActions(
    ids: string[],
    organizationId: string,
    options?: AdActionReviewOptions,
  ): Promise<number>;

  /**
   * Move the attempt a browser execution report names. Throws
   * NotFoundException for an action outside the organization and
   * ConflictException, with a `code` saying why, when the named attempt is not
   * the action's latest, is running past its execution deadline (it is then
   * closed as failed), belongs to an action the operator applies by hand and
   * the report is running or done (`EXECUTION_REPORT_MANUAL_ACTION`; a queued
   * attempt is then closed as failed with `MANUAL_AD_ACTION_MESSAGE`), or
   * cannot take the report; repeating the recorded status changes nothing.
   */
  reportActionExecution(
    id: string,
    organizationId: string,
    report: AdActionExecutionReport,
  ): Promise<void>;

  /**
   * Look up an open `actionType='create_campaign'` AdAction by campaign label.
   * Returns the row when it is not rejected and its latest task reads
   * queued/running/done so the caller can throw a deterministic 409 Conflict.
   */
  findOpenCreateCampaignAction(
    organizationId: string,
    campaignName: string,
  ): Promise<{ id: string; executeStatus: string } | null>;

  /**
   * Create an approved `create_campaign` AdAction with a single queued
   * `ExecutionTask` in one shot. Returns the new ids so the caller can
   * surface the audit link.
   */
  createCampaignActionWithTask(input: {
    organizationId: string;
    campaignName: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    reason: string;
    payload: Record<string, unknown>;
  }): Promise<{ actionId: string; taskId: string | null }>;
}
