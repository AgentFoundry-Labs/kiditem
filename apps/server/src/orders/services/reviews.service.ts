// apps/server/src/orders/services/reviews.service.ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ReviewItem,
  ReviewItemListResponse,
  ReviewListItem,
  ReviewListResponse,
  ReviewSummary,
} from '@kiditem/shared/reviews';
import { PrismaService } from '../../prisma/prisma.service';
import { ListReviewsQueryDto, type ReviewFilter } from '../dto/list-reviews.dto';
import { ListReviewItemsQueryDto } from '../dto/list-review-items.dto';

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

// 채널에서 삭제/블라인드된 상품평은 노출 평점에 반영되지 않으므로 집계에서도 뺀다.
// 크롤링 적재(`ReviewIngestService`)는 두 상태를 버리지 않고 플래그로 보존한다.
const VISIBLE_REVIEW_WHERE = { isDeleted: false, isBlinded: false } as const;

// 쿠팡은 별점만 남기는 상품평이 대부분이라 "본문 있는 리뷰"가 별도 필터로 필요하다.
const HAS_CONTENT_WHERE: Prisma.ReviewWhereInput = {
  OR: [{ content: { not: null } }, { title: { not: null } }],
};

interface ListingAggregate {
  listingId: string;
  totalReviews: number;
  avgRating: number;
  lastReviewAt: Date | null;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const where = buildReviewItemWhere(organizationId, query);

    const [total, rows, ratingGroups, withContentCount] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          listingId: true,
          itemName: true,
          externalOptionId: true,
          externalProductId: true,
          rating: true,
          title: true,
          content: true,
          reviewerName: true,
          reviewedAt: true,
          imageCount: true,
          videoCount: true,
          listing: {
            select: {
              displayName: true,
              channelName: true,
              masterProduct: { select: { name: true } },
            },
          },
        },
      }),
      // 별점 분포는 별점 필터를 뺀 나머지 조건 기준이라야 탭 카운트가 안 흔들린다.
      this.prisma.review.groupBy({
        by: ['rating'],
        where: buildReviewItemWhere(organizationId, { ...query, rating: undefined }),
        _count: { _all: true },
      }),
      this.prisma.review.count({
        where: { ...where, ...HAS_CONTENT_WHERE },
      }),
    ]);

    const optionNames = await this.loadOptionNames(
      organizationId,
      rows.map((row) => row.externalOptionId),
    );

    const items: ReviewItem[] = rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      productName:
        row.listing?.masterProduct?.name ??
        row.listing?.displayName ??
        row.listing?.channelName ??
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
      ratingCounts[String(group.rating)] = group._count._all;
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
    const rows = await this.prisma.review.groupBy({
      by: ['listingId'],
      where: { organizationId, listingId: { not: null }, ...VISIBLE_REVIEW_WHERE },
      _count: { _all: true },
      _avg: { rating: true },
      _max: { reviewedAt: true },
    });
    const out: ListingAggregate[] = [];
    for (const r of rows) {
      // Prisma typing on groupBy keeps `listingId` as `string | null`; we
      // already filtered nulls in WHERE so this is a narrow refinement.
      if (!r.listingId) continue;
      out.push({
        listingId: r.listingId,
        totalReviews: r._count._all,
        avgRating: r._avg.rating ?? 0,
        lastReviewAt: r._max.reviewedAt ?? null,
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
    const rows = await this.prisma.review.groupBy({
      by: ['listingId'],
      where: {
        organizationId,
        listingId: { in: listingIds },
        reviewedAt: { gte: since },
        ...VISIBLE_REVIEW_WHERE,
      },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.listingId) continue;
      map.set(r.listingId, r._count._all);
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

/**
 * 개별 리뷰 조회 조건. `hasContent` 와 `search` 가 각각 OR 를 쓰므로 최상위 OR
 * 하나로는 표현할 수 없다. 둘 다 `AND` 배열에 넣어 서로 덮어쓰지 않게 한다.
 */
function buildReviewItemWhere(
  organizationId: string,
  query: ListReviewItemsQueryDto,
): Prisma.ReviewWhereInput {
  const and: Prisma.ReviewWhereInput[] = [];
  if (query.hasContent === 'true') and.push(HAS_CONTENT_WHERE);

  const search = query.search?.trim();
  if (search) {
    and.push({
      OR: [
        { content: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { itemName: { contains: search, mode: 'insensitive' } },
        { reviewerName: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return {
    organizationId,
    ...VISIBLE_REVIEW_WHERE,
    ...(query.listingId ? { listingId: query.listingId } : {}),
    ...(query.rating ? { rating: query.rating } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
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
