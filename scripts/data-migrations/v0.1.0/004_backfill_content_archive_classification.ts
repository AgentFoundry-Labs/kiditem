import type { DataMigration } from '../types';

export const backfillContentArchiveClassification: DataMigration = {
  id: 'v0.1.0:004_backfill_content_archive_classification',
  releaseVersion: '0.1.0',
  name: 'Backfill content archive classification and workspace grouping',
  async run(tx) {
    const contentGenerationsClassified = await tx.$executeRaw`
      UPDATE content_generations
      SET content_type = COALESCE(NULLIF(content_type, ''), 'detail_page')
      WHERE content_type IS NULL OR btrim(content_type) = ''
    `;

    const productlessGenerationGroupsCreated = await tx.$executeRaw`
      WITH ungrouped AS (
        SELECT
          id,
          organization_id,
          generated_title,
          triggered_by_user_id,
          created_at
        FROM content_generations
        WHERE master_id IS NULL
          AND generation_group_id IS NULL
      ),
      inserted AS (
        INSERT INTO content_generation_groups (
          id,
          organization_id,
          group_type,
          target_master_id,
          base_content_generation_id,
          title,
          input_fingerprint,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          organization_id,
          'input_variation',
          NULL,
          id,
          COALESCE(generated_title, '미연결 콘텐츠 작업'),
          NULL,
          jsonb_build_object('backfill', 'productless_generation'),
          triggered_by_user_id,
          created_at,
          now()
        FROM ungrouped
        RETURNING id, base_content_generation_id
      )
      UPDATE content_generations cg
      SET generation_group_id = inserted.id,
          updated_at = now()
      FROM inserted
      WHERE cg.id = inserted.base_content_generation_id
    `;

    const contentAssetsClassified = await tx.$executeRaw`
      UPDATE content_assets
      SET
        pipeline_type = CASE
          WHEN source_type IN ('detail_page_input', 'detail_page_generated', 'detail_page_reference') THEN 'detail_page'
          ELSE COALESCE(NULLIF(pipeline_type, ''), 'legacy')
        END,
        usage_type = CASE
          WHEN source_type = 'detail_page_input' THEN 'input'
          WHEN source_type = 'detail_page_reference' THEN 'reference'
          ELSE 'output'
        END,
        origin_type = CASE
          WHEN source_type = 'detail_page_input' THEN 'manual_upload'
          WHEN source_type = 'detail_page_generated' THEN 'generated'
          ELSE COALESCE(NULLIF(origin_type, ''), 'generated')
        END,
        updated_at = now()
      WHERE usage_type IS NULL
         OR usage_type IS DISTINCT FROM CASE
              WHEN source_type = 'detail_page_input' THEN 'input'
              WHEN source_type = 'detail_page_reference' THEN 'reference'
              ELSE 'output'
            END
         OR pipeline_type IS NULL
         OR btrim(pipeline_type) = ''
         OR origin_type IS NULL
         OR btrim(origin_type) = ''
    `;

    const contentGenerationSourcesInserted = await tx.$executeRaw`
      WITH candidate_match AS (
        SELECT DISTINCT ON (cg.id)
          cg.id AS generation_id,
          cg.organization_id,
          cg.master_id AS target_master_id,
          sc.id AS candidate_id
        FROM content_generations cg
        JOIN sourcing_candidates sc
          ON sc.promoted_master_id = cg.master_id
         AND sc.organization_id = cg.organization_id
         AND sc.is_deleted = false
        WHERE cg.master_id IS NOT NULL
        ORDER BY cg.id, sc.updated_at DESC, sc.created_at DESC, sc.id
      )
      INSERT INTO content_generation_sources (
        id,
        organization_id,
        content_generation_id,
        source_type,
        source_candidate_id,
        master_id,
        label,
        sort_order,
        metadata,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        cm.organization_id,
        cm.generation_id,
        'sourcing_candidate',
        cm.candidate_id,
        cm.target_master_id,
        'Backfilled from promoted sourcing candidate',
        0,
        jsonb_build_object('backfill', 'promoted_master_id'),
        now(),
        now()
      FROM candidate_match cm
      WHERE NOT EXISTS (
        SELECT 1
        FROM content_generation_sources existing
        WHERE existing.content_generation_id = cm.generation_id
          AND existing.source_type = 'sourcing_candidate'
          AND existing.source_candidate_id = cm.candidate_id
      )
    `;

    const inputAssetSourcesInserted = await tx.$executeRaw`
      INSERT INTO content_generation_sources (
        id,
        organization_id,
        content_generation_id,
        source_type,
        content_asset_id,
        label,
        sort_order,
        metadata,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        ca.organization_id,
        ca.content_generation_id,
        'input_asset',
        ca.id,
        COALESCE(ca.label, ca.role, 'Input asset'),
        ca.sort_order,
        jsonb_build_object('backfill', 'detail_page_input_asset'),
        now(),
        now()
      FROM content_assets ca
      WHERE ca.content_generation_id IS NOT NULL
        AND ca.usage_type = 'input'
        AND ca.is_deleted = false
        AND NOT EXISTS (
          SELECT 1
          FROM content_generation_sources existing
          WHERE existing.content_generation_id = ca.content_generation_id
            AND existing.source_type = 'input_asset'
            AND existing.content_asset_id = ca.id
        )
    `;

    return {
      affectedRows:
        contentGenerationsClassified +
        productlessGenerationGroupsCreated +
        contentAssetsClassified +
        contentGenerationSourcesInserted +
        inputAssetSourcesInserted,
      details: {
        contentGenerationsClassified,
        productlessGenerationGroupsCreated,
        contentAssetsClassified,
        contentGenerationSourcesInserted,
        inputAssetSourcesInserted,
      },
    };
  },
};
