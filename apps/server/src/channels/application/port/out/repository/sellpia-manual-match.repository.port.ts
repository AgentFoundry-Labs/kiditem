import type { SellpiaManualMatchSnapshotStatus } from '@kiditem/shared/sellpia-manual-match';

export const SELLPIA_MANUAL_MATCH_REPOSITORY_PORT = Symbol(
  'SELLPIA_MANUAL_MATCH_REPOSITORY_PORT',
);

export type SellpiaManualMatchAliasRecord = {
  sellpiaInventorySkuId: string;
  aliasTitle: string;
  normalizedAlias: string;
  itemCount: number;
  matchedType: 'M' | 'P' | 'E';
  evidenceCount: number;
};

export interface SellpiaManualMatchRepositoryPort {
  getCurrentStatus(
    organizationId: string,
  ): Promise<SellpiaManualMatchSnapshotStatus | null>;
  findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]>;
  listCurrentChannelAliasCandidates(
    organizationId: string,
  ): Promise<string[]>;
  replaceCurrent(input: {
    organizationId: string;
    status: SellpiaManualMatchSnapshotStatus;
    rows: SellpiaManualMatchAliasRecord[];
  }): Promise<SellpiaManualMatchSnapshotStatus>;
}
