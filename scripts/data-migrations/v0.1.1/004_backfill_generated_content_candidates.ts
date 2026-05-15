import type { DataMigration } from '../types';

export const backfillGeneratedContentCandidates: DataMigration = {
  id: 'v0.1.1:004_backfill_generated_content_candidates',
  releaseVersion: '0.1.1',
  name: 'Backfill sourcing candidates for product-unbound generated detail content',
  async run(tx) {
    const [result] = await tx.$queryRaw<Array<{
      insertedCandidates: bigint | number;
      updatedGenerations: bigint | number;
      updatedArtifacts: bigint | number;
      insertedImages: bigint | number;
    }>>`
      WITH unbound_rows AS (
        SELECT
          cg.organization_id,
          cg.generation_group_id,
          CONCAT('kiditem://generated-content/backfill/', cg.generation_group_id::text) AS source_url,
          COALESCE(
            NULLIF(BTRIM(cgg.title), ''),
            NULLIF(BTRIM(cg.generated_title), ''),
            '생성 콘텐츠 후보'
          ) AS title,
          COALESCE(
            jsonb_path_query_first(cg.generation_input, '$.imageUrls[*]') #>> '{}',
            jsonb_path_query_first(cg.generation_input, '$.rawInput.imageUrls[*]') #>> '{}',
            jsonb_path_query_first(cg.generation_result, '$.imageUrls[*]') #>> '{}'
          ) AS first_image_url,
          cg.triggered_by_user_id,
          cg.created_at,
          cg.updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY cg.organization_id, cg.generation_group_id
            ORDER BY cg.updated_at DESC, cg.created_at DESC, cg.id DESC
          ) AS row_num
        FROM content_generations cg
        JOIN content_generation_groups cgg ON cgg.id = cg.generation_group_id
        WHERE cg.is_deleted = false
          AND cg.content_type = 'detail_page'
          AND cg.source_candidate_id IS NULL
          AND cgg.target_master_id IS NULL
      ),
      unbound_groups AS (
        SELECT
          organization_id,
          generation_group_id,
          source_url,
          title,
          first_image_url,
          triggered_by_user_id,
          created_at,
          updated_at
        FROM unbound_rows
        WHERE row_num = 1
      ),
      upserted_candidates AS (
        INSERT INTO sourcing_candidates (
          id,
          organization_id,
          source_url,
          source_platform,
          raw_data,
          name,
          description,
          category,
          tags,
          thumbnail_url,
          image_url,
          status,
          triggered_by_user_id,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          organization_id,
          source_url,
          'kiditem-detail-page',
          jsonb_build_object(
            'source', 'generated_content_backfill',
            'generationGroupId', generation_group_id,
            'imageUrls', CASE
              WHEN first_image_url IS NULL THEN '[]'::jsonb
              ELSE jsonb_build_array(first_image_url)
            END
          ),
          LEFT(title, 120),
          '',
          NULL,
          '[]'::jsonb,
          first_image_url,
          first_image_url,
          'sourced',
          triggered_by_user_id,
          created_at,
          updated_at
        FROM unbound_groups
        ON CONFLICT (organization_id, source_url)
          WHERE is_deleted = false AND status = 'sourced'
        DO UPDATE SET
          raw_data = sourcing_candidates.raw_data || EXCLUDED.raw_data,
          thumbnail_url = COALESCE(sourcing_candidates.thumbnail_url, EXCLUDED.thumbnail_url),
          image_url = COALESCE(sourcing_candidates.image_url, EXCLUDED.image_url),
          updated_at = GREATEST(sourcing_candidates.updated_at, EXCLUDED.updated_at)
        RETURNING id, organization_id, source_url
      ),
      candidate_links AS (
        SELECT ug.generation_group_id, ug.first_image_url, uc.id AS candidate_id, uc.organization_id
        FROM unbound_groups ug
        JOIN upserted_candidates uc ON uc.organization_id = ug.organization_id AND uc.source_url = ug.source_url
      ),
      updated_generations AS (
        UPDATE content_generations cg
        SET source_candidate_id = cl.candidate_id
        FROM candidate_links cl
        WHERE cg.organization_id = cl.organization_id
          AND cg.generation_group_id = cl.generation_group_id
          AND cg.is_deleted = false
          AND cg.source_candidate_id IS NULL
        RETURNING cg.id, cg.organization_id, cg.source_candidate_id
      ),
      updated_artifacts AS (
        UPDATE detail_page_artifacts dpa
        SET source_candidate_id = ug.source_candidate_id
        FROM updated_generations ug
        WHERE dpa.organization_id = ug.organization_id
          AND dpa.source_content_generation_id = ug.id
          AND dpa.is_deleted = false
          AND dpa.source_candidate_id IS NULL
        RETURNING dpa.id
      ),
      inserted_images AS (
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
          cl.organization_id,
          cl.candidate_id,
          cl.first_image_url,
          'product',
          NULL,
          0,
          'generated-content-backfill',
          true,
          now(),
          now()
        FROM candidate_links cl
        WHERE cl.first_image_url IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sourcing_candidate_images existing
            WHERE existing.organization_id = cl.organization_id
              AND existing.candidate_id = cl.candidate_id
              AND existing.url = cl.first_image_url
              AND existing.is_deleted = false
          )
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*) FROM upserted_candidates) AS "insertedCandidates",
        (SELECT COUNT(*) FROM updated_generations) AS "updatedGenerations",
        (SELECT COUNT(*) FROM updated_artifacts) AS "updatedArtifacts",
        (SELECT COUNT(*) FROM inserted_images) AS "insertedImages"
    `;

    const insertedCandidates = Number(result?.insertedCandidates ?? 0);
    const updatedGenerations = Number(result?.updatedGenerations ?? 0);
    const updatedArtifacts = Number(result?.updatedArtifacts ?? 0);
    const insertedImages = Number(result?.insertedImages ?? 0);

    return {
      affectedRows: insertedCandidates + updatedGenerations + updatedArtifacts + insertedImages,
      details: {
        insertedCandidates,
        updatedGenerations,
        updatedArtifacts,
        insertedImages,
      },
    };
  },
};
