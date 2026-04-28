// apps/server/src/orders/services/reviews.service.ts
import { Injectable } from '@nestjs/common';
import type {
  ReviewListItem,
  ReviewListResponse,
  ReviewSummary,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ListReviewsQueryDto, type ReviewFilter } from '../dto/list-reviews.dto';

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
   * - One row per listing. `productId = master.id ?? listingId` so the UI key
   *   stays stable even when the listing has no master attached.
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
    companyId: string,
    query: ListReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const filter = query.filter ?? DEFAULT_FILTER;

    const allAggregates = await this.aggregateListings(companyId);
    const listingDisplays = await this.loadListingDisplays(
      companyId,
      allAggregates.map((a) => a.listingId),
    );
    const aggregates = allAggregates.filter((a) => listingDisplays.has(a.listingId));
    const recentByListing = await this.recentReviewsByListing(
      companyId,
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
        company: display?.companyName ?? '-',
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

  private async aggregateListings(companyId: string): Promise<ListingAggregate[]> {
    const rows = await this.prisma.review.groupBy({
      by: ['listingId'],
      where: { companyId, listingId: { not: null } },
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
    companyId: string,
    listingIds: string[],
  ): Promise<Map<string, number>> {
    if (listingIds.length === 0) return new Map();
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const rows = await this.prisma.review.groupBy({
      by: ['listingId'],
      where: {
        companyId,
        listingId: { in: listingIds },
        reviewedAt: { gte: since },
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
    companyId: string,
    listingIds: string[],
  ): Promise<Map<string, ListingDisplay>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId, isDeleted: false },
      select: {
        id: true,
        channelName: true,
        master: { select: { id: true, name: true, abcGrade: true } },
        options: {
          select: { option: { select: { sku: true } } },
          where: { option: { isDeleted: false } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        company: { select: { name: true } },
      },
    });
    const map = new Map<string, ListingDisplay>();
    for (const row of rows) {
      map.set(row.id, {
        masterId: row.master?.id ?? null,
        productName: row.master?.name ?? row.channelName ?? null,
        sku: row.options[0]?.option?.sku ?? null,
        companyName: row.company?.name ?? null,
        grade: row.master?.abcGrade ?? null,
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
