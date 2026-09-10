import type {
  SellpiaManualMatchAttempt,
  SellpiaManualMatchSnapshot,
  SellpiaManualMatchSnapshotStatus,
  SellpiaManualMatchSourceStatus,
} from '@kiditem/shared/sellpia-manual-match';

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

export type SellpiaManualMatchAttemptInput = {
  organizationId: string;
  idempotencyKey: string;
};

export interface SellpiaManualMatchRepositoryPort {
  getCurrentStatus(
    organizationId: string,
  ): Promise<SellpiaManualMatchSnapshotStatus | null>;
  findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]>;
  beginAttempt(input: SellpiaManualMatchAttemptInput): Promise<SellpiaManualMatchAttempt>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchAttempt>;
  readCurrent(input: {
    organizationId: string;
  }): Promise<SellpiaManualMatchSourceStatus>;
  completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    snapshot: SellpiaManualMatchSnapshot;
  }): Promise<SellpiaManualMatchAttempt>;
  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaManualMatchAttempt>;
}
