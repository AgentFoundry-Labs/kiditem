import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

export const backfillSourcingCandidateImages: DataMigration = {
  id: 'v0.1.1:003_backfill_sourcing_candidate_images',
  releaseVersion: '0.1.1',
  name: 'Backfill CandidateImage rows from sourcing candidate image caches',
  async run(tx) {
    const hasCandidates = await hasTable(tx, 'sourcing_candidates');
    const hasImages = await hasTable(tx, 'sourcing_candidate_images');
    const hasImageUrl = await hasColumn(tx, 'sourcing_candidates', 'image_url');
    const hasThumbnailUrl = await hasColumn(tx, 'sourcing_candidates', 'thumbnail_url');

    if (!hasCandidates || !hasImages || !hasImageUrl || !hasThumbnailUrl) {
      return {
        affectedRows: 0,
        details: {
          skipped: 'sourcing candidate image schema is not available',
        },
      };
    }

    const inserted = await tx.$executeRaw`
      WITH candidate_urls AS (
        SELECT
          sc.id AS candidate_id,
          sc.organization_id,
          url_rows.url,
          url_rows.source,
          url_rows.source_order
        FROM sourcing_candidates sc
        CROSS JOIN LATERAL (
          VALUES
            (NULLIF(BTRIM(sc.image_url), ''), 'sourcing_candidate.image_url', 0),
            (NULLIF(BTRIM(sc.thumbnail_url), ''), 'sourcing_candidate.thumbnail_url', 1)
        ) AS url_rows(url, source, source_order)
        WHERE sc.is_deleted = false
          AND url_rows.url IS NOT NULL
      ),
      deduped AS (
        SELECT DISTINCT ON (candidate_id, url)
          candidate_id,
          organization_id,
          url,
          source,
          source_order
        FROM candidate_urls
        ORDER BY candidate_id, url, source_order ASC
      ),
      numbered AS (
        SELECT
          candidate_id,
          organization_id,
          url,
          source,
          ROW_NUMBER() OVER (
            PARTITION BY candidate_id
            ORDER BY source_order ASC, url ASC
          ) - 1 AS sort_order
        FROM deduped
      )
      INSERT INTO sourcing_candidate_images (
        id,
        organization_id,
        candidate_id,
        url,
        role,
        label,
        sort_order,
        source,
        is_primary,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        numbered.organization_id,
        numbered.candidate_id,
        numbered.url,
        'product',
        NULL,
        numbered.sort_order::int,
        numbered.source,
        numbered.sort_order = 0,
        now(),
        now()
      FROM numbered
      WHERE NOT EXISTS (
        SELECT 1
        FROM sourcing_candidate_images existing
        WHERE existing.organization_id = numbered.organization_id
          AND existing.candidate_id = numbered.candidate_id
          AND existing.url = numbered.url
          AND existing.is_deleted = false
      )
    `;

    return {
      affectedRows: inserted,
      details: { inserted },
    };
  },
};

async function hasTable(tx: Prisma.TransactionClient, tableName: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return Boolean(row?.exists);
}

async function hasColumn(
  tx: Prisma.TransactionClient,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `;
  return Boolean(row?.exists);
}
