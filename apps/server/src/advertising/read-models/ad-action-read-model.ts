import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { findScopedAdListings } from '../services/read-models/ad-listing-read-model';

export interface AdActionQuery {
  approvalStatus?: string;
  executeStatus?: string;
  listingId?: string;
  optionId?: string;
  targetType?: string;
  priority?: string;
  limit?: number;
}

export type LatestTargetRow = {
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

export async function findAdActionsForReview(
  prisma: PrismaService,
  query: AdActionQuery,
  companyId: string,
) {
  const limit = Math.min(query.limit || 50, 200);

  const where: Prisma.AdActionWhereInput = { companyId };
  if (query.approvalStatus && query.approvalStatus !== 'all') where.approvalStatus = query.approvalStatus;
  if (query.executeStatus && query.executeStatus !== 'all') where.executeStatus = query.executeStatus;
  if (query.listingId) where.listingId = query.listingId;
  if (query.targetType && query.targetType !== 'all') where.targetType = query.targetType;
  if (query.priority && query.priority !== 'all') where.priority = query.priority;

  const [actions, counts, latestRun] = await Promise.all([
    prisma.adAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    Promise.all([
      prisma.adAction.count({ where: { companyId, approvalStatus: 'pending_review' } }),
      prisma.adAction.count({ where: { companyId, approvalStatus: 'approved', executeStatus: 'queued' } }),
      prisma.adAction.count({ where: { companyId, executeStatus: 'running' } }),
      prisma.adAction.count({ where: { companyId, executeStatus: 'done' } }),
      prisma.adAction.count({ where: { companyId, executeStatus: 'failed' } }),
    ]),
    prisma.channelScrapeRun.findFirst({
      where: { companyId },
      orderBy: [
        { finishedAt: 'desc' },
        { startedAt: 'desc' },
        { id: 'desc' },
      ],
      select: { finishedAt: true, startedAt: true, pageType: true },
    }),
  ]);

  const hydrated = await hydrateActionRelations(prisma, companyId, actions);
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
      latestSnapshotAt: latestRun?.finishedAt ?? latestRun?.startedAt ?? null,
      latestSnapshotPageType: latestRun?.pageType || null,
    },
  };
}

export async function findLatestAdActionTargetRows(
  prisma: PrismaService,
  companyId: string,
): Promise<LatestTargetRow[]> {
  return prisma.$queryRaw<LatestTargetRow[]>(
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
            AND cl.company_id = ${companyId}::uuid
            AND cl.is_deleted = false
      LEFT JOIN master_products mp
             ON mp.id = cl.master_id
            AND mp.company_id = ${companyId}::uuid
      LEFT JOIN channel_listing_options clo
             ON clo.id = latest.listing_option_id
            AND clo.company_id = ${companyId}::uuid
            AND clo.is_active = true
      LEFT JOIN product_options po
             ON po.id = clo.option_id
            AND po.company_id = ${companyId}::uuid
    `,
  );
}

export async function findLatestListingOptionStockById(
  prisma: PrismaService,
  companyId: string,
  listingOptionIds: string[],
): Promise<Map<string, number | null>> {
  const ids = Array.from(new Set(listingOptionIds));
  if (ids.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    { listingOptionId: string; stockQty: number | null }[]
  >(Prisma.sql`
    SELECT DISTINCT ON (listing_option_id)
      listing_option_id AS "listingOptionId",
      stock_qty         AS "stockQty"
    FROM channel_listing_option_daily_snapshots
    WHERE company_id = ${companyId}::uuid
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

type ActionRow = Prisma.AdActionGetPayload<Record<string, never>>;

async function hydrateActionRelations(
  prisma: PrismaService,
  companyId: string,
  actions: ActionRow[],
) {
  const listingMap = await findScopedAdListings(
    prisma,
    companyId,
    actions.map((action) => action.listingId),
  );
  const dailyIds = Array.from(
    new Set(
      actions
        .map((action) => action.adTargetDailyId)
        .filter((id): id is string => id != null),
    ),
  );
  const dailies = dailyIds.length > 0
    ? await prisma.channelAdTargetDailySnapshot.findMany({
        where: { id: { in: dailyIds }, companyId },
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
    const listing = action.listingId ? listingMap.get(action.listingId) : null;
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
