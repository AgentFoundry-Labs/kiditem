// Outgoing port for the `AdAction` aggregate. Combines query (review list,
// latest target rows) with writes (generate, approve, reject, execution
// reports). Transaction-spanning writes are adapter-internal so
// `application/service/**` never imports `Prisma.TransactionClient`.

import type { AdAction } from '@prisma/client';
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

/** Open keyword-relevance proposal, used to badge the keyword view. */
export interface OpenKeywordRelevanceActionRow {
  targetLabel: string;
  externalId: string | null;
  reason: string;
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

  findExistingInflightActions(
    organizationId: string,
    sinceCreatedAt: Date,
  ): Promise<ExistingAdActionDedupRow[]>;

  /**
   * Open (`pending_review` or approved-but-unexecuted) `pause_keyword`
   * proposals. A keyword with one of these is what the keyword view shows as
   * "연관 없음"; the verdict itself is not a daily fact and is not stored on the
   * fact row.
   */
  findOpenKeywordRelevanceActions(
    organizationId: string,
  ): Promise<OpenKeywordRelevanceActionRow[]>;

  // Writes
  createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdActionRecord[]>;

  /**
   * Approve and, in the same $transaction, queue a new ExecutionTask for each
   * action whose latest task is not open (queued or running).
   */
  approveAdActions(ids: string[], organizationId: string): Promise<void>;

  /** Reject + cancel not-yet-started execution tasks inside a single $transaction. */
  rejectAdActions(ids: string[], organizationId: string): Promise<void>;

  /**
   * Move the attempt a browser execution report names. Throws
   * NotFoundException for an action outside the organization and
   * ConflictException, with a `code` saying why, when the named attempt is not
   * the action's latest or cannot take the report; repeating the recorded
   * status changes nothing.
   */
  reportActionExecution(
    id: string,
    organizationId: string,
    report: AdActionExecutionReport,
  ): Promise<void>;

  /**
   * Look up an open `actionType='create_campaign'` AdAction by campaign label.
   * Returns the row when its latest task reads queued/running/done so the
   * caller can throw a deterministic 409 Conflict.
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
