import type { Prisma } from '@prisma/client';
import { DETAIL_PAGE_REVISION_TYPE } from '../../../apps/server/src/content/domain/detail-page/detail-page-revision-type';
import type { DataMigration } from '../types';

/**
 * KID-304: `content_generations.edited_html` / `edited_html_saved_at` are
 * dropped by the schema push that follows. The detail editor has read that
 * column as a fallback when the generation's artifact has no current revision,
 * so its value moves into the revision ledger first.
 *
 * Pre-schema. For every live (not deleted) generation with edited HTML and a live artifact of its
 * own workspace, the artifact gets a `manual_edit` revision holding that HTML
 * at its save time unless one with identical HTML is already there. An artifact
 * with no current revision is pointed at that revision, which is what the
 * fallback showed; an artifact that already has one keeps the operator's pick.
 * Only the pointer moves — the artifact's `updated_at` stays, because nobody
 * edited it.
 * A generation with no live artifact gets nothing and is counted — the column's
 * value has nowhere to live once the fallback is gone (ADR-0010).
 *
 * A second run finds every revision already present and writes nothing. Any
 * failure aborts the runner's transaction, so no half-promoted state remains.
 */
export const promoteEditedHtmlToDetailPageRevisionsMigration: DataMigration = {
  id: 'v0.1.31:025_promote_edited_html_to_detail_page_revisions',
  releaseVersion: '0.1.31',
  name: 'Move content_generations.edited_html into detail-page revisions before the column is dropped',
  phase: 'pre-schema',
  async run(tx) {
    if (!(await columnExists(tx, 'content_generations', 'edited_html'))) {
      return { affectedRows: 0, details: { outcome: 'already_contracted' } };
    }

    const [counts] = await tx.$queryRaw<Array<{
      edited_generations: bigint;
      without_artifact: bigint;
      already_present: bigint;
    }>>`
      -- queryraw-tenancy-exempt: the writer-stopped cutover promotes every organization at once.
      SELECT
        count(*)::bigint AS edited_generations,
        count(*) FILTER (WHERE a.id IS NULL)::bigint AS without_artifact,
        count(*) FILTER (WHERE a.id IS NOT NULL AND EXISTS (
          SELECT 1 FROM detail_page_revisions r
          WHERE r.organization_id = a.organization_id
            AND r.artifact_id = a.id
            AND r.html = cg.edited_html
        ))::bigint AS already_present
      FROM content_generations cg
      LEFT JOIN detail_page_artifacts a
        ON a.id = cg.detail_page_artifact_id
       AND a.organization_id = cg.organization_id
       AND a.content_workspace_id = cg.content_workspace_id
       AND a.is_deleted = false
      WHERE cg.edited_html IS NOT NULL
        AND cg.is_deleted = false
    `;

    const promotedRevisions = await tx.$executeRaw`
      -- queryraw-tenancy-exempt: the writer-stopped cutover promotes every organization at once.
      INSERT INTO detail_page_revisions (
        id, organization_id, artifact_id, content_generation_id, revision_type,
        html, asset_url_map, image_urls, created_by_user_id, created_at
      )
      SELECT DISTINCT ON (a.id, cg.edited_html)
        gen_random_uuid(), cg.organization_id, a.id, cg.id, ${DETAIL_PAGE_REVISION_TYPE.manual_edit},
        cg.edited_html, '{}'::jsonb, '[]'::jsonb, cg.triggered_by_user_id,
        COALESCE(cg.edited_html_saved_at, cg.updated_at, now())
      FROM content_generations cg
      JOIN detail_page_artifacts a
        ON a.id = cg.detail_page_artifact_id
       AND a.organization_id = cg.organization_id
       AND a.content_workspace_id = cg.content_workspace_id
       AND a.is_deleted = false
      WHERE cg.edited_html IS NOT NULL
        AND cg.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM detail_page_revisions r
          WHERE r.organization_id = a.organization_id
            AND r.artifact_id = a.id
            AND r.html = cg.edited_html
        )
      ORDER BY a.id, cg.edited_html, cg.edited_html_saved_at DESC NULLS LAST, cg.id
    `;

    const currentRevisionsSet = await tx.$executeRaw`
      -- queryraw-tenancy-exempt: the writer-stopped cutover promotes every organization at once.
      UPDATE detail_page_artifacts a
      SET current_revision_id = pick.id
      FROM (
        SELECT DISTINCT ON (r.artifact_id) r.id, r.artifact_id, r.organization_id
        FROM detail_page_revisions r
        JOIN content_generations cg
          ON cg.detail_page_artifact_id = r.artifact_id
         AND cg.organization_id = r.organization_id
         AND cg.edited_html = r.html
         AND cg.is_deleted = false
        ORDER BY r.artifact_id, r.created_at DESC, r.id DESC
      ) pick
      WHERE a.id = pick.artifact_id
        AND a.organization_id = pick.organization_id
        AND a.current_revision_id IS NULL
        AND a.is_deleted = false
    `;

    return {
      affectedRows: promotedRevisions + currentRevisionsSet,
      details: {
        outcome: 'promoted',
        editedGenerations: Number(counts?.edited_generations ?? 0n),
        promotedRevisions,
        alreadyPresent: Number(counts?.already_present ?? 0n),
        currentRevisionsSet,
        withoutArtifact: Number(counts?.without_artifact ?? 0n),
      },
    };
  },
};

async function columnExists(
  tx: Prisma.TransactionClient,
  table: string,
  column: string,
): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass(${table})
        AND attname = ${column}
        AND attnum > 0
        AND NOT attisdropped
    ) AS present
  `;
  return Boolean(row?.present);
}
