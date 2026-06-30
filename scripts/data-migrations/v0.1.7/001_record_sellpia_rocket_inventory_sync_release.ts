import type { DataMigration } from '../types';

export const recordSellpiaRocketInventorySyncRelease: DataMigration = {
  id: 'v0.1.7:001_record_sellpia_rocket_inventory_sync_release',
  releaseVersion: '0.1.7',
  name: 'Record Sellpia Rocket inventory sync release',
  async run() {
    return {
      affectedRows: 0,
      details: {
        note:
          'No data backfill required; Sellpia/Rocket inventory sync tables are created empty and populated by operator imports and Rocket stock events.',
      },
    };
  },
};
