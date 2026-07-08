import type { DataMigration } from '../types';

export const normalizeSellpiaRecommendedSnapshotItems: DataMigration = {
  id: 'v0.1.7:002_normalize_sellpia_recommended_snapshot_items',
  releaseVersion: '0.1.7',
  name: 'Normalize legacy Sellpia recommended snapshot items',
  async run(tx) {
    const affectedRows = await tx.$executeRaw`
      UPDATE sellpia_stock_snapshot_items
      SET status = 'needs_review',
          updated_at = NOW()
      WHERE status = 'recommended'
    `;

    return {
      affectedRows,
      details: {
        normalizedStatus: 'recommended -> needs_review',
      },
    };
  },
};
