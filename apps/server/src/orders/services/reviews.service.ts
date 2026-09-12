// apps/server/src/orders/services/reviews.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListReviewsQueryDto, type ReviewFilter } from '../dto/list-reviews.dto';
import { ListReviewItemsQueryDto } from '../dto/list-review-items.dto';
import type {
  OrdersReviewListingStatsReadPort,
  ReviewListingStatsReadRequest,
  ReviewListingStatsReadResult,
} from '../application/port/in/review-listing-stats-read.port';
import type {
  ReviewItem,
  ReviewItemListResponse,
  ReviewListItem,
  ReviewListResponse,
  ReviewSummary,
} from '@kiditem/shared/reviews';

const COUPANG_REVIEW_SOURCE_TYPE = 'coupang_reviews';

const RECENT_DAYS = 30;
const RECENT_WINDOW_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

// Listing-level "needs attention" thresholds — kept in sync with the legacy
// Reviews UI (`apps/web/src/app/reviews/page.tsx` filter tabs +
// `ReviewTable.getReviewStatus`).
const NEEDS_ATTENTION_RATING_THRESHOLD = 3.5;
const NEEDS_ATTENTION_MIN_REVIEWS = 5;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const DEFAULT_FILTER: ReviewFilter = 'all';

interface ListingAggregate {
  listingId: string;
  totalReviews: number;
  avgRating: number;
  lastReviewAt: Date | null;
}

type ReviewReadRow = {
  id: string;
  listingId: string | null;
  itemName: string | null;
  externalOptionId: string | null;
  externalProductId: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  reviewerName: string | null;
  reviewedAt: Date;
  imageCount: number;
  videoCount: number;
};

type RawAggregateRow = {
  listingId: string;
  totalReviews: number;
  avgRating: number | null;
  lastReviewAt: Date | null;
};

type RawRecentRow = { listingId: string; count: number };

type RawListingStatsRow = {
  listingId: string;
  totalReviews: number;
  avgRating: number | null;
};

