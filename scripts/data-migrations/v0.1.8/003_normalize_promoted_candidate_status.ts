import type { DataMigration } from '../types';

export const normalizePromotedCandidateStatus: DataMigration = {
  id: 'v0.1.8:003_normalize_promoted_candidate_status',
  releaseVersion: '0.1.8',
  name: 'Normalize legacy promoted sourcing candidates to sourced',
  async run(tx) {
    const affectedRows = await tx.$executeRaw`
      UPDATE sourcing_candidates
      SET status = 'sourced',
          updated_at = NOW()
      WHERE status = 'promoted'
    `;

    return {
      affectedRows,
      details: { normalizedPromotedCandidates: affectedRows },
    };
  },
};
