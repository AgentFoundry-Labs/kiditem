// apps/server/src/orders/application/service/reviews.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ownerTransaction } from '../../../prisma/owner-transaction';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../channels/application/port/in/listing/channel-listing-query.port';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../channels/application/port/in/channel-option-recipe.port';
import {
  CHANNEL_ACCOUNT_PORT,
  type ChannelAccountPort,
} from '../../../channels/application/port/in/account/channel-account.port';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../products/application/port/in/product-transactional-read.port';
import { readPublishedProductAbcGrades } from '../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import { ListReviewsQueryDto, type ReviewFilter } from '../../adapter/in/web/dto/list-reviews.dto';
import { ListReviewItemsQueryDto } from '../../adapter/in/web/dto/list-review-items.dto';
import {
  readCurrentReviewContentCount,
  readCurrentReviewItemCount,
  readCurrentReviewItems,
  readCurrentReviewListingAggregates,
  readCurrentReviewRatingCounts,
  readCurrentReviewRecentCounts,
  type CurrentReviewListingAggregate,
  type CurrentReviewItemFilter,
} from '../../adapter/out/persistence/read/review-facts.reader';
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readListingOptionOrderFacts,
  readObservedOrderBounds,
  readOrderWindowFacts,
} from '../../adapter/out/persistence/read/order-facts.reader';
import type {
  ReviewItem,
  ReviewItemListResponse,
  ReviewListItem,
  ReviewListResponse,
  ReviewSummary,
} from '@kiditem/shared/reviews';
import type { Prisma } from '@prisma/client';

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

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products: ProductTransactionalReadPort =
      new ProductTransactionalReadRepositoryAdapter(),
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(CHANNEL_ACCOUNT_PORT)
    private readonly channelAccounts: ChannelAccountPort,
  ) {}

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
   * - `orderCount` comes from canonical OrderLineItem facts. It is null until
   *   every known source that contributed to the observed order window has
   *   declared complete coverage for that window.
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

    return this.prisma.$transaction(async (tx) => {
      const allAggregates = await readCurrentReviewListingAggregates(tx, organizationId);
      const listingDisplays = await this.loadListingDisplays(
        tx,
        organizationId,
        allAggregates.map((a) => a.listingId),
      );
      const aggregates = allAggregates.filter((a) => listingDisplays.has(a.listingId));
      const listingIds = aggregates.map((a) => a.listingId);
      const since = new Date(Date.now() - RECENT_WINDOW_MS);
      const recentRows = await readCurrentReviewRecentCounts(
        tx,
        organizationId,
        listingIds,
        since,
      );
      const orderCounts = await this.readOrderCountsByListing(tx, organizationId, listingIds);
      const recentByListing = new Map(recentRows.map((row) => [row.listingId, row.count]));
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
          orderCount: orderCounts?.get(agg.listingId) ?? (orderCounts ? 0 : null),
          lastReviewAt: agg.lastReviewAt?.toISOString() ?? null,
        } satisfies ReviewListItem;
      });

      return { items, total, page, limit, summary } satisfies ReviewListResponse;
    });
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
    const filter = toCurrentReviewItemFilter(query);
    return this.prisma.$transaction(async (tx) => {
      const total = await readCurrentReviewItemCount(tx, organizationId, filter);
      const rows = await readCurrentReviewItems(tx, organizationId, filter, page, limit);
      const ratingGroups = await readCurrentReviewRatingCounts(tx, organizationId, filter);
      const withContentCount = await readCurrentReviewContentCount(tx, organizationId, filter);

      const optionNames = await this.loadOptionNames(
        tx,
        organizationId,
        rows,
      );
      const listingDisplays = await this.loadListingDisplays(
        tx,
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
        ? (optionNames.get(optionLookupKey(row.platform, row.externalOptionId)) ?? null)
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
        ratingCounts[String(group.rating)] = group.count;
      }

      return {
        items,
        total,
        page,
        limit,
        ratingCounts,
        withContentCount,
      } satisfies ReviewItemListResponse;
    });
  }

  private async loadOptionNames(
    tx: Prisma.TransactionClient,
    organizationId: string,
    reviewRows: ReadonlyArray<{ platform: string; externalOptionId: string | null }>,
  ): Promise<Map<string, string>> {
    const idsByPlatform = new Map<string, Set<string>>();
    for (const row of reviewRows) {
      if (!row.externalOptionId) continue;
      const ids = idsByPlatform.get(row.platform) ?? new Set<string>();
      ids.add(row.externalOptionId);
      idsByPlatform.set(row.platform, ids);
    }
    const map = new Map<string, string>();
    for (const [channel, ids] of idsByPlatform) {
      const candidates = await this.channelListings.readOptionCandidates(
        ownerTransaction(tx),
        { organizationId, channel, externalOptionIds: [...ids] },
      );
      const byExternalId = new Map<string, typeof candidates>();
      for (const candidate of candidates) {
        const matches = byExternalId.get(candidate.externalOptionId) ?? [];
        matches.push(candidate);
        byExternalId.set(candidate.externalOptionId, matches);
      }
      for (const [externalOptionId, matches] of byExternalId) {
        if (matches.length !== 1 || !matches[0]?.itemName) continue;
        map.set(optionLookupKey(channel, externalOptionId), matches[0].itemName);
      }
    }
    return map;
  }

  private async loadListingDisplays(
    tx: Prisma.TransactionClient,
    organizationId: string,
    listingIds: string[],
  ): Promise<Map<string, ListingDisplay>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.channelListings.readDisplayFacts(ownerTransaction(tx), {
      organizationId,
      listingIds,
      activeOnly: true,
    });
    const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), {
      organizationId,
      listingIds: rows.map((row) => row.id),
    });
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const rowsWithProducts = rows.map((row) => ({
      ...row,
      masterProductId: summaries.get(row.id) ?? null,
    }));
    const masterProductIds = [...new Set(rowsWithProducts.flatMap((row) =>
      row.masterProductId ? [row.masterProductId] : []))];
    const products = masterProductIds.length === 0
      ? []
      : await this.products.readSourceIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'ids', values: masterProductIds } },
      );
    const productById = new Map(products.map((product) => [product.masterProductId, product]));
    const currentMasterProductIds = products.map((product) => product.masterProductId);
    const gradeByProductId = await readPublishedProductAbcGrades(tx, {
      organizationId,
      masterProductIds: currentMasterProductIds,
    });
    const map = new Map<string, ListingDisplay>();
    for (const row of rowsWithProducts) {
      const product = row.masterProductId
        ? productById.get(row.masterProductId)
        : undefined;
      map.set(row.id, {
        masterId: product?.masterProductId ?? null,
        productName: product?.name
          ?? row.displayName
          ?? row.channelName
          ?? null,
        sku: row.firstActiveSellerSku,
        companyName: organization?.name ?? null,
        grade: product
          ? gradeByProductId.get(product.masterProductId) ?? null
          : null,
      });
    }
    return map;
  }

  private async readOrderCountsByListing(
    tx: Prisma.TransactionClient,
    organizationId: string,
    listingIds: string[],
  ): Promise<Map<string, number> | null> {
    if (listingIds.length === 0) return new Map();
    const bounds = await readObservedOrderBounds(tx, organizationId);
    if (!bounds) return null;
    const window = {
      organizationId,
      ...bounds,
      excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
    };
    const observation = await readOrderWindowFacts(tx, window, this.channelAccounts);
    if (observation.orderCount === null) return null;

    const options = await this.channelRecipes.readConfirmedCompositions(ownerTransaction(tx), {
      organizationId,
      listingIds,
    });
    const facts = await readListingOptionOrderFacts(tx, window);
    const listingByOption = new Map(options.map((option) => [option.optionId, option.listingId]));
    const orderIdsByListing = new Map<string, Set<string>>();
    for (const fact of facts) {
      const listingId = listingByOption.get(fact.listingOptionId);
      if (!listingId) continue;
      const orderIds = orderIdsByListing.get(listingId) ?? new Set<string>();
      orderIds.add(fact.orderId);
      orderIdsByListing.set(listingId, orderIds);
    }
    return new Map(
      listingIds.map((listingId) => [listingId, orderIdsByListing.get(listingId)?.size ?? 0]),
    );
  }
}

function optionLookupKey(platform: string, externalOptionId: string): string {
  return `${platform}\u0000${externalOptionId}`;
}

function toCurrentReviewItemFilter(query: ListReviewItemsQueryDto): CurrentReviewItemFilter {
  return {
    listingId: query.listingId,
    rating: query.rating,
    hasContent: query.hasContent === 'true',
    search: query.search,
  };
}

interface ListingDisplay {
  masterId: string | null;
  productName: string | null;
  sku: string | null;
  companyName: string | null;
  grade: string | null;
}

export function computeSummary(
  aggregates: ReadonlyArray<CurrentReviewListingAggregate>,
): ReviewSummary {
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
  const weightedAvgRating = totalReviews > 0 ? round2(weightedSum / totalReviews) : null;
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
  aggregates: CurrentReviewListingAggregate[],
  filter: ReviewFilter,
): CurrentReviewListingAggregate[] {
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
