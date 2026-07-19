import type { DataMigration } from "../types";

export const dedupeDetailPageArtifacts: DataMigration = {
  id: "v0.1.24:001_dedupe_detail_page_artifacts",
  releaseVersion: "0.1.24",
  name: "Deduplicate source detail page artifacts before uniqueness enforcement",
  phase: "pre-schema",
  async run(tx) {
    const [{ count: duplicateGroups }] = await tx.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT organization_id, source_content_generation_id
        FROM detail_page_artifacts
        WHERE source_content_generation_id IS NOT NULL
        GROUP BY organization_id, source_content_generation_id
        HAVING COUNT(*) > 1
      ) duplicate_groups
    `;

    await tx.$executeRaw`
      CREATE TEMP TABLE ai_detail_artifact_dedupe ON COMMIT DROP AS
      WITH ranked AS (
        SELECT
          dpa.id,
          dpa.organization_id,
          dpa.source_content_generation_id,
          FIRST_VALUE(dpa.id) OVER (
            PARTITION BY dpa.organization_id, dpa.source_content_generation_id
            ORDER BY
              EXISTS (
                SELECT 1
                FROM content_workspaces cw
                WHERE cw.organization_id = dpa.organization_id
                  AND cw.current_detail_page_artifact_id = dpa.id
              ) DESC,
              EXISTS (
                SELECT 1
                FROM content_generations cg
                WHERE cg.organization_id = dpa.organization_id
                  AND cg.id = dpa.source_content_generation_id
                  AND cg.detail_page_artifact_id = dpa.id
              ) DESC,
              (dpa.current_revision_id IS NOT NULL) DESC,
              dpa.is_deleted ASC,
              dpa.updated_at DESC,
              dpa.id DESC
          ) AS canonical_id,
          COUNT(*) OVER (
            PARTITION BY dpa.organization_id, dpa.source_content_generation_id
          ) AS duplicate_count
        FROM detail_page_artifacts dpa
        WHERE dpa.source_content_generation_id IS NOT NULL
      )
      SELECT
        organization_id,
        source_content_generation_id,
        id AS loser_id,
        canonical_id
      FROM ranked
      WHERE duplicate_count > 1
        AND id <> canonical_id
    `;

    const revisionsMoved = await tx.$executeRaw`
      UPDATE detail_page_revisions revision
      SET artifact_id = mapping.canonical_id
      FROM ai_detail_artifact_dedupe mapping
      WHERE revision.organization_id = mapping.organization_id
        AND revision.artifact_id = mapping.loser_id
    `;
    const generationsRepointed = await tx.$executeRaw`
      UPDATE content_generations generation
      SET detail_page_artifact_id = mapping.canonical_id,
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE generation.organization_id = mapping.organization_id
        AND generation.detail_page_artifact_id = mapping.loser_id
    `;
    const workspacesRepointed = await tx.$executeRaw`
      UPDATE content_workspaces workspace
      SET current_detail_page_artifact_id = mapping.canonical_id,
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE workspace.organization_id = mapping.organization_id
        AND workspace.current_detail_page_artifact_id = mapping.loser_id
    `;
    const preparationsRepointed = await tx.$executeRaw`
      UPDATE product_preparations preparation
      SET selected_detail_page_artifact_id = mapping.canonical_id,
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE preparation.organization_id = mapping.organization_id
        AND preparation.selected_detail_page_artifact_id = mapping.loser_id
    `;
    await tx.$executeRaw`
      UPDATE detail_page_artifacts artifact
      SET current_revision_id = (
            SELECT revision.id
            FROM detail_page_revisions revision
            WHERE revision.organization_id = artifact.organization_id
              AND revision.artifact_id = artifact.id
            ORDER BY revision.created_at DESC, revision.id DESC
            LIMIT 1
          ),
          updated_at = now()
      WHERE artifact.current_revision_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM ai_detail_artifact_dedupe mapping
          WHERE mapping.organization_id = artifact.organization_id
            AND mapping.canonical_id = artifact.id
        )
    `;
    const artifactsRetired = await tx.$executeRaw`
      UPDATE detail_page_artifacts artifact
      SET source_content_generation_id = NULL,
          current_revision_id = NULL,
          status = 'archived',
          is_deleted = true,
          deleted_at = COALESCE(artifact.deleted_at, now()),
          metadata = artifact.metadata || jsonb_build_object(
            'deduplicatedIntoArtifactId', mapping.canonical_id,
            'deduplicatedBy', 'v0.1.24:001_dedupe_detail_page_artifacts'
          ),
          updated_at = now()
      FROM ai_detail_artifact_dedupe mapping
      WHERE artifact.organization_id = mapping.organization_id
        AND artifact.id = mapping.loser_id
    `;

    const referencesRepointed =
      generationsRepointed + workspacesRepointed + preparationsRepointed;
    return {
      affectedRows: revisionsMoved + referencesRepointed + artifactsRetired,
      details: {
        duplicateGroups: Number(duplicateGroups),
        artifactsRetired,
        revisionsMoved,
        referencesRepointed,
      },
    };
  },
};
