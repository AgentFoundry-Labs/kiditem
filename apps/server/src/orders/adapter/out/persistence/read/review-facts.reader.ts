import { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';

const COUPANG_REVIEW_SOURCE_TYPE = 'coupang_reviews';

export interface CurrentReviewItemFact {
  id: string;
  platform: string;
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
}

export interface CurrentReviewListingAggregate {
  listingId: string;
  totalReviews: number;
  avgRating: number;
  lastReviewAt: Date | null;
}

export interface CurrentReviewListingStats {
  listingId: string;
  totalReviews: number;
  avgRating: number;
}

export interface CurrentReviewItemFilter {
  listingId?: string;
  rating?: number;
  hasContent?: boolean;
  search?: string;
}

export async function readCurrentReviewListingStats(
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

export async function readCurrentReviewRecentCounts(
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

export async function readCurrentReviewListingAggregates(
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

export async function readCurrentReviewItemCount(
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

export async function readCurrentReviewContentCount(
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

export async function readCurrentReviewRatingCounts(
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

export async function readCurrentReviewItems(
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
 * Current complete review facts, shared by every Orders review projection.
 *
 * 쿠팡: 실행(`operations`, KID-359)이 쓴 행은 리뷰당 하나이고 옛 SourceImportRun 행보다 항상 현재다
 * (tier 1). 실행 행이 없는 리뷰는 옛 규칙대로 완료된 `coupang_reviews` run 중 가장 최근 세대(tier 0).
 * 둘을 모아 external_review_id마다 1위를 고른다. 옛 run 행은 KID-365에서 사라진다.
 */
function currentReviewsCte(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    WITH coupang_candidates AS (
      SELECT
        r.id, r.organization_id, r.source_import_run_id, r.listing_id, r.platform,
        r.rating, r.title, r.content, r.reviewer_name, r.external_review_id,
        r.external_option_id, r.external_product_id, r.item_name, r.image_count,
        r.video_count, r.is_deleted, r.is_blinded, r.reviewed_at,
        1 AS generation_tier, NULL::bigint AS publication_sequence,
        r.published_at AS generation_at, r.operation_id AS generation_id
      FROM reviews r
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.platform = 'coupang'
        AND r.operation_id IS NOT NULL
      UNION ALL
      SELECT
        r.id, r.organization_id, r.source_import_run_id, r.listing_id, r.platform,
        r.rating, r.title, r.content, r.reviewer_name, r.external_review_id,
        r.external_option_id, r.external_product_id, r.item_name, r.image_count,
        r.video_count, r.is_deleted, r.is_blinded, r.reviewed_at,
        0 AS generation_tier, s.publication_sequence,
        COALESCE(s.imported_at, s.created_at) AS generation_at, s.id AS generation_id
      FROM reviews r
      INNER JOIN source_import_runs s
        ON s.id = r.source_import_run_id
       AND s.organization_id = r.organization_id
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.platform = 'coupang'
        AND r.source_import_run_id IS NOT NULL
        AND r.operation_id IS NULL
        AND s.source_type = ${COUPANG_REVIEW_SOURCE_TYPE}
        AND s.status = ${SOURCE_IMPORT_RUN_COMPLETED_STATUS}
    ), ranked_coupang AS (
      SELECT c.*,
        ROW_NUMBER() OVER (
          PARTITION BY c.external_review_id
          ORDER BY c.generation_tier DESC,
                   c.publication_sequence DESC NULLS LAST,
                   c.generation_at DESC NULLS LAST,
                   c.generation_id DESC, c.id DESC
        ) AS generation_rank
      FROM coupang_candidates c
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
      INNER JOIN source_import_runs s
        ON s.id = r.source_import_run_id
       AND s.organization_id = r.organization_id
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.platform <> 'coupang'
        AND r.source_import_run_id IS NOT NULL
        AND s.status = ${SOURCE_IMPORT_RUN_COMPLETED_STATUS}
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
