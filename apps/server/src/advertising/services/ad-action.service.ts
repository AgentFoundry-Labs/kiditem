import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recomputeRoas } from '../util/ratio-recompute';
import type { AdActionTargetType } from './types';

const ACTION_DEDUP_HOURS = 24;

type ActionCandidate = {
  adTargetDailyId: string;
  listingId: string | null;
  actionType: string;
  targetType: AdActionTargetType;
  externalId: string | null;
  targetLabel: string;
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  currentValue: number | null;
  proposedValue: number | null;
  payload: Record<string, unknown>;
};

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
 * Latest target-daily row per `targetKey` shape. Mirrors the per-row legacy
 * snapshot shape that `createActionCandidate` used to consume — fields are
 * sourced from `ChannelAdTargetDailySnapshot` columns instead of `AdSnapshot`.
 */
type LatestTargetRow = {
  id: string;
  targetType: string;
  targetKey: string;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
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
  conversions: number;
  abcGrade: string | null;
  optionAvailableStock: number | null;
  optionCostPrice: number | null;
  optionSellPrice: number | null;
  optionCommissionRate: number | null;
  productName: string | null;
};

@Injectable()
export class AdActionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActions(query: AdActionQuery, companyId: string) {
    const limit = Math.min(query.limit || 50, 200);

    const where: Prisma.AdActionWhereInput = { companyId };
    if (query.approvalStatus && query.approvalStatus !== 'all') where.approvalStatus = query.approvalStatus;
    if (query.executeStatus && query.executeStatus !== 'all') where.executeStatus = query.executeStatus;
    if (query.listingId) where.listingId = query.listingId;
    if (query.targetType && query.targetType !== 'all') where.targetType = query.targetType;
    if (query.priority && query.priority !== 'all') where.priority = query.priority;

