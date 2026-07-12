import type { DataMigration } from '../types';

type PromotedCandidateCollision = {
  issueCode: string;
  rowId: string;
  details: unknown;
};

export const normalizePromotedCandidateStatus: DataMigration = {
  id: 'v0.1.8:003_normalize_promoted_candidate_status',
  releaseVersion: '0.1.8',
  name: 'Normalize legacy promoted sourcing candidates to sourced',
  async run(tx) {
    const collisions = await tx.$queryRaw<PromotedCandidateCollision[]>`
      WITH colliding_source_identities AS (
        SELECT candidate.organization_id,
               candidate.source_url,
               MIN(candidate.id::text) AS row_id,
               COUNT(*)::int AS active_candidate_count
        FROM sourcing_candidates AS candidate
        WHERE candidate.is_deleted = FALSE
          AND candidate.status IN ('sourced', 'promoted')
        GROUP BY candidate.organization_id, candidate.source_url
        HAVING COUNT(*) > 1
           AND BOOL_OR(candidate.status = 'promoted')
      )
      SELECT 'promoted_source_url_collision'::text AS "issueCode",
             collision.row_id AS "rowId",
             jsonb_build_object(
               'organizationId', collision.organization_id,
               'sourceUrl', collision.source_url,
               'activeCandidateCount', collision.active_candidate_count
             ) AS details
      FROM colliding_source_identities AS collision
      ORDER BY collision.organization_id, collision.source_url, collision.row_id
      LIMIT 20
    `;
    if (collisions.length > 0) {
      throw new Error(
        `Promoted candidate normalization collision: ${JSON.stringify(collisions)}`,
      );
    }

    const normalizedPromotedCandidates = await tx.$executeRaw`
      UPDATE sourcing_candidates
      SET status = 'sourced',
          updated_at = NOW()
      WHERE status = 'promoted'
    `;
    const archivedLegacyProductPreparations = await tx.$executeRaw`
      UPDATE product_preparations
      SET status = 'cancelled',
          is_deleted = TRUE,
          deleted_at = COALESCE(deleted_at, NOW()),
          is_current_for_master = FALSE,
          updated_at = NOW()
      WHERE status = 'product_registered'
        AND channel_account_id IS NULL
        AND is_deleted = FALSE
    `;

    return {
      affectedRows: normalizedPromotedCandidates + archivedLegacyProductPreparations,
      details: {
        normalizedPromotedCandidates,
        archivedLegacyProductPreparations,
      },
    };
  },
};
