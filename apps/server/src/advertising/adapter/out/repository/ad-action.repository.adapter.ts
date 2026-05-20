// `AdAction` aggregate adapter: query + persistence + dedup + transaction-
// wrapped lifecycle writes. The adapter owns `$transaction` for approve /
// reject / reset so the application service stays Prisma-free.

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AdAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ActionCandidate } from '../../../domain/ad-action-rules';
import type {
  AdActionQuery,
  AdActionRepositoryPort,
  AdActionReviewResult,
  AdActionUpdatePatch,
  ExistingAdActionDedupRow,
  HydratedAdAction,
  LatestTargetRow,
} from '../../../application/port/out/repository/ad-action.repository.port';
import { AdListingRepositoryAdapter } from './ad-listing.repository.adapter';

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

  async findLatestTargetRows(
    organizationId: string,
  ): Promise<LatestTargetRow[]> {
    return this.prisma.$queryRaw<LatestTargetRow[]>(
      Prisma.sql`
        WITH latest AS (
          SELECT DISTINCT ON (cad.target_key)
            cad.id,
            cad.target_type,
            cad.target_key,
            cad.listing_id,
            cad.listing_option_id,
            cad.external_id,
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
            cad.conversions
          FROM channel_ad_target_daily_snapshots cad
          WHERE cad.organization_id = ${organizationId}::uuid
            AND cad.target_type IN ('campaign', 'keyword', 'product')
          ORDER BY
            cad.target_key,
            cad.business_date DESC,
            cad.last_observed_at DESC NULLS LAST,
            cad.updated_at DESC NULLS LAST,
            cad.id DESC
        )
        SELECT
          latest.id,
          latest.target_type           AS "targetType",
          latest.target_key            AS "targetKey",
          cl.id                        AS "listingId",
          clo.id                       AS "listingOptionId",
          latest.external_id           AS "externalId",
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
          po.available_stock           AS "optionAvailableStock",
          po.cost_price                AS "optionCostPrice",
          po.sell_price                AS "optionSellPrice",
          po.commission_rate           AS "optionCommissionRate",
          mp.name                      AS "productName"
        FROM latest
        LEFT JOIN channel_listings cl
               ON cl.id = latest.listing_id
              AND cl.organization_id = ${organizationId}::uuid
              AND cl.is_deleted = false
        LEFT JOIN master_products mp
               ON mp.id = cl.master_id
              AND mp.organization_id = ${organizationId}::uuid
        LEFT JOIN channel_listing_options clo
               ON clo.id = latest.listing_option_id
              AND clo.organization_id = ${organizationId}::uuid
              AND clo.is_active = true
        LEFT JOIN product_options po
               ON po.id = clo.option_id
              AND po.organization_id = ${organizationId}::uuid
      `,
    );
  }

  async findLatestListingOptionStockById(
    organizationId: string,
    listingOptionIds: string[],
  ): Promise<Map<string, number | null>> {
    const ids = Array.from(new Set(listingOptionIds));
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<
      { listingOptionId: string; stockQty: number | null }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (listing_option_id)
        listing_option_id AS "listingOptionId",
        stock_qty         AS "stockQty"
      FROM channel_listing_option_daily_snapshots
      WHERE organization_id = ${organizationId}::uuid
        AND listing_option_id = ANY(${ids}::uuid[])
      ORDER BY
        listing_option_id,
        business_date DESC,
        last_observed_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        id DESC
    `);

    return new Map(rows.map((row) => [row.listingOptionId, row.stockQty]));
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

  async createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdAction[]> {
    if (candidates.length === 0) return [];
    return this.prisma.$transaction(
      candidates.map((c) =>
        this.prisma.adAction.create({
          data: {
            organizationId,
            listingId: c.listingId,
            adTargetDailyId: c.adTargetDailyId,
            actionType: c.actionType,
            targetType: c.targetType,
            externalId: c.externalId,
            targetLabel: c.targetLabel,
            reason: c.reason,
            priority: c.priority,
            currentValue: c.currentValue,
            proposedValue: c.proposedValue,
            payload: c.payload as Prisma.InputJsonValue,
          },
        }),
      ),
    );
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
