import type { DataMigration } from '../types';

export const recordRocketReadModelRelease: DataMigration = {
  id: 'v0.1.6:001_record_rocket_read_model_release',
  releaseVersion: '0.1.6',
  name: 'Record Rocket read model release',
  async run() {
    return {
      affectedRows: 0,
      details: {
        note:
          'No data backfill required; Rocket purchase order read models are populated from supplier extension collection.',
      },
    };
  },
};
