// Outgoing port for the `AdAction` aggregate. Combines query (review list,
// latest target rows) with writes (generate, approve, reject,
// reset). Transaction-spanning writes (approve / reject / reset) are
// adapter-internal so `application/service/**` never imports
// `Prisma.TransactionClient`.

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

export interface HydratedAdAction extends AdAction {
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

export interface AdActionUpdatePatch {
  executeStatus?: string;
  executedAt?: Date;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  errorMessage?: string | null;
}

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
  ): Promise<AdAction[]>;

  /** Approve + idempotent enqueue inside a single $transaction (adapter-owned). */
  approveAdActions(ids: string[], organizationId: string): Promise<void>;

  /** Reject + cancel open execution tasks inside a single $transaction. */
  rejectAdActions(ids: string[], organizationId: string): Promise<void>;

  /** Re-queue every approved+failed action inside a single $transaction. */
  resetFailedAdActions(organizationId: string): Promise<void>;

  /** Single-row tenant-scoped state transition; throws when no match. */
  updateActionOrThrow(
    id: string,
    organizationId: string,
    data: AdActionUpdatePatch,
  ): Promise<void>;

  /**
   * Look up an open `actionType='create_campaign'` AdAction by campaign label.
   * Returns the row when one is queued/running/done so the caller can throw
   * a deterministic 409 Conflict.
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
