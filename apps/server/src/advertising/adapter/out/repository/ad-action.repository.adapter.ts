import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
// `AdAction` aggregate adapter: query + persistence + dedup + transaction-
// wrapped lifecycle writes. The adapter owns `$transaction` for approve /
// reject / execution reports so the application service stays Prisma-free.
// Execution words are read from each action's latest ExecutionTask through
// `read/ad-action-execution.ts`; this adapter writes them only to that task.

import { ConflictException, Injectable, NotFoundException, Optional, Inject } from '@nestjs/common';
import { Prisma, type AdAction } from '@prisma/client';
import {
  AD_ACTION_COMMAND_MAX_IDS,
  AdKeywordPauseProposalSchema,
} from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readAdTargetRowEvidence,
  readCompleteAdKeywordFacts,
  readCurrentAdTargetRows,
} from '../persistence/read/ad-target-facts';
import {
  deriveAdActionExecution,
  derivedExecuteStatusIn,
  LATEST_EXECUTION_TASK_COLUMNS,
  LATEST_EXECUTION_TASK_JOIN,
  latestExecutionTaskOf,
  readLatestExecutionTasks,
  type LatestExecutionTaskColumns,
} from '../persistence/read/ad-action-execution';
import { AdListingRepositoryAdapter } from './ad-listing.repository.adapter';
import { readPublishedProductAbcGrades } from '../../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import type { ActionCandidate } from '../../../domain/ad-action-rules';
import { scrubExecutionError } from '../../../domain/ad-execution-error-scrubber';
import {
  EXECUTION_DEADLINE_EXCEEDED_MESSAGE,
  EXECUTION_REPORT_MANUAL_ACTION,
  isExpiredRunningExecutionTask,
  isManualAdActionType,
  isOpenExecutionTask,
  MANUAL_AD_ACTION_MESSAGE,
  MANUAL_AD_ACTION_TYPES,
  resolveExecutionReport,
  type ExecutionReportDecision,
} from '../../../domain/execution-task-lifecycle';
import type {
  AdActionExecution,
  AdActionExecutionReport,
  AdActionQuery,
  AdActionRecord,
  AdActionRepositoryPort,
  AdActionReviewOptions,
  AdActionReviewResult,
  ExistingAdActionDedupRow,
  KeywordPauseProposalRow,
  HydratedAdAction,
  LatestTargetRow,
} from '../../../application/port/out/repository/ad-action.repository.port';

const OPEN_ACTION_APPROVAL_STATUSES = ['pending_review', 'approved'] as const;
/** Execution words under which a proposal is still open work. */
const OPEN_ACTION_EXECUTE_STATUSES = ['queued', 'running'] as const;

const OPEN_ACTION_APPROVAL_STATUS_VALUES = Prisma.join(
  OPEN_ACTION_APPROVAL_STATUSES.map((status) => Prisma.sql`${status}`),
);
const MANUAL_AD_ACTION_TYPE_VALUES = Prisma.join(
  MANUAL_AD_ACTION_TYPES.map((actionType) => Prisma.sql`${actionType}`),
);

/**
 * An `ad_actions action` row still open as work, which a new proposal for the
 * same target must not duplicate: awaiting review, or approved with its latest
 * attempt queued or running within its deadline. An approved manual action
 * (`MANUAL_AD_ACTION_TYPES`, KID-138 decision A) is applied by hand in the ad
 * center, so it also stays open while its attempt reads failed, until the
 * operator closes it by rejecting it; a done attempt from before decision A,
 * or a rejection, releases it. No failure message is compared, and a task
 * status outside the lifecycle, which no read offers for review, keeps nothing
 * open. Requires `LATEST_EXECUTION_TASK_JOIN`.
 */
function openActionCondition(now: Date): Prisma.Sql {
  return Prisma.sql`(
    action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
    AND (
      ${derivedExecuteStatusIn(OPEN_ACTION_EXECUTE_STATUSES, now)}
      OR (
        action.action_type IN (${MANUAL_AD_ACTION_TYPE_VALUES})
        AND ${derivedExecuteStatusIn(['failed'], now)}
      )
    )
  )`;
}

/**
 * Each keyword's newest `pause_keyword` proposal, whatever its review: one row
 * per advertised option (`external_id`) and keyword text (`target_label`).
 * The keyword read shows it and the pause dedupe tests it, so the proposal an
 * operator sees is the only one that can block a new proposal for the keyword.
 * Rejecting it is the last word on the keyword: an older proposal neither shows
 * nor blocks. Use it as a CTE aliased `action`, with its own organization
 * predicate at each use.
 */