    const [items, counts, latestRun] = await Promise.all([
      this.prisma.adAction.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              externalId: true,
              channelName: true,
              master: { select: { id: true, code: true, name: true, abcGrade: true, adTier: true } },
            },
          },
          adTargetDaily: {
            select: {
              targetType: true,
              campaignName: true,
              keyword: true,
              businessDate: true,
              lastObservedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      Promise.all([
        this.prisma.adAction.count({ where: { companyId, approvalStatus: 'pending_review' } }),
        this.prisma.adAction.count({ where: { companyId, approvalStatus: 'approved', executeStatus: 'queued' } }),
        this.prisma.adAction.count({ where: { companyId, executeStatus: 'running' } }),
        this.prisma.adAction.count({ where: { companyId, executeStatus: 'done' } }),
        this.prisma.adAction.count({ where: { companyId, executeStatus: 'failed' } }),
      ]),
      // H3 — latest scrape metadata from ChannelScrapeRun, not AdSnapshot.
      this.prisma.channelScrapeRun.findFirst({
        where: { companyId },
        orderBy: [
          { finishedAt: 'desc' },
          { startedAt: 'desc' },
          { id: 'desc' },
        ],
        select: { finishedAt: true, startedAt: true, pageType: true },
      }),
    ]);

    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sortedItems = [...items].sort((a, b) => {
      const priDiff =
        (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 9) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 9);
      if (priDiff !== 0) return priDiff;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });

    const latestSnapshotAt =
      latestRun?.finishedAt ?? latestRun?.startedAt ?? null;

    return {
      items: sortedItems,
      summary: {
        pendingReview: counts[0],
        approvedQueued: counts[1],
        running: counts[2],
        done: counts[3],
        failed: counts[4],
        // H3 semantic shift: now latest channel scrape run, not legacy
        // AdSnapshot.capturedAt. Field names preserved for client compat.
        latestSnapshotAt,
        latestSnapshotPageType: latestRun?.pageType || null,
      },
    };
  }

  /**
   * H3 — generate AdAction rows from `ChannelAdTargetDailySnapshot`.
   *
   * The 5 rules are unchanged in threshold but the input shape moves from
   * `AdSnapshot` rows to one latest-businessDate row per `targetKey`.
   * Rule 1 (zero stock) needs option stock — when `listingOptionId` is set we
   * fetch the latest `ChannelListingOptionDailySnapshot.stockQty`, and when
   * absent we skip Rule 1 (same as legacy).
   *
   * On creation `adTargetDailyId` is set to the source target-daily row's
   * `id`. Legacy `snapshotId` is left null (column kept until H4).
   */
  async generateActions(companyId: string) {
    const dedupCutoff = new Date(
      Date.now() - ACTION_DEDUP_HOURS * 60 * 60 * 1000,
    );

    // DISTINCT ON (target_key) returns one row per target — the row with the
    // newest business_date. JS-side post-processing avoided so we don't
    // stream every historical day to the app.
    // We left-join the master product (via listing) to surface ABC grade and
    // the primary product option to surface cost/sell/commission for the
    // profit rate check (Rule 3 priority bump). The option is identified by
    // the active ChannelListingOption.id with the lowest id (deterministic
    // primary-option pick — same convention strategy hydrate uses).
    const latestRows = await this.prisma.$queryRaw<LatestTargetRow[]>(
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
          WHERE cad.company_id = ${companyId}::uuid
            AND cad.target_type IN ('campaign', 'keyword', 'product')
          -- Deterministic latest: business_date DESC, last_observed_at DESC, updated_at DESC, id DESC
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
          latest.listing_id            AS "listingId",
          latest.listing_option_id     AS "listingOptionId",
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
               ON cl.id = latest.listing_id AND cl.is_deleted = false
        LEFT JOIN master_products mp
               ON mp.id = cl.master_id
        LEFT JOIN channel_listing_options clo
               ON clo.id = latest.listing_option_id AND clo.is_active = true
        LEFT JOIN product_options po
               ON po.id = clo.option_id
      `,
    );

    // Rule 1 stock-zero check: prefer the latest option daily snapshot's
    // stockQty when listingOptionId is set. Legacy used the live
    // `ProductOption.availableStock`; the daily-fact replacement gives the
    // observed channel stock at the same time the ad metric was captured.
    // Either signal === 0 fires the rule.
    const optionDailyStockMap = new Map<string, number | null>();
    const listingOptionIds = Array.from(
      new Set(
        latestRows
          .map((r) => r.listingOptionId)
          .filter((id): id is string => id != null),
      ),
    );
    if (listingOptionIds.length > 0) {
      const optionDailies = await this.prisma.$queryRaw<
        { listingOptionId: string; stockQty: number | null }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (listing_option_id)
          listing_option_id AS "listingOptionId",
          stock_qty         AS "stockQty"
        FROM channel_listing_option_daily_snapshots
        WHERE company_id = ${companyId}::uuid
          AND listing_option_id = ANY(${listingOptionIds}::uuid[])
        -- Deterministic latest: business_date DESC, last_observed_at DESC, updated_at DESC, id DESC
        ORDER BY
          listing_option_id,
          business_date DESC,
          last_observed_at DESC NULLS LAST,
          updated_at DESC NULLS LAST,
          id DESC
      `);
      for (const row of optionDailies) {
        optionDailyStockMap.set(row.listingOptionId, row.stockQty);
      }
    }

    const existingActions = await this.prisma.adAction.findMany({
      where: {
        companyId,
        createdAt: { gte: dedupCutoff },
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

    const dedupSet = new Set(
      existingActions.map((item) =>
        [item.actionType, item.externalId || '', item.targetLabel, item.currentValue ?? '', item.proposedValue ?? ''].join('::'),
      ),
    );

    const candidates: ActionCandidate[] = [];
    let skippedExisting = 0;

    for (const row of latestRows) {
      const candidate = createActionCandidate(row, optionDailyStockMap);
      if (!candidate) continue;

      const dedupKey = [
        candidate.actionType,
        candidate.externalId || '',
        candidate.targetLabel,
        candidate.currentValue ?? '',
        candidate.proposedValue ?? '',
      ].join('::');

      if (dedupSet.has(dedupKey)) {
        skippedExisting++;
        continue;
      }

      dedupSet.add(dedupKey);
      candidates.push(candidate);
    }

    if (candidates.length === 0) {
      const targetCount = latestRows.length;
      const reason =
        latestRows.length === 0
          ? '광고 일별 fact 가 아직 없습니다. 광고센터에서 익스텐션 동기화를 먼저 해주세요.'
          : '현재 규칙에 걸린 광고 액션이 없습니다. 최근 일별 fact 기준으로는 즉시 조정할 항목이 없습니다.';

      return {
        generated: 0,
        skippedExisting,
        items: [],
        reason,
        stats: { snapshotCount: latestRows.length, targetCount },
      };
    }

    const created = await this.prisma.$transaction(
      candidates.map((c) =>
        this.prisma.adAction.create({
          data: {
            companyId,
            listingId: c.listingId,
            // H3 — audit pointer to source daily fact row. legacy snapshotId
            // intentionally left null (column removed in H4).
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

    return {
      generated: created.length,
      skippedExisting,
      items: created.slice(0, 10),
      reason: `${created.length}개의 광고 액션을 생성했습니다.`,
      stats: { snapshotCount: latestRows.length, targetCount: latestRows.length },
    };
  }

  async approveActions(ids: string[], companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, companyId },
        data: { approvalStatus: 'approved', approvedAt: new Date(), executeStatus: 'queued' },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, companyId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);

      const existingOpenTasks = await tx.executionTask.findMany({
        where: { actionId: { in: scopedIds }, status: { in: ['queued', 'leased', 'running'] } },
        select: { actionId: true },
      });
      const existingSet = new Set(existingOpenTasks.map((t) => t.actionId));

      const toCreate = scopedIds
        .filter((id) => !existingSet.has(id))
        .map((id) => ({ actionId: id, status: 'queued' }));

      if (toCreate.length > 0) {
        await tx.executionTask.createMany({ data: toCreate });
      }
    });

    return { updated: ids.length };
  }

  async rejectActions(ids: string[], companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, companyId },
        data: { approvalStatus: 'rejected', executeStatus: 'queued' },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, companyId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);

      await tx.executionTask.updateMany({
        where: { actionId: { in: scopedIds }, status: { in: ['queued', 'leased'] } },
        data: { status: 'cancelled', finishedAt: new Date(), errorMessage: '사용자 보류 처리' },
      });
    });

    return { updated: ids.length };
  }

  async markRunning(id: string, beforeJson: Record<string, unknown> | undefined, companyId: string) {
    const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
    if (!action) throw new NotFoundException('AdAction not found');

    await this.prisma.adAction.update({
      where: { id },
      data: {
        executeStatus: 'running',
        beforeJson: beforeJson ? (beforeJson as Prisma.InputJsonValue) : undefined,
        errorMessage: null,
      },
    });
  }

  async markDone(id: string, afterJson: Record<string, unknown> | undefined, companyId: string) {
    const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
    if (!action) throw new NotFoundException('AdAction not found');

    await this.prisma.adAction.update({
      where: { id },
      data: {
        executeStatus: 'done',
        executedAt: new Date(),
        afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
        errorMessage: null,
      },
    });
  }

  async markFailed(
    id: string,
    errorMessage: string | undefined,
    afterJson: Record<string, unknown> | undefined,
    companyId: string,
  ) {
    const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
    if (!action) throw new NotFoundException('AdAction not found');

    await this.prisma.adAction.update({
      where: { id },
      data: {
        executeStatus: 'failed',
        errorMessage: errorMessage || '실행 실패',
        afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async resetFailed(companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      const failedActions = await tx.adAction.findMany({
        where: { companyId, executeStatus: 'failed', approvalStatus: 'approved' },
        select: { id: true },
      });

      if (failedActions.length === 0) return;
      const ids = failedActions.map((a) => a.id);

      await tx.adAction.updateMany({
        where: { id: { in: ids }, companyId },
        data: { executeStatus: 'queued', errorMessage: null },
      });

      await tx.executionTask.createMany({
        data: ids.map((id) => ({ actionId: id, status: 'queued' })),
      });
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * H3 — derive a candidate from one latest target-daily row. Mirrors legacy
 * `createActionCandidate`'s 5 rules but reads from target-daily column shape.
 *
 * `optionDailyStockMap` provides the latest channel-observed `stockQty` per
 * `listingOptionId` so Rule 1 can fire even when the in-memory live
 * `ProductOption.availableStock` is non-zero (channel may have observed
 * sold-out before our internal counter updated).
 */
function createActionCandidate(
  row: LatestTargetRow,
  optionDailyStockMap: Map<string, number | null>,
): ActionCandidate | null {
  const grade = row.abcGrade || 'C';
  // Per-row ROAS for rule decisions — daily target row holds today's revenue
  // and spend for the (campaign|keyword|product) at this grain. Recompute
  // from the row's own numerator/denominator (do not trust any provider
  // ratio that may live in metaJson).
  const roas = recomputeRoas(row.revenue, row.spend) ?? 0;
  const profitRateNum = calcProfitRate({
    costPrice: row.optionCostPrice,
    sellPrice: row.optionSellPrice,
    commissionRate: row.optionCommissionRate,
  });
  const targetLabel =
    row.keyword ||
    row.campaignName ||
    row.productName ||
    row.externalId ||
    '미식별 대상';
  const statusText = (row.status || '').toLowerCase();

  // Rule 1: zero stock → budget cut (option-stock not observable → skip)
  if (
    row.targetType === 'campaign' &&
    row.dailyBudget != null &&
    row.dailyBudget > 0 &&
    row.listingOptionId !== null
  ) {
    const observedStockQty = optionDailyStockMap.has(row.listingOptionId)
      ? optionDailyStockMap.get(row.listingOptionId)
      : undefined;
    const liveStock = row.optionAvailableStock;
    // Rule fires when EITHER the live internal stock OR the latest daily
    // observed channel stock is exactly 0. (`null`/undefined means "not
    // observed" → don't fire.)
    const liveZero = liveStock === 0;
    const observedZero = observedStockQty === 0;
    if (liveZero || observedZero) {
      return {
        adTargetDailyId: row.id,
        listingId: row.listingId,
        actionType: 'change_daily_budget',
        targetType: 'campaign',
        externalId: row.externalId,
        targetLabel,
        reason: `재고 0개인데 광고 예산 ${formatNumber(row.dailyBudget)}원이 유지 중입니다. 즉시 축소가 필요합니다.`,
        priority: 'urgent',
        currentValue: row.dailyBudget,
        proposedValue: 3000,
        payload: basePayload(row, { pageType: 'campaign' }),
      };
    }
  }

  // Rule 2 & 3: keyword pause / bid change
  if (row.targetType === 'keyword') {
    const zeroConversionSpend = row.conversions === 0 && row.spend >= 5000;
    const poorRoas = roas > 0 && roas < 100;

    if (!isPaused(statusText) && (zeroConversionSpend || poorRoas)) {
      return {
        adTargetDailyId: row.id,
        listingId: row.listingId,
        actionType: 'pause_keyword',
        targetType: 'keyword',
        externalId: row.externalId,
        targetLabel,
        reason: zeroConversionSpend
          ? `전환 0건인데 광고비 ${formatNumber(row.spend)}원이 누적되었습니다. 즉시 OFF 권장.`
          : `ROAS ${Math.round(roas)}%로 기준 미달입니다. 키워드 OFF 후 재검토가 필요합니다.`,
        priority: grade === 'A' ? 'high' : 'urgent',
        currentValue: null,
        proposedValue: null,
        payload: basePayload(row, { pageType: 'keyword' }),
      };
    }

    if (row.currentBid && row.currentBid > 0 && roas >= 100 && roas < 200) {
      const nextBid = roundBid(row.currentBid * 0.85);
      if (nextBid < row.currentBid) {
        return {
          adTargetDailyId: row.id,
          listingId: row.listingId,
          actionType: 'change_bid',
          targetType: 'keyword',
          externalId: row.externalId,
          targetLabel,
          reason: `ROAS ${Math.round(roas)}%로 입찰가 하향 구간입니다. 현재 ${formatNumber(row.currentBid)}원 → ${formatNumber(nextBid)}원.`,
          priority: profitRateNum !== null && profitRateNum < 0 ? 'high' : 'medium',
          currentValue: row.currentBid,
          proposedValue: nextBid,
          payload: basePayload(row, { pageType: 'keyword' }),
        };
      }
    }
  }

  // Rule 4 & 5: campaign budget increase / decrease
  if (
    row.targetType === 'campaign' &&
    row.dailyBudget != null &&
    row.dailyBudget > 0
  ) {
    if (grade === 'A' && roas >= 480) {
      const nextBudget = roundBudget(row.dailyBudget * 1.2);
      if (nextBudget > row.dailyBudget) {
        return {
          adTargetDailyId: row.id,
          listingId: row.listingId,
          actionType: 'change_daily_budget',
          targetType: 'campaign',
          externalId: row.externalId,
          targetLabel,
          reason: `A등급 / ROAS ${Math.round(roas)}%로 예산 확대 구간입니다. 현재 ${formatNumber(row.dailyBudget)}원 → ${formatNumber(nextBudget)}원.`,
          priority: 'high',
          currentValue: row.dailyBudget,
          proposedValue: nextBudget,
          payload: basePayload(row, { pageType: 'campaign' }),
        };
      }
    }

    if ((grade === 'C' || roas < 100) && row.dailyBudget > 3000) {
      const nextBudget = Math.max(3000, roundBudget(row.dailyBudget * 0.5));
      if (nextBudget < row.dailyBudget) {
        return {
          adTargetDailyId: row.id,
          listingId: row.listingId,
          actionType: 'change_daily_budget',
          targetType: 'campaign',
          externalId: row.externalId,
          targetLabel,
          reason: `${grade}등급 / ROAS ${Math.round(roas)}%로 예산 축소 구간입니다. 현재 ${formatNumber(row.dailyBudget)}원 → ${formatNumber(nextBudget)}원.`,
          priority: grade === 'C' ? 'high' : 'medium',
          currentValue: row.dailyBudget,
          proposedValue: nextBudget,
          payload: basePayload(row, { pageType: 'campaign' }),
        };
      }
    }
  }

  return null;
}

function calcProfitRate(option: {
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: number | null;
}): number | null {
  const cost = option.costPrice ?? 0;
  const sell = option.sellPrice ?? 0;
  if (sell <= 0) return null;
  const commission =
    option.commissionRate != null ? Number(option.commissionRate) : 0;
  const commissionFee = sell * commission;
  const profit = sell - cost - commissionFee;
  return Math.round((profit / sell) * 10000) / 100;
}

function basePayload(
  row: Pick<
    LatestTargetRow,
    'targetType' | 'campaignName' | 'keyword' | 'productName' | 'externalId' | 'status'
  >,
  extras: Record<string, unknown>,
) {
  return {
    pageType: row.targetType,
    campaignName: row.campaignName,
    keyword: row.keyword,
    productName: row.productName,
    externalId: row.externalId,
    status: row.status,
    ...extras,
  };
}

function roundBudget(value: number) {
  return Math.max(3000, Math.round(value / 100) * 100);
}

function roundBid(value: number) {
  return Math.max(100, Math.round(value / 10) * 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}

function isPaused(statusText: string) {
  return ['off', '중지', '일시중지', '비활성', 'pause'].some((token) => statusText.includes(token));
}
