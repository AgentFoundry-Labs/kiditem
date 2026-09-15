// `AdAction` aggregate adapter: query + persistence + dedup + transaction-
// wrapped lifecycle writes. The adapter owns `$transaction` for approve /
// reject / execution reports so the application service stays Prisma-free.
// Execution words are read from each action's latest ExecutionTask through
// `read/ad-action-execution.ts`; this adapter writes them only to that task.

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AdAction } from '@prisma/client';
import { AdKeywordPauseProposalSchema } from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readAdTargetRowEvidence,
  readCompleteAdKeywordFacts,
  readCurrentAdTargetRows,
} from '../../../read/ad-target-facts';
import {
  deriveAdActionExecution,
  derivedExecuteStatusIn,
  LATEST_EXECUTION_TASK_COLUMNS,
  LATEST_EXECUTION_TASK_JOIN,
  latestExecutionTaskOf,
  readLatestExecutionTasks,
  type LatestExecutionTaskColumns,
} from '../../../read/ad-action-execution';
import { AdListingRepositoryAdapter } from './ad-listing.repository.adapter';
import { readPublishedProductAbcGrades } from '../../../../products/read/product-abc-publication.reader';
import type { ActionCandidate } from '../../../domain/ad-action-rules';
import { scrubExecutionError } from '../../../domain/ad-execution-error-scrubber';
import {
  EXECUTION_DEADLINE_EXCEEDED_MESSAGE,
  isExpiredRunningExecutionTask,
  isOpenExecutionTask,
  resolveExecutionReport,
  type ExecutionReportDecision,
} from '../../../domain/execution-task-lifecycle';
import type {
  AdActionExecution,
  AdActionExecutionReport,
  AdActionQuery,
  AdActionRecord,
  AdActionRepositoryPort,
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
    private readonly prisma: PrismaService,
    // Reused for the listing hydration step in `findAdActionsForReview`.
    // The adapter depends on a sibling adapter here, which is allowed for
    // intra-domain composition; ports/services never see this.
    private readonly listingAdapter: AdListingRepositoryAdapter,
  ) {}

  async findAdActionsForReview(
    query: AdActionQuery,
    organizationId: string,
  ): Promise<AdActionReviewResult> {
    const limit = Math.min(query.limit || 50, 200);
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
        const currentRows = await readCurrentAdTargetRows(tx, organizationId);
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
        const targets = await tx.$queryRaw<Array<Omit<LatestTargetRow, 'abcGrade'> & {
          masterProductId: string | null;
        }>>(
          Prisma.sql`
        WITH scoped_listings AS (
          -- Active listings of the organization's active Coupang accounts.
          SELECT cl.id, cl.channel_account_id, cl.master_product_id, cl.display_name,
            cl.channel_name, cl.external_id, account.channel AS account_channel
          FROM channel_listings cl
          JOIN channel_accounts account
            ON account.id = cl.channel_account_id
            AND account.organization_id = cl.organization_id
          WHERE cl.organization_id = ${organizationId}::uuid
            AND cl.is_active = true
            AND account.channel = 'coupang'
            AND account.status = 'active'
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
          mp.id                        AS "masterProductId",
          cl.account_channel           AS "listingChannel",
          -- Keyword rows frequently have no listing match (7,432 of 9,266 in
          -- the live account), but the advertised item name is always stamped
          -- by ingest. Relevance cannot be judged without a product name, so
          -- fall back to it after the catalog-derived names.
          COALESCE(
            mp.name,
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
        LEFT JOIN channel_listing_options clo
              ON clo.id = latest.listing_option_id
              AND clo.organization_id = ${organizationId}::uuid
              AND clo.listing_id = cl.id
              AND clo.is_active = true
        LEFT JOIN master_products mp
              ON mp.id = cl.master_product_id
              AND mp.organization_id = ${organizationId}::uuid
              AND mp.is_active = true
      `,
        );
        const gradeByProductId = await readPublishedProductAbcGrades(tx, {
          organizationId,
          masterProductIds: targets.flatMap((target) =>
            target.masterProductId ? [target.masterProductId] : []),
        });
        return targets.map(({ masterProductId, ...target }) => ({
          ...target,
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
        AND action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
        AND ${derivedExecuteStatusIn(OPEN_ACTION_EXECUTE_STATUSES, new Date())}
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
      WITH latest_proposal AS (
        -- Each keyword's newest proposal, whatever its review. Rejecting it is
        -- the last word on the keyword, so an older proposal does not come back.
        SELECT DISTINCT ON (proposal.external_id, proposal.target_label)
          proposal.id,
          proposal.external_id,
          proposal.target_label,
          proposal.reason,
          proposal.approval_status
        FROM ad_actions proposal
        WHERE proposal.organization_id = ${organizationId}::uuid
          AND proposal.action_type = 'pause_keyword'
        ORDER BY proposal.external_id, proposal.target_label,
          proposal.created_at DESC, proposal.id DESC
      ),
      open_proposal AS (
        SELECT * FROM latest_proposal
        WHERE latest_proposal.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
      )
      -- Attempts are joined only for the newest proposals still in play.
      SELECT
        action.id AS "actionId",
        action.external_id AS "externalId",
        action.target_label AS "targetLabel",
        action.reason,
        action.approval_status AS "approvalStatus",
        ${LATEST_EXECUTION_TASK_COLUMNS}
      FROM open_proposal action
      ${LATEST_EXECUTION_TASK_JOIN}
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
          SELECT action.external_id AS "externalId", action.target_label AS "targetLabel"
          FROM ad_actions action
          ${LATEST_EXECUTION_TASK_JOIN}
          WHERE action.organization_id = ${organizationId}::uuid
            AND action.action_type = 'pause_keyword'
            AND action.target_type = 'keyword'
            AND action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
            AND ${derivedExecuteStatusIn(OPEN_ACTION_EXECUTE_STATUSES, now)}
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
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      // The row locks this update takes serialize concurrent approvals of the
      // same actions, so each reads the attempt the other committed.
      await tx.adAction.updateMany({
        where: { id: { in: ids }, organizationId },
        data: {
          approvalStatus: 'approved',
          approvedAt: new Date(),
        },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, organizationId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return 0;

      // Approval queues a new attempt unless the latest one is still open. A
      // failed or done attempt stays as evidence and the new queued task
      // becomes the latest, so a failed action reads queued again. A running
      // attempt past its execution deadline is closed as failed first: its
      // executor stopped, and the extension never writes to Coupang that late.
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
      const toCreate = scopedIds
        .filter((id) => !isOpenExecutionTask(latestTasks.get(id) ?? null, now))
        .map((id) => ({ actionId: id, status: 'queued' }));

      if (toCreate.length > 0) {
        await tx.executionTask.createMany({ data: toCreate });
      }
      return scopedIds.length;
    });
  }

  async rejectAdActions(
    ids: string[],
    organizationId: string,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, organizationId },
        data: { approvalStatus: 'rejected' },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, organizationId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return 0;

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
      for (const latest of latestTasks.values()) {
        if (!latest) continue;
        if (latest.status === 'running' && !isExpiredRunningExecutionTask(latest, now)) {
          throw rejectRunningConflict();
        }
        if (latest.status === 'done') throw rejectDoneConflict();
        if (latest.status === 'queued') queuedAttemptIds.push(latest.id);
      }
      if (queuedAttemptIds.length > 0) {
        // Only an action's latest attempt can be queued. Compare-and-set on the
        // queued status just read: the executor claims a queued attempt with its
        // running report, so a claim that commits first leaves its attempt
        // running and uncancelled, and the rejection is refused.
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
        if (cancelled.count !== queuedAttemptIds.length) throw rejectRunningConflict();
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
        select: { id: true },
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
      const decision = resolveExecutionReport(latest, report, now);
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
// and one the attempt cannot take apart.
const EXECUTION_TASK_NOT_LATEST = 'EXECUTION_TASK_NOT_LATEST';
const EXECUTION_TASK_EXPIRED = 'EXECUTION_TASK_EXPIRED';
const EXECUTION_REPORT_INVALID_TRANSITION = 'EXECUTION_REPORT_INVALID_TRANSITION';
// 409 codes of a refused rejection: an attempt running within its deadline may
// already be changing Coupang, and a done attempt already changed it.
const EXECUTION_TASK_RUNNING = 'EXECUTION_TASK_RUNNING';
const EXECUTION_TASK_DONE = 'EXECUTION_TASK_DONE';

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
