import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

export const backfillContentGenerationWorkspaceAssets: DataMigration = {
  id: 'v0.1.1:001_backfill_content_generation_workspace_assets',
  releaseVersion: '0.1.1',
  name: 'Backfill content-generation workspace groups, JSON snapshots, and asset usages',
  async run(tx) {
    await ensureExpandableSchema(tx);

    const hasGenerationMasterId = await hasColumn(tx, 'content_generations', 'master_id');
    const hasGenerationGroupId = await hasColumn(tx, 'content_generations', 'generation_group_id');
    const hasGenerationInput = await hasColumn(tx, 'content_generations', 'generation_input');
    const hasGenerationResult = await hasColumn(tx, 'content_generations', 'generation_result');
    const hasDetailPageHtml = await hasColumn(tx, 'content_generations', 'detail_page_html');
    const hasOriginalImages = await hasColumn(tx, 'content_generations', 'original_images');
    const hasProcessedImages = await hasColumn(tx, 'content_generations', 'processed_images');
    const hasAssetGenerationGroupId = await hasColumn(tx, 'content_assets', 'generation_group_id');
    const hasAssetContentGenerationId = await hasColumn(tx, 'content_assets', 'content_generation_id');
    const hasAssetMasterId = await hasColumn(tx, 'content_assets', 'master_id');
    const hasAssetUsagesTable = await hasTable(tx, 'content_generation_asset_usages');

    let contentTypeClassified = 0;
    let productWorkspaceGroupsCreated = 0;
    let productGenerationsAttached = 0;
    let productlessGroupsCreated = 0;
    let jsonSnapshotsBackfilled = 0;
    let assetsAttachedFromGeneration = 0;
    let assetsAttachedFromProduct = 0;
    let assetUsagesInserted = 0;
    let masterProductSourcesDeleted = 0;

    contentTypeClassified = await tx.$executeRaw`
      UPDATE content_generations
      SET content_type = COALESCE(NULLIF(content_type, ''), 'detail_page')
      WHERE content_type IS NULL OR btrim(content_type) = ''
    `;

    if (hasGenerationMasterId && hasGenerationGroupId) {
      productWorkspaceGroupsCreated = await tx.$executeRaw`
        WITH product_workspaces AS (
          SELECT
            cg.organization_id,
            cg.master_id,
            COALESCE(MAX(mp.name), MAX(cg.generated_title), '상품 콘텐츠') AS title,
            MIN(cg.created_at) AS created_at
          FROM content_generations cg
          JOIN master_products mp
            ON mp.id = cg.master_id
           AND mp.organization_id = cg.organization_id
          WHERE cg.master_id IS NOT NULL
          GROUP BY cg.organization_id, cg.master_id
        )
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
          pw.organization_id,
          'product_workspace',
          pw.master_id,
          NULL,
          pw.title,
          NULL,
          jsonb_build_object('backfill', 'product_workspace'),
          NULL,
          COALESCE(pw.created_at, now()),
          now()
        FROM product_workspaces pw
        WHERE NOT EXISTS (
          SELECT 1
          FROM content_generation_groups existing
          WHERE existing.organization_id = pw.organization_id
            AND existing.group_type = 'product_workspace'
            AND existing.target_master_id = pw.master_id
        )
      `;

      productGenerationsAttached = await tx.$executeRaw`
        UPDATE content_generations cg
        SET generation_group_id = cgg.id,
            updated_at = now()
        FROM content_generation_groups cgg
        WHERE cg.organization_id = cgg.organization_id
          AND cg.master_id = cgg.target_master_id
          AND cgg.group_type = 'product_workspace'
          AND cg.master_id IS NOT NULL
          AND (cg.generation_group_id IS NULL OR cg.generation_group_id IS DISTINCT FROM cgg.id)
      `;
    }

    if (hasGenerationGroupId) {
      productlessGroupsCreated = await tx.$executeRaw`
        WITH ungrouped AS (
          SELECT
            id,
            organization_id,
            generated_title,
            triggered_by_user_id,
            created_at
          FROM content_generations
          WHERE generation_group_id IS NULL
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
            jsonb_build_object('backfill', 'unlinked_content_generation'),
            triggered_by_user_id,
            COALESCE(created_at, now()),
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
    }

    if (hasGenerationInput && hasGenerationResult) {
      if (hasDetailPageHtml) {
        await tx.$executeRaw`
          CREATE OR REPLACE FUNCTION pg_temp.kiditem_try_parse_jsonb(value text)
          RETURNS jsonb
          LANGUAGE plpgsql
          AS $$
          BEGIN
            RETURN value::jsonb;
          EXCEPTION WHEN others THEN
            RETURN NULL;
          END;
          $$
        `;
      }

      if (hasDetailPageHtml && hasOriginalImages && hasProcessedImages) {
        jsonSnapshotsBackfilled = await tx.$executeRaw`
          WITH parsed AS (
            SELECT
              cg.id,
              pg_temp.kiditem_try_parse_jsonb(cg.detail_page_html::text) AS stored,
              to_jsonb(cg.original_images) AS original_image_urls,
              to_jsonb(cg.processed_images) AS processed_image_urls,
              cg.template_id,
              cg.generated_title
            FROM content_generations cg
          )
          UPDATE content_generations cg
          SET
            generation_input = CASE
              WHEN cg.generation_input IS NULL OR cg.generation_input = '{}'::jsonb THEN
                COALESCE(
                  parsed.stored->'rawInput',
                  jsonb_build_object(
                    'rawTitle', COALESCE(cg.generated_title, '상세페이지'),
                    'rawCategory', '',
                    'rawDescription', '',
                    'rawOptions', '',
                    'imageUrls', COALESCE(parsed.original_image_urls, '[]'::jsonb),
                    'heroImageMode', 'first',
                    'templateId', COALESCE(NULLIF(cg.template_id, ''), 'kids-playful')
                  )
                )
              ELSE cg.generation_input
            END,
            generation_result = CASE
              WHEN cg.generation_result IS NULL OR cg.generation_result = '{}'::jsonb THEN
                jsonb_build_object(
                  'templateId', COALESCE(parsed.stored->>'templateId', NULLIF(cg.template_id, ''), 'kids-playful'),
                  'result', COALESCE(parsed.stored->'result', '{}'::jsonb),
                  'imageUrls', COALESCE(parsed.stored->'imageUrls', parsed.original_image_urls, '[]'::jsonb),
                  'processedImages', COALESCE(parsed.stored->'processedImages', parsed.processed_image_urls, '{}'::jsonb)
                )
              ELSE cg.generation_result
            END,
            updated_at = now()
          FROM parsed
          WHERE cg.id = parsed.id
            AND (
              cg.generation_input IS NULL
              OR cg.generation_input = '{}'::jsonb
              OR cg.generation_result IS NULL
              OR cg.generation_result = '{}'::jsonb
            )
        `;
      } else {
        jsonSnapshotsBackfilled = await tx.$executeRaw`
          UPDATE content_generations
          SET
            generation_input = COALESCE(NULLIF(generation_input, '{}'::jsonb), jsonb_build_object(
              'rawTitle', COALESCE(generated_title, '상세페이지'),
              'rawCategory', '',
              'rawDescription', '',
              'rawOptions', '',
              'imageUrls', '[]'::jsonb,
              'heroImageMode', 'first',
              'templateId', COALESCE(NULLIF(template_id, ''), 'kids-playful')
            )),
            generation_result = COALESCE(NULLIF(generation_result, '{}'::jsonb), jsonb_build_object(
              'templateId', COALESCE(NULLIF(template_id, ''), 'kids-playful'),
              'result', '{}'::jsonb,
              'imageUrls', '[]'::jsonb,
              'processedImages', '{}'::jsonb
            )),
            updated_at = now()
          WHERE generation_input IS NULL
             OR generation_input = '{}'::jsonb
             OR generation_result IS NULL
             OR generation_result = '{}'::jsonb
        `;
      }
    }

    if (hasAssetGenerationGroupId && hasAssetContentGenerationId && hasGenerationGroupId) {
      assetsAttachedFromGeneration = await tx.$executeRaw`
        UPDATE content_assets ca
        SET generation_group_id = cg.generation_group_id,
            asset_key = CONCAT(
              'group-url:',
              cg.generation_group_id::text,
              ':',
              SUBSTRING(ENCODE(SHA256(CONVERT_TO(ca.url, 'UTF8')), 'hex') FROM 1 FOR 32)
            ),
            updated_at = now()
        FROM content_generations cg
        WHERE ca.content_generation_id = cg.id
          AND ca.organization_id = cg.organization_id
          AND cg.generation_group_id IS NOT NULL
          AND (ca.generation_group_id IS NULL OR ca.generation_group_id IS DISTINCT FROM cg.generation_group_id)
      `;
    }

    if (hasAssetGenerationGroupId && hasAssetMasterId) {
      assetsAttachedFromProduct = await tx.$executeRaw`
        UPDATE content_assets ca
        SET generation_group_id = cgg.id,
            asset_key = CONCAT(
              'group-url:',
              cgg.id::text,
              ':',
              SUBSTRING(ENCODE(SHA256(CONVERT_TO(ca.url, 'UTF8')), 'hex') FROM 1 FOR 32)
            ),
            updated_at = now()
        FROM content_generation_groups cgg
        WHERE ca.organization_id = cgg.organization_id
          AND ca.master_id = cgg.target_master_id
          AND cgg.group_type = 'product_workspace'
          AND ca.master_id IS NOT NULL
          AND (ca.generation_group_id IS NULL OR ca.generation_group_id IS DISTINCT FROM cgg.id)
      `;
    }

    if (hasAssetUsagesTable && hasAssetContentGenerationId) {
      assetUsagesInserted = await tx.$executeRaw`
        INSERT INTO content_generation_asset_usages (
          id,
          organization_id,
          content_generation_id,
          content_asset_id,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          ca.organization_id,
          ca.content_generation_id,
          ca.id,
          jsonb_build_object('backfill', 'legacy_content_asset_link'),
          now(),
          now()
        FROM content_assets ca
        JOIN content_generations cg
          ON cg.id = ca.content_generation_id
         AND cg.organization_id = ca.organization_id
        WHERE ca.content_generation_id IS NOT NULL
          AND ca.is_deleted = false
        ON CONFLICT (content_generation_id, content_asset_id) DO NOTHING
      `;
    }

    masterProductSourcesDeleted = await tx.$executeRaw`
      DELETE FROM content_generation_sources
      WHERE source_type = 'master_product'
    `;

    return {
      affectedRows:
        contentTypeClassified +
        productWorkspaceGroupsCreated +
        productGenerationsAttached +
        productlessGroupsCreated +
        jsonSnapshotsBackfilled +
        assetsAttachedFromGeneration +
        assetsAttachedFromProduct +
        assetUsagesInserted +
        masterProductSourcesDeleted,
      details: {
        contentTypeClassified,
        productWorkspaceGroupsCreated,
        productGenerationsAttached,
        productlessGroupsCreated,
        jsonSnapshotsBackfilled,
        assetsAttachedFromGeneration,
        assetsAttachedFromProduct,
        assetUsagesInserted,
        masterProductSourcesDeleted,
        skippedLegacyColumns: {
          hasGenerationMasterId,
          hasGenerationGroupId,
          hasGenerationInput,
          hasGenerationResult,
          hasDetailPageHtml,
          hasOriginalImages,
          hasProcessedImages,
          hasAssetGenerationGroupId,
          hasAssetContentGenerationId,
          hasAssetMasterId,
          hasAssetUsagesTable,
        },
      },
    };
  },
};

async function ensureExpandableSchema(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`
    ALTER TABLE content_generations
      ADD COLUMN IF NOT EXISTS generation_input jsonb NOT NULL DEFAULT '{}'::jsonb
  `;
  await tx.$executeRaw`
    ALTER TABLE content_generations
      ADD COLUMN IF NOT EXISTS generation_result jsonb NOT NULL DEFAULT '{}'::jsonb
  `;
  await tx.$executeRaw`
    ALTER TABLE content_assets
      ADD COLUMN IF NOT EXISTS generation_group_id uuid
  `;
  await tx.$executeRaw`
    CREATE TABLE IF NOT EXISTS content_generation_asset_usages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      content_generation_id uuid NOT NULL REFERENCES content_generations(id) ON DELETE CASCADE,
      content_asset_id uuid NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await tx.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS content_generation_asset_usages_content_generation_id_content_asset_id_key
      ON content_generation_asset_usages(content_generation_id, content_asset_id)
  `;
  await tx.$executeRaw`
    CREATE INDEX IF NOT EXISTS content_generation_asset_usages_organization_id_idx
      ON content_generation_asset_usages(organization_id)
  `;
  await tx.$executeRaw`
    CREATE INDEX IF NOT EXISTS content_generation_asset_usages_content_generation_id_idx
      ON content_generation_asset_usages(content_generation_id)
  `;
  await tx.$executeRaw`
    CREATE INDEX IF NOT EXISTS content_generation_asset_usages_content_asset_id_idx
      ON content_generation_asset_usages(content_asset_id)
  `;
  await tx.$executeRaw`
    CREATE INDEX IF NOT EXISTS content_generation_asset_usages_organization_id_content_generation_id_idx
      ON content_generation_asset_usages(organization_id, content_generation_id)
  `;
}

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
