// `AdAction` aggregate adapter: query + persistence + dedup + transaction-
// wrapped lifecycle writes. The adapter owns `$transaction` for approve /
// reject / reset so the application service stays Prisma-free.

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AdAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { completeAdCampaignSourceIds, readCompleteAdKeywordFacts } from './ad-keyword-complete-read';
import { AdListingRepositoryAdapter } from './ad-listing.repository.adapter';
import type { ActionCandidate } from '../../../domain/ad-action-rules';
import type {
  AdActionQuery,
  AdActionRepositoryPort,
  AdActionReviewResult,
  AdActionUpdatePatch,
  ExistingAdActionDedupRow,
  OpenKeywordRelevanceActionRow,
  HydratedAdAction,
  LatestTargetRow,
} from '../../../application/port/out/repository/ad-action.repository.port';

const OPEN_ACTION_APPROVAL_STATUSES = ['pending_review', 'approved'] as const;
const OPEN_ACTION_EXECUTE_STATUSES = ['queued', 'running'] as const;

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

    const where: Prisma.AdActionWhereInput = { organizationId };
    if (query.approvalStatus && query.approvalStatus !== 'all')
      where.approvalStatus = query.approvalStatus;
    if (query.executeStatus && query.executeStatus !== 'all')
      where.executeStatus = query.executeStatus;
    if (query.listingId) where.listingId = query.listingId;
    if (query.targetType && query.targetType !== 'all')
      where.targetType = query.targetType;
    if (query.priority && query.priority !== 'all')
      where.priority = query.priority;

    const [actions, counts, latestRun] = await Promise.all([
      this.prisma.adAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      Promise.all([
        this.prisma.adAction.count({
          where: { organizationId, approvalStatus: 'pending_review' },
        }),
        this.prisma.adAction.count({
          where: {
            organizationId,
            approvalStatus: 'approved',
            executeStatus: 'queued',
          },
        }),
        this.prisma.adAction.count({
          where: { organizationId, executeStatus: 'running' },
        }),
        this.prisma.adAction.count({
          where: { organizationId, executeStatus: 'done' },
        }),
        this.prisma.adAction.count({
          where: { organizationId, executeStatus: 'failed' },
        }),
      ]),
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
        pendingReview: counts[0],
        approvedQueued: counts[1],
        running: counts[2],
        done: counts[3],
        failed: counts[4],
        latestSnapshotAt:
          latestRun?.finishedAt ?? latestRun?.startedAt ?? null,
        latestSnapshotPageType: latestRun?.pageType || null,
      },
    };
  }

  async findLatestTargetRows(organizationId: string): Promise<LatestTargetRow[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const { rows } = await readCompleteAdKeywordFacts(tx, organizationId);
        const keywordRows = rows.map((row) => ({
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
          conversions: row.conversions,
          meta_json: row.metaJson,
        }));
        return tx.$queryRaw<LatestTargetRow[]>(
          Prisma.sql`
        WITH non_keyword AS (
          SELECT DISTINCT ON (cad.target_key)
            cad.id,
            cad.target_type,
            cad.target_key,
            cad.listing_id,
            cad.listing_option_id,
            cad.external_id,
            cad.external_option_id,
            cad.campaign_id,
            cad.campaign_name,
            cad.keyword,
            cad.status,
            cad.current_bid,
            cad.daily_budget,
            cad.spend,
            cad.revenue,
            cad.impressions,
            cad.clicks,
            cad.conversions,
            cad.meta_json
          FROM channel_ad_target_daily_snapshots cad
          WHERE cad.organization_id = ${organizationId}::uuid
            AND cad.channel = 'coupang'
            AND cad.target_type IN ('campaign', 'product')
            AND cad.source_import_run_id IN (${completeAdCampaignSourceIds(organizationId)})
          ORDER BY
            cad.target_key,
            cad.business_date DESC,
            cad.last_observed_at DESC NULLS LAST,
            cad.updated_at DESC NULLS LAST,
            cad.id DESC
        ), latest AS (
          SELECT * FROM non_keyword
          UNION ALL
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(keywordRows)}::jsonb) AS keyword (
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
          mp.abc_grade                 AS "abcGrade",
          clo.commission_rate          AS "optionCommissionRate",
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
        LEFT JOIN channel_listings cl
              ON cl.id = latest.listing_id
              AND cl.organization_id = ${organizationId}::uuid
              AND cl.is_active = true
              AND EXISTS (
                SELECT 1
                FROM channel_accounts account
                WHERE account.id = cl.channel_account_id
                  AND account.organization_id = cl.organization_id
                  AND account.channel = 'coupang'
                  AND account.status = 'active'
              )
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findExistingInflightActions(
    organizationId: string,
    sinceCreatedAt: Date,
  ): Promise<ExistingAdActionDedupRow[]> {
    return this.prisma.adAction.findMany({
      where: {
        organizationId,
        createdAt: { gte: sinceCreatedAt },
        approvalStatus: { in: ['pending_review', 'approved'] },
        executeStatus: { in: ['queued', 'running'] },
      },
      select: {
        actionType: true,
        externalId: true,
        targetLabel: true,
        currentValue: true,
        proposedValue: true,
      },
    });
  }

  async findOpenKeywordRelevanceActions(
    organizationId: string,
  ): Promise<OpenKeywordRelevanceActionRow[]> {
    return this.prisma.adAction.findMany({
      where: {
        organizationId,
        actionType: 'pause_keyword',
        approvalStatus: { in: ['pending_review', 'approved'] },
        executeStatus: { in: ['queued', 'running'] },
      },
      select: { targetLabel: true, externalId: true, reason: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdAction[]> {
    if (candidates.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
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

        const openActions = await tx.adAction.findMany({
          where: {
            organizationId,
            actionType: 'pause_keyword',
            targetType: 'keyword',
            approvalStatus: { in: [...OPEN_ACTION_APPROVAL_STATUSES] },
            executeStatus: { in: [...OPEN_ACTION_EXECUTE_STATUSES] },
            OR: pauseKeywordCandidates.map((candidate) => ({
              externalId: candidate.externalId,
              targetLabel: candidate.targetLabel,
            })),
          },
          select: { externalId: true, targetLabel: true },
        });

        for (const action of openActions) {
          const key = pauseKeywordActionKey(action);
          if (key) existingPauseKeys.add(key);
        }
      }

      const seenPauseKeys = new Set<string>();
      const created: AdAction[] = [];
      for (const candidate of candidates) {
        const pauseKey = pauseKeywordActionKey(candidate);
        if (pauseKey) {
          if (existingPauseKeys.has(pauseKey) || seenPauseKeys.has(pauseKey)) {
            continue;
          }
          seenPauseKeys.add(pauseKey);
        }
        created.push(await tx.adAction.create({
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
        }));
      }

      return created;
    });
  }

  async approveAdActions(
    ids: string[],
    organizationId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, organizationId },
        data: {
          approvalStatus: 'approved',
          approvedAt: new Date(),
          executeStatus: 'queued',
        },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, organizationId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return;

      const existingOpenTasks = await tx.executionTask.findMany({
        where: {
          actionId: { in: scopedIds },
          status: { in: ['queued', 'leased', 'running'] },
        },
        select: { actionId: true },
      });
      const existingSet = new Set(
        existingOpenTasks.map((t) => t.actionId),
      );

      const toCreate = scopedIds
        .filter((id) => !existingSet.has(id))
        .map((id) => ({ actionId: id, status: 'queued' }));

      if (toCreate.length > 0) {
        await tx.executionTask.createMany({ data: toCreate });
      }
    });
  }

  async rejectAdActions(
    ids: string[],
    organizationId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, organizationId },
        data: { approvalStatus: 'rejected', executeStatus: 'queued' },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, organizationId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return;

      await tx.executionTask.updateMany({
        where: {
          actionId: { in: scopedIds },
          status: { in: ['queued', 'leased'] },
        },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          errorMessage: '사용자 보류 처리',
        },
      });
    });
  }

  async resetFailedAdActions(organizationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const failedActions = await tx.adAction.findMany({
        where: {
          organizationId,
          executeStatus: 'failed',
          approvalStatus: 'approved',
        },
        select: { id: true },
      });

      if (failedActions.length === 0) return;
      const ids = failedActions.map((a) => a.id);

      await tx.adAction.updateMany({
        where: { id: { in: ids }, organizationId },
        data: { executeStatus: 'queued', errorMessage: null },
      });

      await tx.executionTask.createMany({
        data: ids.map((id) => ({ actionId: id, status: 'queued' })),
      });
    });
  }

  async findOpenCreateCampaignAction(
    organizationId: string,
    campaignName: string,
  ): Promise<{ id: string; executeStatus: string } | null> {
    return this.prisma.adAction.findFirst({
      where: {
        organizationId,
        actionType: 'create_campaign',
        targetLabel: campaignName,
        executeStatus: { in: ['queued', 'running', 'done'] },
      },
      select: { id: true, executeStatus: true },
    });
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
        executeStatus: 'queued',
        payload: input.payload as Prisma.InputJsonValue,
        executionTasks: {
          create: { status: 'queued' },
        },
      },
      include: { executionTasks: true },
    });
    const taskId =
      (action.executionTasks as { id: string }[])[0]?.id ?? null;
    return { actionId: action.id, taskId };
  }

  async updateActionOrThrow(
    id: string,
    organizationId: string,
    data: AdActionUpdatePatch,
  ): Promise<void> {
    const patch: Prisma.AdActionUpdateManyMutationInput = {};
    if (data.executeStatus !== undefined)
      patch.executeStatus = data.executeStatus;
    if (data.executedAt !== undefined) patch.executedAt = data.executedAt;
    if (data.beforeJson !== undefined)
      patch.beforeJson = data.beforeJson as Prisma.InputJsonValue;
    if (data.afterJson !== undefined)
      patch.afterJson = data.afterJson as Prisma.InputJsonValue;
    if (data.errorMessage !== undefined)
      patch.errorMessage = data.errorMessage;

    const updated = await this.prisma.adAction.updateMany({
      where: { id, organizationId },
      data: patch,
    });
    if (updated.count !== 1) throw new NotFoundException('AdAction not found');
  }

  private async hydrateActionRelations(
    organizationId: string,
    actions: AdAction[],
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
    const dailies =
      dailyIds.length > 0
        ? await this.prisma.channelAdTargetDailySnapshot.findMany({
            where: { id: { in: dailyIds }, organizationId },
            select: {
              id: true,
              targetType: true,
              campaignName: true,
              keyword: true,
              businessDate: true,
              lastObservedAt: true,
            },
          })
        : [];
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
                adTier: listing.masterProduct.adTier,
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
