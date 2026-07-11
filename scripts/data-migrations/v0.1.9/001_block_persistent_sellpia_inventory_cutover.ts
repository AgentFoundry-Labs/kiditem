import type { DataMigration } from '../types';

const LOCAL_ONLY_ERROR = [
  'Sellpia-authoritative inventory cutover 0.1.9 is approved for local development databases only.',
  'Staging and production require a separately reviewed, backward-compatible persistent-data migration before this release can deploy.',
].join(' ');

export const blockPersistentSellpiaInventoryCutover: DataMigration = {
  id: 'v0.1.9:001_block_persistent_sellpia_inventory_cutover',
  releaseVersion: '0.1.9',
  name: 'Block persistent Sellpia inventory cutover until a preservation migration is approved',
  phase: 'pre-schema',
  async run(_tx, context) {
    const target = context?.target;
    if (target !== 'local') {
      throw new Error(`${LOCAL_ONLY_ERROR} Received target: ${target ?? 'unset'}.`);
    }

    return {
      affectedRows: 0,
      details: {
        target,
        deployable: false,
        note: 'Rebuild from approved Sellpia and Coupang workbooks after a verified local reset.',
      },
    };
  },
};