function latestPauseKeywordProposals(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (proposal.external_id, proposal.target_label)
      proposal.id,
      proposal.organization_id,
      proposal.action_type,
      proposal.external_id,
      proposal.target_label,
      proposal.reason,
      proposal.approval_status
    FROM ad_actions proposal
    WHERE proposal.organization_id = ${organizationId}::uuid
      AND proposal.action_type = 'pause_keyword'
      AND proposal.target_type = 'keyword'
    ORDER BY proposal.external_id, proposal.target_label,
      proposal.created_at DESC, proposal.id DESC`;
}

/** Every AdAction column except the execution words its latest task supplies. */
const AD_ACTION_ROW_SELECT = {
  id: true,
  organizationId: true,
  listingId: true,
  listingOptionId: true,
  adTargetDailyId: true,
  actionType: true,
  targetType: true,
  externalId: true,
  targetLabel: true,
  reason: true,
  priority: true,
  currentValue: true,
  proposedValue: true,
  payload: true,
  approvalStatus: true,
  approvedAt: true,
  createdAt: true,
} as const;

type AdActionRow = Omit<AdAction, keyof AdActionExecution>;

interface AdActionReviewCounts {
  pendingReview: number;
  approvedQueued: number;
  running: number;
  done: number;
  failed: number;
}

@Injectable()
export class AdActionRepositoryAdapter implements AdActionRepositoryPort {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    private readonly prisma: PrismaService,
    // Reused for the listing hydration step in `findAdActionsForReview`.
    // The adapter depends on a sibling adapter here, which is allowed for
    // intra-domain composition; ports/services never see this.
    private readonly listingAdapter: AdListingRepositoryAdapter,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Optional()
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products?: ProductTransactionalReadPort,
  ) {}

  async findAdActionsForReview(
    query: AdActionQuery,
    organizationId: string,
  ): Promise<AdActionReviewResult> {
    // A page holds at most as many actions as one approve or reject command names.
    const limit = Math.min(query.limit || 50, AD_ACTION_COMMAND_MAX_IDS);
    // One instant for the execution deadline across the page, its filters and its counts.
    const now = new Date();

    const filters: Prisma.Sql[] = [];
    if (query.approvalStatus && query.approvalStatus !== 'all')
      filters.push(Prisma.sql`AND action.approval_status = ${query.approvalStatus}`);
    if (query.executeStatus && query.executeStatus !== 'all')
      filters.push(Prisma.sql`AND ${derivedExecuteStatusIn([query.executeStatus], now)}`);
    if (query.listingId)
      filters.push(Prisma.sql`AND action.listing_id = ${query.listingId}::uuid`);
    if (query.targetType && query.targetType !== 'all')
      filters.push(Prisma.sql`AND action.target_type = ${query.targetType}`);
    if (query.priority && query.priority !== 'all')
      filters.push(Prisma.sql`AND action.priority = ${query.priority}`);

    const [page, [counts], latestRun] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string } & LatestExecutionTaskColumns>>(Prisma.sql`
        SELECT action.id, ${LATEST_EXECUTION_TASK_COLUMNS}
        FROM ad_actions action
        ${LATEST_EXECUTION_TASK_JOIN}
        WHERE action.organization_id = ${organizationId}::uuid
          ${filters.length > 0 ? Prisma.join(filters, ' ') : Prisma.empty}
        ORDER BY action.created_at DESC, action.id DESC
        LIMIT ${limit}::int
      `),
      this.prisma.$queryRaw<AdActionReviewCounts[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE action.approval_status = 'pending_review')::int AS "pendingReview",
          COUNT(*) FILTER (
            WHERE action.approval_status = 'approved'
              AND ${derivedExecuteStatusIn(['queued'], now)}
          )::int AS "approvedQueued",
          COUNT(*) FILTER (WHERE ${derivedExecuteStatusIn(['running'], now)})::int AS "running",
          COUNT(*) FILTER (WHERE ${derivedExecuteStatusIn(['done'], now)})::int AS "done",
          COUNT(*) FILTER (WHERE ${derivedExecuteStatusIn(['failed'], now)})::int AS "failed"
        FROM ad_actions action
        ${LATEST_EXECUTION_TASK_JOIN}
        WHERE action.organization_id = ${organizationId}::uuid
      `),
      this.prisma.channelScrapeRun.findFirst({
        where: { organizationId },
        orderBy: [
          { finishedAt: 'desc' },
          { startedAt: 'desc' },
          { id: 'desc' },
        ],
        select: { finishedAt: true, startedAt: true, pageType: true },
      }),
    ]);

    const rows: AdActionRow[] =
      page.length === 0
        ? []
        : await this.prisma.adAction.findMany({
            where: { organizationId, id: { in: page.map((entry) => entry.id) } },
            select: AD_ACTION_ROW_SELECT,
          });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const actions: AdActionRecord[] = page.flatMap((entry) => {
      const row = rowById.get(entry.id);
      return row
        ? [{ ...row, ...deriveAdActionExecution(latestExecutionTaskOf(entry), now) }]
        : [];
    });

    const hydrated = await this.hydrateActionRelations(organizationId, actions);
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sortedItems = [...hydrated].sort((a, b) => {
      const priDiff =
        (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 9) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 9);
      if (priDiff !== 0) return priDiff;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });

    return {
      items: sortedItems,
      summary: {
        pendingReview: counts?.pendingReview ?? 0,
        approvedQueued: counts?.approvedQueued ?? 0,
        running: counts?.running ?? 0,
        done: counts?.done ?? 0,
        failed: counts?.failed ?? 0,
        latestSnapshotAt:
          latestRun?.finishedAt ?? latestRun?.startedAt ?? null,
        latestSnapshotPageType: latestRun?.pageType || null,
      },
    };
  }

  async findLatestTargetRows(organizationId: string): Promise<LatestTargetRow[]> {
    return this.prisma.$transaction(
      async (tx) => {
        // Both target sets come from the advertising ledger's reader: the
        // current campaign/product targets of each account's newest completed
        // sweep, and the current COMPLETE keyword observations.
        const currentRows = await readCurrentAdTargetRows(tx, organizationId, this.channelAccounts);
        const { rows: keywordRows } = await readCompleteAdKeywordFacts(tx, organizationId);
        const candidates = [
          ...currentRows.map((row) => ({
            id: row.id,
            target_type: row.targetType,
            target_key: row.targetKey,
            listing_id: row.listingId,
            listing_option_id: row.listingOptionId,
            external_id: row.externalId,
            external_option_id: row.externalOptionId,
            campaign_id: row.campaignId,
            campaign_name: row.campaignName,
            keyword: row.keyword,
            status: row.status,
            current_bid: row.currentBid,
            daily_budget: row.dailyBudget,
            spend: row.spend,
            revenue: row.revenue,
            impressions: row.impressions,
            clicks: row.clicks,
            conversions: row.conversionsObserved ? row.conversions : null,
            meta_json: row.metaJson,
          })),
          ...keywordRows.map((row) => ({
            id: row.id,
            target_type: row.targetType,
            target_key: row.targetKey,
            listing_id: row.listingId,
            listing_option_id: row.listingOptionId,
            external_id: row.externalId,
            external_option_id: row.externalOptionId,
            campaign_id: row.campaignId,
            campaign_name: row.campaignName,
            keyword: row.keyword,
            status: row.status,
            current_bid: row.currentBid,
            daily_budget: row.dailyBudget,
            spend: row.spend,
            revenue: row.revenue,
            impressions: row.impressions,
            clicks: row.clicks,
            conversions: row.conversionsObserved ? row.conversions : null,
            meta_json: row.metaJson,
          })),
        ];
        if (candidates.length === 0) return [];
        const catalog = await this.channelListings.readCatalogFacts(ownerTransaction(tx), {
          organizationId, channels: ['coupang'], activeAccountsOnly: true, activeOnly: true,
        });
        const scopedListings = catalog.map(row => ({ id: row.id, organization_id: organizationId, channel_account_id: row.accountId,
          display_name: row.displayName, channel_name: row.channelName, external_id: row.externalId, account_channel: row.channel }));
        const scopedOptions = catalog.flatMap(row => row.options.map(option => ({ id: option.id, listing_id: row.id })));
        const targets = await tx.$queryRaw<Array<Omit<LatestTargetRow, 'abcGrade'> & {
          masterProductId: string | null;
        }>>(
          Prisma.sql`
        WITH scoped_listings AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(scopedListings)}::jsonb)
            AS listing(id uuid, organization_id uuid, channel_account_id uuid, display_name text, channel_name text, external_id text, account_channel text)
          WHERE listing.organization_id = ${organizationId}::uuid
        ), scoped_options AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(scopedOptions)}::jsonb)
            AS option(id uuid, listing_id uuid)
        ),
        latest AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb) AS candidate (
            id uuid, target_type text, target_key text, listing_id uuid, listing_option_id uuid,
            external_id text, external_option_id text, campaign_id text, campaign_name text,
            keyword text, status text, current_bid integer, daily_budget integer,
            spend integer, revenue integer, impressions integer, clicks integer,
            conversions integer, meta_json jsonb
          )
        )
        SELECT
          latest.id,
          latest.target_type           AS "targetType",
          latest.target_key            AS "targetKey",
          cl.id                        AS "listingId",
          clo.id                       AS "listingOptionId",
          latest.external_id           AS "externalId",
          latest.external_option_id    AS "externalOptionId",
          latest.campaign_id           AS "campaignId",
          latest.campaign_name         AS "campaignName",
          latest.keyword,
          latest.status,
          latest.current_bid           AS "currentBid",
          latest.daily_budget          AS "dailyBudget",
          latest.spend,
          latest.revenue,
          latest.impressions,
          latest.clicks,
          latest.conversions,
          NULL::uuid                  AS "masterProductId",
          cl.account_channel           AS "listingChannel",
          -- Keyword rows frequently have no listing match (7,432 of 9,266 in
          -- the live account), but the advertised item name is always stamped
          -- by ingest. Relevance cannot be judged without a product name, so
          -- fall back to it after the catalog-derived names.
          COALESCE(
            cl.display_name,
            cl.channel_name,
            cl.external_id,
            latest.meta_json -> 'advertising.keyword.target' ->> 'productName',
            latest.meta_json -> 'advertising.campaign.target' ->> 'productName',
            latest.meta_json -> 'data' ->> 'productName'
          )                            AS "productName"
        FROM latest
        LEFT JOIN scoped_listings cl
              ON cl.id = latest.listing_id
        LEFT JOIN scoped_options clo
              ON clo.id = latest.listing_option_id
              AND clo.listing_id = cl.id
      `,
        );
        const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), { organizationId, listingIds: targets.flatMap((target) => target.listingId ? [target.listingId] : []) });
        for (const target of targets) target.masterProductId = target.listingId ? summaries.get(target.listingId) ?? null : null;
        const masterProductIds = [...new Set(targets.flatMap((target) =>
          target.masterProductId ? [target.masterProductId] : []))];
        const identities = this.products
          ? await this.products.readSourceIdentities(
            { client: tx },
            { organizationId, selector: { kind: 'ids', values: masterProductIds } },
          )
          : [];
        const identityById = new Map(identities.map((identity) => [
          identity.masterProductId,
          identity,
        ]));
        const gradeByProductId = await readPublishedProductAbcGrades(tx, {
          organizationId,
          masterProductIds,
        });
        return targets.map(({ masterProductId, ...target }) => ({
          ...target,
          productName: masterProductId
            ? identityById.get(masterProductId)?.name ?? target.productName
            : target.productName,
          abcGrade: masterProductId
            ? gradeByProductId.get(masterProductId) ?? null
            : null,
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findExistingInflightActions(
    organizationId: string,
    sinceCreatedAt: Date,
  ): Promise<ExistingAdActionDedupRow[]> {
    return this.prisma.$queryRaw<ExistingAdActionDedupRow[]>(Prisma.sql`
      SELECT
        action.action_type AS "actionType",
        action.external_id AS "externalId",
        action.target_label AS "targetLabel",
        action.current_value AS "currentValue",
        action.proposed_value AS "proposedValue"
      FROM ad_actions action
      ${LATEST_EXECUTION_TASK_JOIN}
      WHERE action.organization_id = ${organizationId}::uuid
        AND action.created_at >= ${sinceCreatedAt}::timestamptz
        AND ${openActionCondition(new Date())}
    `);
  }

  async findKeywordPauseProposals(
    organizationId: string,
  ): Promise<KeywordPauseProposalRow[]> {
    // One instant for the execution deadline across every proposal.
    const now = new Date();
    const rows = await this.prisma.$queryRaw<Array<{
      actionId: string;
      externalId: string | null;
      targetLabel: string;
      reason: string;
      approvalStatus: string;
    } & LatestExecutionTaskColumns>>(Prisma.sql`
      WITH latest_proposal AS (${latestPauseKeywordProposals(organizationId)})
      -- Attempts are joined only for the newest proposals still in review.
      SELECT
        action.id AS "actionId",
        action.external_id AS "externalId",
        action.target_label AS "targetLabel",
        action.reason,
        action.approval_status AS "approvalStatus",
        ${LATEST_EXECUTION_TASK_COLUMNS}
      FROM latest_proposal action
      ${LATEST_EXECUTION_TASK_JOIN}
      WHERE action.organization_id = ${organizationId}::uuid
        AND action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
    `);
    return rows.flatMap((row) => {
      const execution = deriveAdActionExecution(latestExecutionTaskOf(row), now);
      const approvalStatus = AdKeywordPauseProposalSchema.shape.approvalStatus.safeParse(
        row.approvalStatus,
      );
      const executeStatus = AdKeywordPauseProposalSchema.shape.executeStatus.safeParse(
        execution.executeStatus,
      );
      // A task status outside the lifecycle reads as itself; such a proposal is
      // not offered for review.
      if (!approvalStatus.success || !executeStatus.success) return [];
      return [{
        actionId: row.actionId,
        externalId: row.externalId,
        targetLabel: row.targetLabel,
        reason: row.reason,
        approvalStatus: approvalStatus.data,
        executeStatus: executeStatus.data,
        errorMessage: execution.errorMessage,
      }];
    });
  }

  async createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdActionRecord[]> {
    if (candidates.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const pauseKeywordCandidates = candidates.filter((candidate) =>
        pauseKeywordActionKey(candidate) !== null);

      const existingPauseKeys = new Set<string>();
      if (pauseKeywordCandidates.length > 0) {
        // Prevent two concurrent strategy runs from both seeing "no open action"
        // and inserting duplicate pause_keyword proposals for the same tenant.
        // Only a keyword's newest proposal, the one the keyword read shows, can
        // block it, and an approved pause stays open until the operator closes
        // it (`openActionCondition`), so a confirmed keyword is not proposed again.
        await tx.$queryRaw(
          Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtext('kiditem_ad_action_pause_keyword'::text),
              hashtext(${organizationId}::text)
            )::text AS locked
          `,
        );

        const openActions = await tx.$queryRaw<
          Array<{ externalId: string | null; targetLabel: string }>
        >(Prisma.sql`
          WITH latest_proposal AS (${latestPauseKeywordProposals(organizationId)})
          SELECT action.external_id AS "externalId", action.target_label AS "targetLabel"
          FROM latest_proposal action
          ${LATEST_EXECUTION_TASK_JOIN}
          WHERE action.organization_id = ${organizationId}::uuid
            AND ${openActionCondition(now)}
            AND (${Prisma.join(
              pauseKeywordCandidates.map((candidate) => Prisma.sql`(
                action.external_id IS NOT DISTINCT FROM ${candidate.externalId}::text
                AND action.target_label = ${candidate.targetLabel}
              )`),
              ' OR ',
            )})
        `);

        for (const action of openActions) {
          const key = pauseKeywordActionKey(action);
          if (key) existingPauseKeys.add(key);
        }
      }

      const seenPauseKeys = new Set<string>();
      const created: AdActionRecord[] = [];
      for (const candidate of candidates) {
        const pauseKey = pauseKeywordActionKey(candidate);
        if (pauseKey) {
          if (existingPauseKeys.has(pauseKey) || seenPauseKeys.has(pauseKey)) {
            continue;
          }
          seenPauseKeys.add(pauseKey);
        }
        const row = await tx.adAction.create({
          data: {
            organizationId,
            listingId: candidate.listingId,
            adTargetDailyId: candidate.adTargetDailyId,
            actionType: candidate.actionType,
            targetType: candidate.targetType,
            externalId: candidate.externalId,
            targetLabel: candidate.targetLabel,
            reason: candidate.reason,
            priority: candidate.priority,
            currentValue: candidate.currentValue,
            proposedValue: candidate.proposedValue,
            payload: candidate.payload as Prisma.InputJsonValue,
          },
          select: AD_ACTION_ROW_SELECT,
        });
        // A new proposal has no ExecutionTask until it is approved.
        created.push({ ...row, ...deriveAdActionExecution(null, now) });
      }

      return created;
    });
  }

  async approveAdActions(
    ids: string[],
    organizationId: string,
    options: AdActionReviewOptions = {},
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      const scopedActions = await lockReviewableActions(tx, {
        ids,
        organizationId,
        expectedApprovalStatus: options.expectedApprovalStatus,
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return 0;
      await tx.adAction.updateMany({
        where: { id: { in: scopedIds }, organizationId },
        data: {
          approvalStatus: 'approved',
          approvedAt: new Date(),
        },
      });

      // Approval adds a new attempt unless the latest one is still open. A
      // failed or done attempt stays as evidence and the new task becomes the
      // latest. A running attempt past its execution deadline is closed as
      // failed first: its executor stopped, and the extension never writes to
      // Coupang that late.
      // The new attempt is queued for the browser extension, so a failed
      // action reads queued again, except for a manual action
      // (KID-138 decision A): the operator applies it in the ad center, so its
      // attempt is recorded failed with the message saying so and never enters
      // the executor queue.
      const now = new Date();
      const latestTasks = await readLatestExecutionTasks(tx, {
        organizationId,
        actionIds: scopedIds,
      });
      const expiredTaskIds = scopedIds.flatMap((id) => {
        const latest = latestTasks.get(id);
        return latest && isExpiredRunningExecutionTask(latest, now) ? [latest.id] : [];
      });
      if (expiredTaskIds.length > 0) {
        // Still-running only: an outcome report that lands first keeps its
        // outcome. Either way the attempt is no longer open.
        await tx.executionTask.updateMany({
          where: {
            id: { in: expiredTaskIds },
            actionId: { in: scopedIds },
            status: 'running',
          },
          data: expiredAttemptClosure(now),
        });
      }
      const toCreate: Prisma.ExecutionTaskCreateManyInput[] = scopedActions
        .filter(({ id }) => !isOpenExecutionTask(latestTasks.get(id) ?? null, now))
        .map(({ id, actionType }) =>
          isManualAdActionType(actionType)
            ? { actionId: id, ...manualAttemptClosure(now) }
            : { actionId: id, status: 'queued' },
        );

      if (toCreate.length > 0) {
        await tx.executionTask.createMany({ data: toCreate });
      }
      return scopedIds.length;
    });
  }

  async rejectAdActions(
    ids: string[],
    organizationId: string,
    options: AdActionReviewOptions = {},
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      const scopedActions = await lockReviewableActions(tx, {
        ids,
        organizationId,
        expectedApprovalStatus: options.expectedApprovalStatus,
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return 0;
      await tx.adAction.updateMany({
        where: { id: { in: scopedIds }, organizationId },
        data: { approvalStatus: 'rejected' },
      });

      // An attempt running within its deadline may already be writing to
      // Coupang, and a done attempt already changed it, so either refuses the
      // rejection and this transaction rolls back. An attempt the extension has
      // not started is cancelled; a failed or expired attempt stays as it is and
      // only the approval changes.
      const now = new Date();
      const latestTasks = await readLatestExecutionTasks(tx, {
        organizationId,
        actionIds: scopedIds,
      });
      const queuedAttemptIds: string[] = [];
      const queuedActionIds: string[] = [];
      for (const [actionId, latest] of latestTasks) {
        const conflict = rejectionConflict(latest, now);
        if (conflict) throw conflict;
        if (latest?.status === 'queued') {
          queuedAttemptIds.push(latest.id);
          queuedActionIds.push(actionId);
        }
      }
      if (queuedAttemptIds.length > 0) {
        // Only an action's latest attempt can be queued. Compare-and-set on the
        // queued status just read: an executor's report can move a queued
        // attempt meanwhile, since reports take no lock on the action.
        const cancelled = await tx.executionTask.updateMany({
          where: {
            id: { in: queuedAttemptIds },
            actionId: { in: scopedIds },
            status: 'queued',
          },
          data: {
            status: 'cancelled',
            finishedAt: now,
            errorMessage: '사용자 보류 처리',
          },
        });
        if (cancelled.count !== queuedAttemptIds.length) {
          // Decide again on what those reports left: a claim that committed
          // first leaves its attempt running, and a done report leaves it done,
          // either of which refuses the rejection. An attempt closed as failed
          // (a refused claim for a manual action, a failure report) needs
          // nothing more, and only the approval changes.
          const current = await readLatestExecutionTasks(tx, {
            organizationId,
            actionIds: queuedActionIds,
          });
          for (const latest of current.values()) {
            const conflict = rejectionConflict(latest, now);
            if (conflict) throw conflict;
          }
        }
      }
      return scopedIds.length;
    });
  }

  async findOpenCreateCampaignAction(
    organizationId: string,
    campaignName: string,
  ): Promise<{ id: string; executeStatus: string } | null> {
    const now = new Date();
    const [row] = await this.prisma.$queryRaw<
      Array<{ id: string } & LatestExecutionTaskColumns>
    >(Prisma.sql`
      SELECT action.id, ${LATEST_EXECUTION_TASK_COLUMNS}
      FROM ad_actions action
      ${LATEST_EXECUTION_TASK_JOIN}
      WHERE action.organization_id = ${organizationId}::uuid
        AND action.action_type = 'create_campaign'
        AND action.target_label = ${campaignName}
        -- A rejected registration is not in progress (KID-138), whatever its cancelled task reads.
        AND action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
        AND ${derivedExecuteStatusIn(['queued', 'running', 'done'], now)}
      ORDER BY action.created_at DESC, action.id DESC
      LIMIT 1
    `);
    if (!row) return null;
    return {
      id: row.id,
      executeStatus: deriveAdActionExecution(latestExecutionTaskOf(row), now).executeStatus,
    };
  }

  async createCampaignActionWithTask(input: {
    organizationId: string;
    campaignName: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    reason: string;
    payload: Record<string, unknown>;
  }): Promise<{ actionId: string; taskId: string | null }> {
    const action = await this.prisma.adAction.create({
      data: {
        organizationId: input.organizationId,
        actionType: 'create_campaign',
        targetType: 'campaign',
        targetLabel: input.campaignName,
        reason: input.reason,
        priority: input.priority,
        approvalStatus: 'approved',
        payload: input.payload as Prisma.InputJsonValue,
        executionTasks: {
          create: { status: 'queued' },
        },
      },
      select: { id: true, executionTasks: { select: { id: true } } },
    });
    return { actionId: action.id, taskId: action.executionTasks[0]?.id ?? null };
  }

  async reportActionExecution(
    id: string,
    organizationId: string,
    report: AdActionExecutionReport,
  ): Promise<void> {
    const refusal = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const action = await tx.adAction.findFirst({
        where: { id, organizationId },
        select: { id: true, actionType: true },
      });
      if (!action) throw new NotFoundException('AdAction not found');

      const latestTasks = await readLatestExecutionTasks(tx, {
        organizationId,
        actionIds: [action.id],
      });
      const latest = latestTasks.get(action.id) ?? null;
      // A report moves only the attempt it names, and only while that attempt
      // is the action's latest: an older attempt's late report never moves a
      // retry queued or running after it.
      const decision = resolveExecutionReport(action.actionType, latest, report, now);
      if (decision === 'replay') return null;
      if (decision === 'expired' && latest) {
        // The executor reports after its attempt's deadline. The attempt is
        // closed as failed here and the report refused once that commits.
        await tx.executionTask.updateMany({
          where: { id: latest.id, actionId: action.id, status: 'running' },
          data: expiredAttemptClosure(now),
        });
        return executionReportConflict(decision, latest, report);
      }
      if (decision === 'manual_action' && latest) {
        // An executor may not start a manual action (KID-138 decision A). A
        // queued attempt is closed here so it leaves the executor queue, and the
        // report is refused once that commits. A database cut over before
        // migration 015 (KID-230) existed still holds such attempts from
        // approvals before decision A. Compare-and-set on queued: an attempt
        // that already runs is left to its deadline.
        if (latest.status === 'queued') {
          await tx.executionTask.updateMany({
            where: { id: latest.id, actionId: action.id, status: 'queued' },
            data: manualAttemptClosure(now),
          });
        }
        return executionReportConflict(decision, latest, report);
      }
      if (decision !== 'apply' || !latest) {
        throw executionReportConflict(decision, latest, report);
      }

      const data: Prisma.ExecutionTaskUpdateManyMutationInput =
        report.status === 'running'
          ? {
              status: 'running',
              startedAt: now,
              errorMessage: null,
              ...(report.beforeJson !== undefined
                ? { beforeJson: report.beforeJson as Prisma.InputJsonValue }
                : {}),
            }
          : {
              status: report.status,
              startedAt: latest.startedAt ?? now,
              finishedAt: now,
              errorMessage:
                report.status === 'failed'
                  ? scrubExecutionError(report.errorMessage)
                  : null,
              ...(report.afterJson !== undefined
                ? { afterJson: report.afterJson as Prisma.InputJsonValue }
                : {}),
            };
      // Compare-and-set on the status just read: a concurrent report or
      // rejection that moved the task first turns this report into a conflict.
      const updated = await tx.executionTask.updateMany({
        where: { id: latest.id, actionId: action.id, status: latest.status },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: EXECUTION_REPORT_INVALID_TRANSITION,
          message: '실행 보고를 반영할 수 없습니다. 실행 작업 상태가 동시에 바뀌었습니다.',
        });
      }
      return null;
    });
    if (refusal) throw refusal;
  }

  private async hydrateActionRelations(
    organizationId: string,
    actions: AdActionRecord[],
  ): Promise<HydratedAdAction[]> {
    const listingMap = await this.listingAdapter.findScopedAdListings(
      organizationId,
      actions.map((action) => action.listingId),
    );
    const dailyIds = Array.from(
      new Set(
        actions
          .map((action) => action.adTargetDailyId)
          .filter((id): id is string => id != null),
      ),
    );
    const dailies = await readAdTargetRowEvidence(this.prisma, {
      organizationId,
      ids: dailyIds,
    });
    const dailyMap = new Map(dailies.map((daily) => [daily.id, daily]));

    return actions.map((action) => {
      const listing = action.listingId
        ? listingMap.get(action.listingId)
        : null;
      return {
        ...action,
        listing: listing
          ? {
              id: listing.id,
              externalId: listing.externalId,
              channelName: listing.channelName,
              master: {
                id: listing.masterProduct.id,
                code: listing.masterProduct.code,
                name: listing.masterProduct.name,
                abcGrade: listing.masterProduct.abcGrade,
              },
            }
          : null,
        adTargetDaily: action.adTargetDailyId
          ? dailyMap.get(action.adTargetDailyId) ?? null
          : null,
      };
    });
  }
}

// 409 codes of a refused execution report, so the executor and an operator can
// tell a report for a replaced attempt, one for an attempt past its deadline,
// one for an action applied by hand (`EXECUTION_REPORT_MANUAL_ACTION`, which
// the lifecycle policy publishes for the extension), and one the attempt
// cannot take apart.
const EXECUTION_TASK_NOT_LATEST = 'EXECUTION_TASK_NOT_LATEST';
const EXECUTION_TASK_EXPIRED = 'EXECUTION_TASK_EXPIRED';
const EXECUTION_REPORT_INVALID_TRANSITION = 'EXECUTION_REPORT_INVALID_TRANSITION';
// 409 codes of a refused rejection: an attempt running within its deadline may
// already be changing Coupang, and a done attempt already changed it.
const EXECUTION_TASK_RUNNING = 'EXECUTION_TASK_RUNNING';
const EXECUTION_TASK_DONE = 'EXECUTION_TASK_DONE';

/**
 * Why an action's latest attempt refuses a rejection, if it does: one running
 * within its execution deadline may already be changing Coupang, and a done one
 * already changed it.
 */
function rejectionConflict(
  latest: { status: string; startedAt: Date | null } | null,
  now: Date,
): ConflictException | null {
  if (!latest) return null;
  if (latest.status === 'running' && !isExpiredRunningExecutionTask(latest, now)) {
    return rejectRunningConflict();
  }
  if (latest.status === 'done') return rejectDoneConflict();
  return null;
}

function rejectRunningConflict(): ConflictException {
  return new ConflictException({
    code: EXECUTION_TASK_RUNNING,
    message:
      '실행 중인 광고 액션은 거절할 수 없습니다. 광고센터에 이미 반영 중일 수 있으니 실행이 끝난 뒤 다시 확인해 주세요.',
  });
}

function rejectDoneConflict(): ConflictException {
  return new ConflictException({
    code: EXECUTION_TASK_DONE,
    message: '이미 실행된 광고 액션은 거절할 수 없습니다. 광고센터에 이미 반영됐습니다.',
  });
}

/** How a running attempt past its execution deadline is closed. */
function expiredAttemptClosure(now: Date): Prisma.ExecutionTaskUpdateManyMutationInput {
  return {
    status: 'failed',
    finishedAt: now,
    errorMessage: EXECUTION_DEADLINE_EXCEEDED_MESSAGE,
  };
}

/**
 * How a manual action's attempt is recorded: the one an approval adds, and a
 * queued one an executor tried to claim. It never started.
 */
function manualAttemptClosure(now: Date): {
  status: 'failed';
  finishedAt: Date;
  errorMessage: string;
} {
  return {
    status: 'failed',
    finishedAt: now,
    errorMessage: MANUAL_AD_ACTION_MESSAGE,
  };
}

/**
 * Row-locks the named actions of the organization, in id order, and returns
 * the ones a review changes: every one of them, or with
 * `expectedApprovalStatus` only those still in that review. The review is
 * checked under the lock, so a review that waited for another one skips the
 * actions that one changed. The locks serialize concurrent reviews of the same
 * actions, so each reads the attempt the other committed.
 */
async function lockReviewableActions(
  tx: Prisma.TransactionClient,
  input: {
    ids: readonly string[];
    organizationId: string;
    expectedApprovalStatus?: AdActionReviewOptions['expectedApprovalStatus'];
  },
): Promise<Array<{ id: string; actionType: string }>> {
  return tx.$queryRaw<Array<{ id: string; actionType: string }>>(Prisma.sql`
    SELECT action.id, action.action_type AS "actionType"
    FROM ad_actions action
    WHERE action.organization_id = ${input.organizationId}::uuid
      AND action.id IN (${Prisma.join(input.ids.map((id) => Prisma.sql`${id}::uuid`))})
      ${input.expectedApprovalStatus
        ? Prisma.sql`AND action.approval_status = ${input.expectedApprovalStatus}`
        : Prisma.empty}
    ORDER BY action.id
    FOR UPDATE
  `);
}

function executionReportConflict(
  decision: ExecutionReportDecision,
  latest: { status: string } | null,
  report: AdActionExecutionReport,
): ConflictException {
  if (decision === 'not_latest_attempt') {
    return new ConflictException({
      code: EXECUTION_TASK_NOT_LATEST,
      message: '실행 보고를 반영할 수 없습니다. 보고한 실행 시도가 이 액션의 최신 시도가 아닙니다.',
    });
  }
  if (decision === 'expired') {
    return new ConflictException({
      code: EXECUTION_TASK_EXPIRED,
      message: '실행 보고를 반영할 수 없습니다. 실행 기한이 지나 이 실행 시도를 실패로 닫았습니다.',
    });
  }
  if (decision === 'manual_action') {
    return new ConflictException({
      code: EXECUTION_REPORT_MANUAL_ACTION,
      message: '자동 실행하지 않는 액션이라 실행 보고를 받지 않았습니다. 광고센터에서 직접 처리해 주세요.',
    });
  }
  return new ConflictException({
    code: EXECUTION_REPORT_INVALID_TRANSITION,
    message: `실행 보고를 반영할 수 없습니다. 최근 실행 작업: ${latest?.status ?? '없음'}, 보고: ${report.status}`,
  });
}

function pauseKeywordActionKey(input: {
  actionType?: string | null;
  targetType?: string | null;
  externalId?: string | null;
  targetLabel?: string | null;
}): string | null {
  if (input.actionType !== undefined && input.actionType !== 'pause_keyword') return null;
  if (input.targetType !== undefined && input.targetType !== 'keyword') return null;
  const externalId = normalizeActionKeyPart(input.externalId);
  const targetLabel = normalizeActionKeyPart(input.targetLabel);
  if (!externalId && !targetLabel) return null;
  return `${externalId ?? ''}\u0000${targetLabel ?? ''}`;
}

function normalizeActionKeyPart(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}
