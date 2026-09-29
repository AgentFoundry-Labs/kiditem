import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { CurrentReviewListingStats } from '../../../application/port/in/facts/review-facts.port';
import type {
  CurrentReviewItemFact,
  CurrentReviewItemFilter,
  CurrentReviewListingAggregate,
  ReviewReadRepositoryPort,
} from '../../../application/port/out/repository/review-read.repository.port';

/**
 * `REVIEW_FACTS_PORT` and `REVIEW_READ_REPOSITORY_PORT` implementation (KID-392).
 * Unwraps the caller's `OwnerTransaction` and reads the current complete review
 * facts; the SQL below is the former `read/review-facts.reader.ts`.
 */
@Injectable()
export class ReviewFactsRepository implements ReviewReadRepositoryPort {
  readCurrentReviewListingStats(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; listingIds: readonly string[] }>,
  ): Promise<CurrentReviewListingStats[]> {
    return readCurrentReviewListingStats(ownerTransactionClient(transaction), input.organizationId, input.listingIds);
  }

  readCurrentReviewListingAggregates(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string }>,
  ): Promise<CurrentReviewListingAggregate[]> {
    return readCurrentReviewListingAggregates(ownerTransactionClient(transaction), input.organizationId);
  }

  readCurrentReviewRecentCounts(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; listingIds: readonly string[]; since: Date }>,
  ): Promise<Array<{ listingId: string; count: number }>> {
    return readCurrentReviewRecentCounts(ownerTransactionClient(transaction), input.organizationId, input.listingIds, input.since);
  }

  readCurrentReviewItemCount(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; filter: CurrentReviewItemFilter }>,
  ): Promise<number> {
    return readCurrentReviewItemCount(ownerTransactionClient(transaction), input.organizationId, input.filter);
  }

  readCurrentReviewContentCount(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; filter: CurrentReviewItemFilter }>,
  ): Promise<number> {
    return readCurrentReviewContentCount(ownerTransactionClient(transaction), input.organizationId, input.filter);
  }

  readCurrentReviewRatingCounts(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; filter: CurrentReviewItemFilter }>,
  ): Promise<Array<{ rating: number; count: number }>> {
    return readCurrentReviewRatingCounts(ownerTransactionClient(transaction), input.organizationId, input.filter);
  }

  readCurrentReviewItems(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; filter: CurrentReviewItemFilter; page: number; limit: number }>,
  ): Promise<CurrentReviewItemFact[]> {
    return readCurrentReviewItems(ownerTransactionClient(transaction), input.organizationId, input.filter, input.page, input.limit);
  }
}

async function readCurrentReviewListingStats(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listingIds: readonly string[],
): Promise<CurrentReviewListingStats[]> {
  if (listingIds.length === 0) return [];
  type Row = { listingId: string; totalReviews: number; avgRating: number | null };
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT listing_id AS "listingId", COUNT(*)::int AS "totalReviews",
           AVG(rating)::float8 AS "avgRating"
    FROM current_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND listing_id IN (${uuidListSql(listingIds)})
      AND is_deleted = FALSE AND is_blinded = FALSE
    GROUP BY listing_id
  `);
  return rows.map((row) => ({
    listingId: row.listingId,
    totalReviews: Number(row.totalReviews),
    avgRating: Number(row.avgRating ?? 0),
  }));
}

async function readCurrentReviewRecentCounts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listingIds: readonly string[],
  since: Date,
): Promise<Array<{ listingId: string; count: number }>> {
  if (listingIds.length === 0) return [];
  type Row = { listingId: string; count: number };
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT listing_id AS "listingId", COUNT(*)::int AS count
    FROM current_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND listing_id IN (${uuidListSql(listingIds)})
      AND reviewed_at >= ${since}
      AND is_deleted = FALSE AND is_blinded = FALSE
    GROUP BY listing_id
  `);
  return rows.map((row) => ({ listingId: row.listingId, count: Number(row.count) }));
}

async function readCurrentReviewListingAggregates(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<CurrentReviewListingAggregate[]> {
  type Row = {
    listingId: string;
    totalReviews: number;
    avgRating: number | null;
    lastReviewAt: Date | null;
  };
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT listing_id AS "listingId", COUNT(*)::int AS "totalReviews",
           AVG(rating)::float8 AS "avgRating", MAX(reviewed_at) AS "lastReviewAt"
    FROM current_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND listing_id IS NOT NULL AND is_deleted = FALSE AND is_blinded = FALSE
    GROUP BY listing_id
  `);
  return rows.map((row) => ({
    listingId: row.listingId,
    totalReviews: Number(row.totalReviews),
    avgRating: Number(row.avgRating ?? 0),
    lastReviewAt: row.lastReviewAt,
  }));
}

async function readCurrentReviewItemCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: CurrentReviewItemFilter,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT COUNT(*)::int AS count
    FROM current_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND ${reviewItemPredicatesSql(query)}
  `);
  return Number(rows[0]?.count ?? 0);
}

async function readCurrentReviewContentCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: CurrentReviewItemFilter,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT COUNT(*)::int AS count
    FROM current_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND ${reviewItemPredicatesSql(query, { includeContent: true })}
  `);
  return Number(rows[0]?.count ?? 0);
}

async function readCurrentReviewRatingCounts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: CurrentReviewItemFilter,
): Promise<Array<{ rating: number; count: number }>> {
  const rows = await tx.$queryRaw<Array<{ rating: number; count: number }>>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT rating, COUNT(*)::int AS count
    FROM current_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND ${reviewItemPredicatesSql(query, { omitRating: true })}
    GROUP BY rating
    ORDER BY rating ASC
  `);
  return rows.map((row) => ({ rating: row.rating, count: Number(row.count) }));
}

async function readCurrentReviewItems(
  tx: Prisma.TransactionClient,
  organizationId: string,
  query: CurrentReviewItemFilter,
  page: number,
  limit: number,
): Promise<CurrentReviewItemFact[]> {
  return tx.$queryRaw<CurrentReviewItemFact[]>(Prisma.sql`
    ${currentReviewsCte(organizationId)}
    SELECT id, platform, listing_id AS "listingId", item_name AS "itemName",
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

/**
 * Current complete review facts, shared by every Orders review projection: the rows an
 * `orders.coupang_reviews` operation wrote (KID-359). Its finalize keeps one row per review
 * (`operation_id IS NOT NULL` unique per external review id), so the current row needs no ranking.
 * Rows only an old import run carries are not current (KID-365, ADR-0010).
 */
function currentReviewsCte(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    WITH current_reviews AS (
      SELECT r.id, r.organization_id, r.listing_id, r.platform, r.rating,
             r.title, r.content, r.reviewer_name, r.external_review_id, r.external_option_id,
             r.external_product_id, r.item_name, r.image_count, r.video_count, r.is_deleted,
             r.is_blinded, r.reviewed_at
      FROM reviews r
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.operation_id IS NOT NULL
    )
  `;
}

function reviewItemPredicatesSql(
  query: CurrentReviewItemFilter,
  options: { omitRating?: boolean; includeContent?: boolean } = {},
): Prisma.Sql {
  const predicates: Prisma.Sql[] = [
    Prisma.sql`is_deleted = FALSE`,
    Prisma.sql`is_blinded = FALSE`,
  ];
  if (query.listingId) predicates.push(Prisma.sql`listing_id = ${query.listingId}::uuid`);
  if (!options.omitRating && query.rating) predicates.push(Prisma.sql`rating = ${query.rating}`);
  if (query.hasContent || options.includeContent) {
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

function uuidListSql(ids: readonly string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}
