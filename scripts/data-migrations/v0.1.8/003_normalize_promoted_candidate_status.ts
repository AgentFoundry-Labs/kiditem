import type { DataMigration } from '../types';

export const normalizePromotedCandidateStatus: DataMigration = {
  id: 'v0.1.8:003_normalize_promoted_candidate_status',
  releaseVersion: '0.1.8',
  name: 'Normalize legacy promoted sourcing candidates to sourced',
  async run(tx) {
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
