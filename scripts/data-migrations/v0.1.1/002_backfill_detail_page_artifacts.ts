import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

export const backfillDetailPageArtifacts: DataMigration = {
  id: 'v0.1.1:002_backfill_detail_page_artifacts',
  releaseVersion: '0.1.1',
  name: 'Backfill candidate-centered detail page artifacts and revisions',
  async run(tx) {
    const hasContentGenerations = await hasTable(tx, 'content_generations');
    const hasContentGenerationSources = await hasTable(tx, 'content_generation_sources');
    const hasContentGenerationGroups = await hasTable(tx, 'content_generation_groups');
    const hasArtifacts = await hasTable(tx, 'detail_page_artifacts');
    const hasRevisions = await hasTable(tx, 'detail_page_revisions');
    const hasSourceCandidateColumn = await hasColumn(tx, 'content_generations', 'source_candidate_id');
    const hasArtifactColumn = await hasColumn(tx, 'content_generations', 'detail_page_artifact_id');
    const hasEditedHtmlColumn = await hasColumn(tx, 'content_generations', 'edited_html');

    if (
      !hasContentGenerations ||
      !hasContentGenerationSources ||
      !hasContentGenerationGroups ||
      !hasArtifacts ||
      !hasRevisions ||
      !hasSourceCandidateColumn ||
      !hasArtifactColumn ||
      !hasEditedHtmlColumn
    ) {
      return {
        affectedRows: 0,
        details: {
          skipped: 'detail page artifact schema is not available',
        },
      };
    }

    const sourceCandidatesBackfilled = await tx.$executeRaw`
      WITH primary_candidate AS (
        SELECT DISTINCT ON (content_generation_id)
          content_generation_id,
          source_candidate_id
        FROM content_generation_sources
        WHERE source_type = 'sourcing_candidate'
          AND source_candidate_id IS NOT NULL
        ORDER BY content_generation_id, sort_order ASC, created_at ASC, id ASC
      )
      UPDATE content_generations cg
      SET source_candidate_id = primary_candidate.source_candidate_id,
          updated_at = now()
      FROM primary_candidate
      WHERE cg.id = primary_candidate.content_generation_id
        AND cg.source_candidate_id IS NULL
    `;

    const artifactsCreated = await tx.$executeRaw`
      INSERT INTO detail_page_artifacts (
        id,
        organization_id,
        source_candidate_id,
        target_master_id,
        source_content_generation_id,
        current_revision_id,
        title,
        status,
        metadata,
        created_by_user_id,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        cg.organization_id,
        cg.source_candidate_id,
        cgg.target_master_id,
        cg.id,
        NULL,
        COALESCE(cg.generated_title, cgg.title, '상세페이지'),
        'draft',
        CASE
          WHEN cg.edited_html IS NOT NULL THEN jsonb_build_object('backfill', 'legacy_content_generation_edited_html')
          ELSE jsonb_build_object('backfill', 'legacy_content_generation_artifact_identity')
        END,
        cg.triggered_by_user_id,
        COALESCE(cg.edited_html_saved_at, cg.created_at, now()),
        now()
      FROM content_generations cg
      LEFT JOIN content_generation_groups cgg
        ON cgg.id = cg.generation_group_id
       AND cgg.organization_id = cg.organization_id
      WHERE cg.content_type = 'detail_page'
        AND cg.detail_page_artifact_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM detail_page_artifacts existing
          WHERE existing.source_content_generation_id = cg.id
        )
    `;

    const contentGenerationsAttached = await tx.$executeRaw`
      UPDATE content_generations cg
      SET detail_page_artifact_id = dpa.id,
          updated_at = now()
      FROM detail_page_artifacts dpa
      WHERE dpa.source_content_generation_id = cg.id
        AND dpa.organization_id = cg.organization_id
        AND cg.detail_page_artifact_id IS NULL
    `;

    const revisionsCreated = await tx.$executeRaw`
      INSERT INTO detail_page_revisions (
        id,
        organization_id,
        artifact_id,
        content_generation_id,
        revision_type,
        html,
        asset_url_map,
        image_urls,
        created_by_user_id,
        created_at
      )
      SELECT
        gen_random_uuid(),
        cg.organization_id,
        dpa.id,
        cg.id,
        'legacy_edited_html_backfill',
        cg.edited_html,
        '{}'::jsonb,
        '[]'::jsonb,
        cg.triggered_by_user_id,
        COALESCE(cg.edited_html_saved_at, cg.updated_at, now())
      FROM content_generations cg
      JOIN detail_page_artifacts dpa
        ON dpa.id = cg.detail_page_artifact_id
       AND dpa.organization_id = cg.organization_id
      WHERE cg.content_type = 'detail_page'
        AND cg.edited_html IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM detail_page_revisions existing
          WHERE existing.artifact_id = dpa.id
            AND existing.content_generation_id = cg.id
            AND existing.revision_type = 'legacy_edited_html_backfill'
        )
    `;

    const currentRevisionsSelected = await tx.$executeRaw`
      WITH latest_legacy_revision AS (
        SELECT DISTINCT ON (artifact_id)
          id,
          artifact_id
        FROM detail_page_revisions
        WHERE revision_type = 'legacy_edited_html_backfill'
        ORDER BY artifact_id, created_at DESC, id DESC
      )
      UPDATE detail_page_artifacts dpa
      SET current_revision_id = latest_legacy_revision.id,
          updated_at = now()
      FROM latest_legacy_revision
      WHERE dpa.id = latest_legacy_revision.artifact_id
        AND dpa.current_revision_id IS NULL
    `;

    return {
      affectedRows:
        sourceCandidatesBackfilled +
        artifactsCreated +
        contentGenerationsAttached +
        revisionsCreated +
        currentRevisionsSelected,
      details: {
        sourceCandidatesBackfilled,
        artifactsCreated,
        contentGenerationsAttached,
        revisionsCreated,
        currentRevisionsSelected,
      },
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
