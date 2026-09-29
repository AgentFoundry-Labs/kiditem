// Outgoing port for the `AdAction` aggregate. Combines query (review list,
// latest target rows) with writes (generate, approve, reject). Transaction-spanning writes are adapter-internal so
// `application/service/**` never imports `Prisma.TransactionClient`.

import type {
  AdActionExecuteStatus,
  AdActionExecution,
  AdActionExpectedApprovalStatus,
  AdKeywordPauseProposal,
} from '@kiditem/shared/advertising';
import type { ActionCandidate } from '../../../../domain/ad-action-rules';
import type { AdActionRow } from '../../../../domain/ad-action-row';

/** The execution words `read/ad-action-execution.ts` reads from the action's operation (KID-386). */
export type { AdActionExecution };

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

/**
 * One rule target over the ad report ledger (KID-372): a campaign (current
 * `ChannelAdCampaign` state plus the recent measured window's product sums) or
 * a search keyword (its window sums). There is no bid.
 */
export interface AdRuleTarget {
  targetType: 'campaign' | 'keyword';
  channelAccountId: string;
  campaignId: string;
  campaignName: string | null;
  /** Keyword targets only. */
  adGroupId: string | null;
  /** Keyword text; `''` is the non-search row. Null for a campaign. */
  keyword: string | null;
  /** Keyword targets: the advertised option. Null for a campaign. */
  vendorItemId: string | null;
  /** Options the target advertised in the window. */
  vendorItemIds: string[];
  /** Catalog listings the target advertised in the window (matched rows only). */
  listingIds: string[];
  /** Set when the target advertised exactly one catalog listing. */
  listingId: string | null;
  /**
   * The listing's channel account channel. `null` when the target is not
   * attributable to one active listing.
   */
  listingChannel: string | null;
  productName: string | null;
  /** Campaign ON/OFF (`ChannelAdCampaign.isActive`); null when unknown. */
  isActive: boolean | null;
  /** Campaign budget as reported (assumed KRW/day); null for keywords. */
  budget: number | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  /** The report's orders (conversions). */
  orders: number;
  abcGrade: string | null;
  /** Last measured day of the window the sums cover. */
  businessDate: string;
  /** Measured days of the window the sums cover. */
  measuredDays: number;
  /** First measured day of the window the sums cover. */
  windowStartDate: string;
}

/** A keyword (advertised option + keyword text) a pause proposal names. */
export interface KeywordPauseKey {
  externalId: string | null;
  targetLabel: string;
}

export interface AdActionReviewSummary {
  pendingReview: number;
  approvedQueued: number;
  running: number;
  done: number;
  uncertain: number;
  failed: number;
}

/** An AdAction row with the execution words of its `advertising.ad_action` operation. */
export type AdActionRecord = Omit<AdActionRow, keyof AdActionExecution> &
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
 * rejected, with its execution word. The keyword view
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

export interface AdActionRepositoryPort {
  // Reads
  findAdActionsForReview(
    query: AdActionQuery,
    organizationId: string,
  ): Promise<AdActionReviewResult>;

  /** Campaign and keyword targets of the recent measured window (KID-372). */
  findRuleTargets(organizationId: string): Promise<AdRuleTarget[]>;

  /**
   * Keywords whose `pause_keyword` proposal created on or after the KST
   * calendar day `sinceDate` stands approved or reads done. The window's
   * keyword rows still carry the clicks from before the pause, so such a
   * keyword is not proposed again from that window.
   */
  findAppliedKeywordPauses(organizationId: string, sinceDate: string): Promise<KeywordPauseKey[]>;

  /**
   * Actions created since `sinceCreatedAt` that are still open work
   * (`isOpenAdAction`): awaiting review, an approved action the operator
   * applies by hand (`MANUAL_AD_ACTION_TYPES`) until it is rejected, or an
   * approved action whose run is queued or running.
   */
  findExistingInflightActions(
    organizationId: string,
    sinceCreatedAt: Date,
  ): Promise<ExistingAdActionDedupRow[]>;

  /**
   * At most one row per keyword (advertised option and keyword text): its
   * latest `pause_keyword` proposal while it awaits review or stands approved,
   * and none when that latest proposal was rejected, so an older one does not
   * come back. A
   * keyword with one is what the keyword view shows as "연관 없음"; the verdict
   * itself is not a daily fact and is not stored on the fact row.
   */
  findKeywordPauseProposals(
    organizationId: string,
  ): Promise<KeywordPauseProposalRow[]>;

  // Writes
  /**
   * Insert the candidates as proposals awaiting review. A `pause_keyword`
   * candidate is skipped when its keyword's latest proposal (the one
   * `findKeywordPauseProposals` returns) is open under the same open-work rule
   * as `findExistingInflightActions`, so a pause the operator approved is not
   * proposed again until it is closed. An older proposal behind a rejected one
   * never blocks.
   */
  createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdActionRecord[]>;

  /**
   * Approve, commit, then prepare the `advertising.ad_action` run of each
   * approved action of an executable type (`create_campaign`) that has no live
   * run and was not applied (KID-386); the owner's `plan` reads the committed
   * approval. A manual action (`MANUAL_AD_ACTION_TYPES`, KID-138 decision A)
   * is only confirmed. A failed preparation leaves the action approved and
   * `not_prepared` and is thrown after the others were tried. Returns how many
   * distinct actions of the organization it approved: every one the ids name,
   * or with `expectedApprovalStatus` only those still in that review.
   */
  approveAdActions(
    ids: string[],
    organizationId: string,
    options?: AdActionReviewOptions,
  ): Promise<number>;

  /**
   * Reject and cancel a prepared run inside a single $transaction. Returns
   * how many distinct actions of the organization it rejected: every one the
   * ids name, or with `expectedApprovalStatus` only those still in that
   * review. Rejects none and throws `ADVERTISING_AD_ACTION_EXECUTING` when the
   * extension holds one of their runs, or `ADVERTISING_AD_ACTION_ALREADY_APPLIED`
   * when one already changed the ad center.
   */
  rejectAdActions(
    ids: string[],
    organizationId: string,
    options?: AdActionReviewOptions,
  ): Promise<number>;

  /**
   * Look up an open `actionType='create_campaign'` AdAction by campaign label.
   * Returns the newest one that is not rejected and whose run is queued,
   * running, done or uncertain, so the caller can refuse a second registration.
   */
  findOpenCreateCampaignAction(
    organizationId: string,
    campaignName: string,
  ): Promise<{ id: string; executeStatus: AdActionExecuteStatus } | null>;

  /**
   * Create an approved `create_campaign` AdAction for the account, commit it,
   * then prepare its run (KID-386). A failed preparation is thrown and leaves
   * the action approved and `not_prepared`.
   */
  createCampaignAction(input: {
    organizationId: string;
    channelAccountId: string;
    campaignName: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    reason: string;
    payload: Record<string, unknown>;
  }): Promise<{ actionId: string; operationId: string | null }>;
}