@Injectable()
export class ReviewsService implements OrdersReviewListingStatsReadPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listing review metrics for another owner domain.
   *
   * This is intentionally the only cross-domain review aggregate surface:
   * `currentReviewsCte` applies the COMPLETE/latest-per-review policy before
   * the requested listing-level counts are computed.
   */
  async loadListingReviewStats(
    request: ReviewListingStatsReadRequest,
  ): Promise<ReviewListingStatsReadResult> {
    const listingIds = [...new Set(request.listingIds.filter(Boolean))];
    if (listingIds.length === 0) {
      return { lifetime: [], recent: [] };
    }
    const listingIdSql = Prisma.join(
      listingIds.map((listingId) => Prisma.sql`${listingId}::uuid`),
    );
    const [lifetimeRows, recentRows] = await Promise.all([
      this.prisma.$queryRaw<RawListingStatsRow[]>(Prisma.sql`
        ${currentReviewsCte(request.organizationId)}
        SELECT listing_id AS "listingId", COUNT(*)::int AS "totalReviews",
               AVG(rating)::float8 AS "avgRating"
        FROM current_reviews
        WHERE organization_id = ${request.organizationId}::uuid
          AND listing_id IN (${listingIdSql})
          AND is_deleted = FALSE AND is_blinded = FALSE
        GROUP BY listing_id
      `),
      this.prisma.$queryRaw<RawRecentRow[]>(Prisma.sql`
        ${currentReviewsCte(request.organizationId)}
        SELECT listing_id AS "listingId", COUNT(*)::int AS count
        FROM current_reviews
        WHERE organization_id = ${request.organizationId}::uuid
          AND listing_id IN (${listingIdSql})
          AND reviewed_at >= ${request.recentSince}
          AND is_deleted = FALSE AND is_blinded = FALSE
        GROUP BY listing_id
      `),
    ]);

    return {
      lifetime: lifetimeRows.map((row) => ({
        listingId: row.listingId,
        totalReviews: Number(row.totalReviews),
        avgRating: Number(row.avgRating ?? 0),
      })),
      recent: recentRows.map((row) => ({
        listingId: row.listingId,
        count: Number(row.count),
      })),
    };
  }

  /**
   * Per-listing aggregate review rows for `/reviews` UI.
   *
   * Aggregation rules:
   * - Only reviews with non-null `listingId` are aggregated; orphan reviews
   *   (no listing) cannot be displayed in the listing/product table and are
   *   surfaced only via `summary.totalReviewCount` (not yet — also excluded
   *   for now to keep summary consistent with rows).
   * - One row per listing. `productId` is the listing ID; Sellpia physical
   *   Master rows are not registered-product identity.
   * - `recentReviews` counts reviews in the last 30 days.
   * - `orderCount` is intentionally 0 in R3. Real per-listing order counts
   *   require a `ChannelListingOption ↔ OrderLineItem` join across the order
   *   history, which is too expensive for the first revival. Documented as
   *   unavailable (acceptance criteria #8: "no fake metrics").
   * - `lastReviewAt` is the latest `reviewedAt` for the listing, ISO string.
   *
   * Pagination is over the aggregate rows (not raw reviews) sorted by
   * totalReviews DESC then listingId ASC for stable order across pages.
   */
  async list(
    organizationId: string,
    query: ListReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const filter = query.filter ?? DEFAULT_FILTER;

    const allAggregates = await this.aggregateListings(organizationId);
    const listingDisplays = await this.loadListingDisplays(
      organizationId,
      allAggregates.map((a) => a.listingId),
    );
    const aggregates = allAggregates.filter((a) => listingDisplays.has(a.listingId));
    const recentByListing = await this.recentReviewsByListing(
      organizationId,
      aggregates.map((a) => a.listingId),
    );
    const summary = computeSummary(aggregates);
    const filteredAggregates = applyReviewFilter(aggregates, filter);

    filteredAggregates.sort((a, b) => {
      if (a.totalReviews !== b.totalReviews) return b.totalReviews - a.totalReviews;
      return a.listingId.localeCompare(b.listingId);
    });
    const total = filteredAggregates.length;
    const skip = (page - 1) * limit;
    const slice = filteredAggregates.slice(skip, skip + limit);

    const items: ReviewListItem[] = slice.map((agg) => {
      const display = listingDisplays.get(agg.listingId);
      return {
        listingId: agg.listingId,
        productId: display?.masterId ?? agg.listingId,
        productName: display?.productName ?? '-',
        sku: display?.sku ?? null,
        organization: display?.companyName ?? '-',
        grade: display?.grade ?? '-',
        totalReviews: agg.totalReviews,
        avgRating: round2(agg.avgRating),
        recentReviews: recentByListing.get(agg.listingId) ?? 0,
        // Documented unavailable — see method docstring.
        orderCount: 0,
        lastReviewAt: agg.lastReviewAt?.toISOString() ?? null,
      } satisfies ReviewListItem;
    });

    return {
      items,
      total,
      page,
      limit,
      summary,
    } satisfies ReviewListResponse;
  }

  /**
   * 수집된 상품평 원문 목록. 집계(`list`)와 달리 listing 미매칭 리뷰도 보여준다.
   * 매칭이 없으면 크롤링 당시 채널 상품명(`itemName`)으로 폴백하므로,
   * 카탈로그에 없는 상품의 리뷰도 운영자가 읽을 수 있다.
   */
  async listItems(
    organizationId: string,
    query: ListReviewItemsQueryDto,
  ): Promise<ReviewItemListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const [totalRows, rows, ratingGroups, contentRows] = await Promise.all([
      this.queryReviewItemCount(organizationId, query),
      this.queryReviewItems(organizationId, query, page, limit),
      this.queryReviewRatingCounts(organizationId, query),
      this.queryReviewContentCount(organizationId, query),
    ]);
    const total = Number(totalRows[0]?.count ?? 0);
    const withContentCount = Number(contentRows[0]?.count ?? 0);

    const optionNames = await this.loadOptionNames(
      organizationId,
      rows.map((row) => row.externalOptionId),
    );
    const listingDisplays = await this.loadListingDisplays(
      organizationId,
      rows.map((row) => row.listingId).filter((value): value is string => !!value),
    );

    const items: ReviewItem[] = rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      productName:
        (row.listingId ? listingDisplays.get(row.listingId)?.productName : null) ??
        row.itemName ??
        '-',
      optionName: row.externalOptionId
        ? (optionNames.get(row.externalOptionId) ?? null)
        : null,
      rating: row.rating,
      title: row.title,
      content: row.content,
      reviewerName: row.reviewerName,
      reviewedAt: row.reviewedAt.toISOString(),
      imageCount: row.imageCount,
      videoCount: row.videoCount,
      externalProductId: row.externalProductId,
    } satisfies ReviewItem));

    const ratingCounts: Record<string, number> = {};
    for (const group of ratingGroups) {
      ratingCounts[String(group.rating)] = Number(group.count);
    }

    return {
      items,
      total,
      page,
      limit,
      ratingCounts,
      withContentCount,
    } satisfies ReviewItemListResponse;
  }

  private queryReviewItemCount(
    organizationId: string,
    query: ListReviewItemsQueryDto,
  ): Promise<Array<{ count: number }>> {
    return this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      ${currentReviewsCte(organizationId)}
      SELECT COUNT(*)::int AS count
      FROM current_reviews
      WHERE organization_id = ${organizationId}::uuid
        AND ${reviewItemPredicatesSql(query)}
    `);
  }

  private queryReviewContentCount(
    organizationId: string,
    query: ListReviewItemsQueryDto,
  ): Promise<Array<{ count: number }>> {
    return this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      ${currentReviewsCte(organizationId)}
      SELECT COUNT(*)::int AS count
      FROM current_reviews
      WHERE organization_id = ${organizationId}::uuid
        AND ${reviewItemPredicatesSql(query, { includeContent: true })}
    `);
  }

  private queryReviewRatingCounts(
    organizationId: string,
    query: ListReviewItemsQueryDto,
  ): Promise<Array<{ rating: number; count: number }>> {
    return this.prisma.$queryRaw<Array<{ rating: number; count: number }>>(Prisma.sql`
      ${currentReviewsCte(organizationId)}
      SELECT rating, COUNT(*)::int AS count
      FROM current_reviews
      WHERE organization_id = ${organizationId}::uuid
        AND ${reviewItemPredicatesSql(query, { omitRating: true })}
      GROUP BY rating
      ORDER BY rating ASC
    `);
  }

  private queryReviewItems(
    organizationId: string,
    query: ListReviewItemsQueryDto,
    page: number,
    limit: number,
  ): Promise<ReviewReadRow[]> {
    return this.prisma.$queryRaw<ReviewReadRow[]>(Prisma.sql`
      ${currentReviewsCte(organizationId)}
      SELECT id, listing_id AS "listingId", item_name AS "itemName",
             external_option_id AS "externalOptionId", external_product_id AS "externalProductId",
             rating, title, content, reviewer_name AS "reviewerName", reviewed_at AS "reviewedAt",
             image_count AS "imageCount", video_count AS "videoCount"
      FROM current_reviews
      WHERE organization_id = ${organizationId}::uuid
        AND ${reviewItemPredicatesSql(query)}
      ORDER BY reviewed_at DESC, id ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);
  }

  private async loadOptionNames(
    organizationId: string,
    externalOptionIds: ReadonlyArray<string | null>,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(externalOptionIds.filter((value): value is string => !!value)),
    ];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.channelListingOption.findMany({
      where: { organizationId, externalOptionId: { in: ids } },
      select: { externalOptionId: true, itemName: true },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!row.itemName || map.has(row.externalOptionId)) continue;
      map.set(row.externalOptionId, row.itemName);
    }
    return map;
  }

  private async aggregateListings(organizationId: string): Promise<ListingAggregate[]> {
    const rows = await this.prisma.$queryRaw<RawAggregateRow[]>(Prisma.sql`
      ${currentReviewsCte(organizationId)}
      SELECT listing_id AS "listingId", COUNT(*)::int AS "totalReviews",
             AVG(rating)::float8 AS "avgRating", MAX(reviewed_at) AS "lastReviewAt"
      FROM current_reviews
      WHERE organization_id = ${organizationId}::uuid
        AND listing_id IS NOT NULL AND is_deleted = FALSE AND is_blinded = FALSE
      GROUP BY listing_id
    `);
    const out: ListingAggregate[] = [];
    for (const r of rows) {
      out.push({
        listingId: r.listingId,
        totalReviews: Number(r.totalReviews),
        avgRating: Number(r.avgRating ?? 0),
        lastReviewAt: r.lastReviewAt,
      });
    }
    return out;
  }

  private async recentReviewsByListing(
    organizationId: string,
    listingIds: string[],
  ): Promise<Map<string, number>> {
    if (listingIds.length === 0) return new Map();
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const rows = await this.prisma.$queryRaw<RawRecentRow[]>(Prisma.sql`
      ${currentReviewsCte(organizationId)}
      SELECT listing_id AS "listingId", COUNT(*)::int AS count
      FROM current_reviews
      WHERE organization_id = ${organizationId}::uuid
        AND listing_id IN (${Prisma.join(listingIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND reviewed_at >= ${since}
        AND is_deleted = FALSE AND is_blinded = FALSE
      GROUP BY listing_id
    `);
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.listingId, Number(r.count));
    }
    return map;
  }

  private async loadListingDisplays(
    organizationId: string,
    listingIds: string[],
  ): Promise<Map<string, ListingDisplay>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, organizationId, isActive: true },
      select: {
        id: true,
        channelName: true,
        displayName: true,
        masterProduct: {
          select: { id: true, name: true, abcGrade: true },
        },
        options: {
          select: { sellerSku: true },
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        organization: { select: { name: true } },
      },
    });
    const map = new Map<string, ListingDisplay>();
    for (const row of rows) {
      map.set(row.id, {
        masterId: row.masterProduct?.id ?? null,
        productName: row.masterProduct?.name
          ?? row.displayName
          ?? row.channelName
          ?? null,
        sku: row.options[0]?.sellerSku ?? null,
        companyName: row.organization?.name ?? null,
        grade: row.masterProduct?.abcGrade ?? null,
      });
    }
    return map;
  }
}

interface ListingDisplay {
  masterId: string | null;
  productName: string | null;
  sku: string | null;
  companyName: string | null;
  grade: string | null;
}

export function computeSummary(aggregates: ReadonlyArray<ListingAggregate>): ReviewSummary {
  let totalReviews = 0;
  let weightedSum = 0;
  let newListings = 0;
  let needsResponse = 0;
  for (const a of aggregates) {
    totalReviews += a.totalReviews;
    weightedSum += a.totalReviews * a.avgRating;
    if (a.totalReviews < NEEDS_ATTENTION_MIN_REVIEWS) {
      newListings += 1;
    } else if (a.avgRating < NEEDS_ATTENTION_RATING_THRESHOLD) {
      needsResponse += 1;
    }
  }
  const weightedAvgRating =
    totalReviews > 0 ? round2(weightedSum / totalReviews) : 0;
  return {
    listingCount: aggregates.length,
    totalReviewCount: totalReviews,
    weightedAvgRating,
    newListingCount: newListings,
    needsResponseCount: needsResponse,
    needsAttentionCount: newListings + needsResponse,
  } satisfies ReviewSummary;
}

function applyReviewFilter(
  aggregates: ListingAggregate[],
  filter: ReviewFilter,
): ListingAggregate[] {
  if (filter === 'new') {
    return aggregates.filter((a) => a.totalReviews < NEEDS_ATTENTION_MIN_REVIEWS);
  }
  if (filter === 'needs-response') {
    return aggregates.filter(
      (a) =>
        a.totalReviews >= NEEDS_ATTENTION_MIN_REVIEWS &&
        a.avgRating < NEEDS_ATTENTION_RATING_THRESHOLD,
    );
  }
  return [...aggregates];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Coupang review collection is cumulative: a new recent-month run must update
 * matching review ids without making older complete facts disappear. The
 * selector therefore chooses the newest COMPLETE fact per external id while
 * retaining facts from older COMPLETE generations outside the new window.
 * Unowned legacy Coupang rows are intentionally excluded; other platforms
 * keep their existing rows.
 */
function currentReviewsCte(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    WITH ranked_coupang AS (
      SELECT
        r.id,
        r.organization_id,
        r.source_import_run_id,
        r.listing_id,
        r.platform,
        r.rating,
        r.title,
        r.content,
        r.reviewer_name,
        r.external_review_id,
        r.external_option_id,
        r.external_product_id,
        r.item_name,
        r.image_count,
        r.video_count,
        r.is_deleted,
        r.is_blinded,
        r.reviewed_at,
        ROW_NUMBER() OVER (
          PARTITION BY r.external_review_id
          ORDER BY COALESCE(s.imported_at, s.created_at) DESC, s.id DESC, r.id DESC
        ) AS generation_rank
      FROM reviews r
      INNER JOIN source_import_runs s
        ON s.id = r.source_import_run_id
       AND s.organization_id = r.organization_id
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.platform = 'coupang'
        AND r.source_import_run_id IS NOT NULL
        AND s.source_type = ${COUPANG_REVIEW_SOURCE_TYPE}
        AND s.status = 'completed'
    ), current_reviews AS (
      SELECT id, organization_id, source_import_run_id, listing_id, platform, rating,
             title, content, reviewer_name, external_review_id, external_option_id,
             external_product_id, item_name, image_count, video_count, is_deleted,
             is_blinded, reviewed_at
      FROM ranked_coupang
      WHERE generation_rank = 1
      UNION ALL
      SELECT r.id, r.organization_id, r.source_import_run_id, r.listing_id, r.platform,
             r.rating, r.title, r.content, r.reviewer_name, r.external_review_id,
             r.external_option_id, r.external_product_id, r.item_name, r.image_count,
             r.video_count, r.is_deleted, r.is_blinded, r.reviewed_at
      FROM reviews r
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.platform <> 'coupang'
    )
  `;
}

function reviewItemPredicatesSql(
  query: ListReviewItemsQueryDto,
  options: { omitRating?: boolean; includeContent?: boolean } = {},
): Prisma.Sql {
  const predicates: Prisma.Sql[] = [
    Prisma.sql`is_deleted = FALSE`,
    Prisma.sql`is_blinded = FALSE`,
  ];
  if (query.listingId) predicates.push(Prisma.sql`listing_id = ${query.listingId}::uuid`);
  if (!options.omitRating && query.rating) predicates.push(Prisma.sql`rating = ${query.rating}`);
  if (query.hasContent === 'true' || options.includeContent) {
    predicates.push(Prisma.sql`(content IS NOT NULL OR title IS NOT NULL)`);
  }
  const search = query.search?.trim();
  if (search) {
    predicates.push(Prisma.sql`(
      content ILIKE '%' || ${search} || '%' OR
      title ILIKE '%' || ${search} || '%' OR
      item_name ILIKE '%' || ${search} || '%' OR
      reviewer_name ILIKE '%' || ${search} || '%'
    )`);
  }
  return Prisma.sql`${Prisma.join(predicates, ' AND ')}`;
}
