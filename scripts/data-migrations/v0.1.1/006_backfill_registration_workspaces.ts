import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

export const backfillRegistrationWorkspaces: DataMigration = {
  id: 'v0.1.1:006_backfill_registration_workspaces',
  releaseVersion: '0.1.1',
  name: 'Backfill registration workspaces for generated detail pages',
  async run(tx) {
    const hasRegistrationWorkspaces = await hasTable(tx, 'registration_workspaces');
    const hasContentGenerations = await hasTable(tx, 'content_generations');
    const hasContentGenerationGroups = await hasTable(tx, 'content_generation_groups');
    const hasDetailPageArtifacts = await hasTable(tx, 'detail_page_artifacts');
    const hasRegistrationWorkspaceId = await hasColumn(
      tx,
      'content_generations',
      'registration_workspace_id',
    );
    const hasArtifactRegistrationWorkspaceId = await hasColumn(
      tx,
      'detail_page_artifacts',
      'registration_workspace_id',
    );

    if (
      !hasRegistrationWorkspaces ||
      !hasContentGenerations ||
      !hasContentGenerationGroups ||
      !hasDetailPageArtifacts ||
      !hasRegistrationWorkspaceId ||
      !hasArtifactRegistrationWorkspaceId
    ) {
      return {
        affectedRows: 0,
        details: {
          skipped: 'registration workspace schema is not available',
        },
      };
    }

    const workspacesCreated = await tx.$executeRaw`
      WITH generation_workspace_inputs AS (
        SELECT
          cg.organization_id,
          CASE
            WHEN COALESCE(cgg.target_master_id, dpa.target_master_id) IS NOT NULL THEN 'master_product'
            WHEN COALESCE(cg.source_candidate_id, dpa.source_candidate_id) IS NOT NULL THEN 'sourcing_candidate'
            ELSE 'direct_detail_page'
          END AS owner_type,
          COALESCE(cg.source_candidate_id, dpa.source_candidate_id) AS source_candidate_id,
          COALESCE(cgg.target_master_id, dpa.target_master_id) AS target_master_id,
          LEFT(
            COALESCE(
              NULLIF(BTRIM(dpa.title), ''),
              NULLIF(BTRIM(cg.generated_title), ''),
              NULLIF(BTRIM(cgg.title), ''),
              '상세페이지 작업'
            ),
            120
          ) AS display_name,
          LEFT(
            LOWER(
              regexp_replace(
                regexp_replace(
                  COALESCE(
                    NULLIF(BTRIM(dpa.title), ''),
                    NULLIF(BTRIM(cg.generated_title), ''),
                    NULLIF(BTRIM(cgg.title), ''),
                    '상세페이지 작업'
                  ),
                  '\\s+',
                  '',
                  'g'
                ),
                '[[:punct:]]',
                '',
                'g'
              )
            ),
            120
          ) AS normalized_title,
          COALESCE(cg.triggered_by_user_id, dpa.created_by_user_id) AS created_by_user_id,
          LEAST(cg.created_at, COALESCE(dpa.created_at, cg.created_at)) AS created_at,
          GREATEST(cg.updated_at, COALESCE(dpa.updated_at, cg.updated_at)) AS updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY
              cg.organization_id,
              CASE
                WHEN COALESCE(cgg.target_master_id, dpa.target_master_id) IS NOT NULL THEN 'master_product'
                WHEN COALESCE(cg.source_candidate_id, dpa.source_candidate_id) IS NOT NULL THEN 'sourcing_candidate'
                ELSE 'direct_detail_page'
              END,
              COALESCE(cg.source_candidate_id::text, dpa.source_candidate_id::text, ''),
              COALESCE(cgg.target_master_id::text, dpa.target_master_id::text, ''),
              LEFT(
                LOWER(
                  regexp_replace(
                    regexp_replace(
                      COALESCE(
                        NULLIF(BTRIM(dpa.title), ''),
                        NULLIF(BTRIM(cg.generated_title), ''),
                        NULLIF(BTRIM(cgg.title), ''),
                        '상세페이지 작업'
                      ),
                      '\\s+',
                      '',
                      'g'
                    ),
                    '[[:punct:]]',
                    '',
                    'g'
                  )
                ),
                120
              )
            ORDER BY cg.updated_at DESC, cg.created_at DESC, cg.id DESC
          ) AS row_num
        FROM content_generations cg
        LEFT JOIN content_generation_groups cgg
          ON cgg.id = cg.generation_group_id
         AND cgg.organization_id = cg.organization_id
        LEFT JOIN detail_page_artifacts dpa
          ON dpa.id = cg.detail_page_artifact_id
         AND dpa.organization_id = cg.organization_id
        WHERE cg.content_type = 'detail_page'
          AND cg.is_deleted = false
          AND cg.registration_workspace_id IS NULL
      ),
      unique_workspace_inputs AS (
        SELECT *
        FROM generation_workspace_inputs
        WHERE row_num = 1
      )
      INSERT INTO registration_workspaces (
        id,
        organization_id,
        owner_type,
        source_candidate_id,
        target_master_id,
        display_name,
        normalized_title,
        status,
        created_by_user_id,
        is_deleted,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        organization_id,
        owner_type,
        source_candidate_id,
        target_master_id,
        display_name,
        COALESCE(NULLIF(normalized_title, ''), '상세페이지작업'),
        'active',
        created_by_user_id,
        false,
        COALESCE(created_at, now()),
        COALESCE(updated_at, now())
      FROM unique_workspace_inputs input
      WHERE NOT EXISTS (
        SELECT 1
        FROM registration_workspaces existing
        WHERE existing.organization_id = input.organization_id
          AND existing.owner_type = input.owner_type
          AND existing.normalized_title = COALESCE(NULLIF(input.normalized_title, ''), '상세페이지작업')
          AND existing.status = 'active'
          AND existing.is_deleted = false
          AND (
            (input.owner_type = 'sourcing_candidate' AND existing.source_candidate_id = input.source_candidate_id)
            OR (input.owner_type = 'master_product' AND existing.target_master_id = input.target_master_id)
            OR (
              input.owner_type = 'direct_detail_page'
              AND existing.source_candidate_id IS NULL
              AND existing.target_master_id IS NULL
            )
          )
      )
    `;

    const contentGenerationsAttached = await tx.$executeRaw`
      WITH generation_workspace_matches AS (
        SELECT
          cg.id AS content_generation_id,
          rw.id AS registration_workspace_id
        FROM content_generations cg
        LEFT JOIN content_generation_groups cgg
          ON cgg.id = cg.generation_group_id
         AND cgg.organization_id = cg.organization_id
        LEFT JOIN detail_page_artifacts dpa
          ON dpa.id = cg.detail_page_artifact_id
         AND dpa.organization_id = cg.organization_id
        JOIN registration_workspaces rw
          ON rw.organization_id = cg.organization_id
         AND rw.status = 'active'
         AND rw.is_deleted = false
         AND rw.owner_type = CASE
            WHEN COALESCE(cgg.target_master_id, dpa.target_master_id) IS NOT NULL THEN 'master_product'
            WHEN COALESCE(cg.source_candidate_id, dpa.source_candidate_id) IS NOT NULL THEN 'sourcing_candidate'
            ELSE 'direct_detail_page'
          END
         AND rw.normalized_title = COALESCE(
            NULLIF(
              LEFT(
                LOWER(
                  regexp_replace(
                    regexp_replace(
                      COALESCE(
                        NULLIF(BTRIM(dpa.title), ''),
                        NULLIF(BTRIM(cg.generated_title), ''),
                        NULLIF(BTRIM(cgg.title), ''),
                        '상세페이지 작업'
                      ),
                      '\\s+',
                      '',
                      'g'
                    ),
                    '[[:punct:]]',
                    '',
                    'g'
                  )
                ),
                120
              ),
              ''
            ),
            '상세페이지작업'
          )
         AND (
            (rw.owner_type = 'sourcing_candidate' AND rw.source_candidate_id = COALESCE(cg.source_candidate_id, dpa.source_candidate_id))
            OR (rw.owner_type = 'master_product' AND rw.target_master_id = COALESCE(cgg.target_master_id, dpa.target_master_id))
            OR (
              rw.owner_type = 'direct_detail_page'
              AND rw.source_candidate_id IS NULL
              AND rw.target_master_id IS NULL
            )
         )
        WHERE cg.content_type = 'detail_page'
          AND cg.is_deleted = false
          AND cg.registration_workspace_id IS NULL
      )
      UPDATE content_generations cg
      SET registration_workspace_id = matches.registration_workspace_id,
          updated_at = now()
      FROM generation_workspace_matches matches
      WHERE cg.id = matches.content_generation_id
    `;

    const artifactsAttachedFromGenerations = await tx.$executeRaw`
      UPDATE detail_page_artifacts dpa
      SET registration_workspace_id = cg.registration_workspace_id,
          updated_at = now()
      FROM content_generations cg
      WHERE dpa.organization_id = cg.organization_id
        AND dpa.source_content_generation_id = cg.id
        AND dpa.is_deleted = false
        AND dpa.registration_workspace_id IS NULL
        AND cg.registration_workspace_id IS NOT NULL
    `;

    const workspaceCurrentPointersUpdated = await tx.$executeRaw`
      WITH latest_artifact AS (
        SELECT DISTINCT ON (registration_workspace_id)
          registration_workspace_id,
          id AS artifact_id,
          current_revision_id
        FROM detail_page_artifacts
        WHERE registration_workspace_id IS NOT NULL
          AND is_deleted = false
        ORDER BY registration_workspace_id, updated_at DESC, created_at DESC, id DESC
      )
      UPDATE registration_workspaces rw
      SET current_detail_page_artifact_id = COALESCE(rw.current_detail_page_artifact_id, latest_artifact.artifact_id),
          current_detail_page_revision_id = COALESCE(rw.current_detail_page_revision_id, latest_artifact.current_revision_id),
          updated_at = now()
      FROM latest_artifact
      WHERE rw.id = latest_artifact.registration_workspace_id
        AND (
          rw.current_detail_page_artifact_id IS NULL
          OR (rw.current_detail_page_revision_id IS NULL AND latest_artifact.current_revision_id IS NOT NULL)
        )
    `;

    return {
      affectedRows:
        workspacesCreated +
        contentGenerationsAttached +
        artifactsAttachedFromGenerations +
        workspaceCurrentPointersUpdated,
      details: {
        workspacesCreated,
        contentGenerationsAttached,
        artifactsAttachedFromGenerations,
        workspaceCurrentPointersUpdated,
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
