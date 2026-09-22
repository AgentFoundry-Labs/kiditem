import type {
  SellpiaManualMatchAttempt,
  SellpiaManualMatchPublicAttempt,
  SellpiaManualMatchSourceStatus,
} from '@kiditem/shared/sellpia-manual-match';

export const SELLPIA_MANUAL_MATCH_PORT = Symbol('SELLPIA_MANUAL_MATCH_PORT');

export interface SellpiaManualMatchPort {
  targets(organizationId: string): Promise<{
    version: 1;
    sourceOrigin: 'https://kiditem.sellpia.com';
    sourcePath: '/product_manual_match.html';
    targetCount: number;
    targetCodes: string[];
    currentSnapshot: {
      snapshotHash: string;
      capturedAt: string | Date;
      targetCount: number;
      matchedTargetCount: number;
      aliasCount: number;
    } | null;
  }>;
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
  }): Promise<SellpiaManualMatchAttempt>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchAttempt>;
  readCurrent(organizationId: string): Promise<SellpiaManualMatchSourceStatus>;
  completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    snapshot: unknown;
  }): Promise<SellpiaManualMatchAttempt>;
  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaManualMatchAttempt>;
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchPublicAttempt>;
  findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<
    import('../../out/repository/sellpia-manual-match.repository.port').SellpiaManualMatchAliasRecord[]
  >;
}
