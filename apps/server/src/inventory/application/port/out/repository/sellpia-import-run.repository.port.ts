import type {
  SellpiaImportExecution,
  SellpiaInventorySourceAttempt,
} from '../../in/stock/sellpia-inventory-import.port';
import type {
  SellpiaInventoryRefreshReason,
  SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export type ClaimedSellpiaManualExecution = {
  claimToken: string;
  activeGeneration: string;
  trigger: SellpiaInventoryRefreshReason;
  ownerAttempt?: true;
};

export type SellpiaOwnerBrowserExecution = {
  kind: 'browser';
  claimToken: string;
  activeGeneration: string;
  trigger: SellpiaInventoryRefreshReason;
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourceAccountKey: 'kiditem';
  /** A source-owner attempt is fenced by its token, not the begin actor. */
  ownerAttempt: true;
};

export type SellpiaFileRunClaim =
  | { kind: 'running' }
  | {
      kind: 'completed';
      runId: string;
      claimedExecution?: ClaimedSellpiaManualExecution;
    }
  | {
      kind: 'started';
      runId: string;
      attemptToken: string;
      claimedExecution?: ClaimedSellpiaManualExecution;
    };

export interface SellpiaImportRunRepositoryPort {
  beginAttempt(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    scope: SellpiaSyncScope;
    trigger?: SellpiaInventoryRefreshReason;
  }): Promise<SellpiaInventorySourceAttempt>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaInventorySourceAttempt>;

  failAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
    fileName?: string;
    contentChecksum?: string;
  }): Promise<SellpiaInventorySourceAttempt>;

  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaInventorySourceAttempt>;

  claimFileRun(input: {
    organizationId: string;
    userId: string;
    fileName: string;
    fileHash: string;
    execution: SellpiaImportExecution;
  }): Promise<SellpiaFileRunClaim>;

  markRunFailed(input: {
    organizationId: string;
    userId: string;
    runId: string;
    attemptToken: string;
    execution: SellpiaPublicationExecution;
    errorCode: 'sellpia_invalid_workbook';
    errorMessage: string;
  }): Promise<void>;
}

export type SellpiaPublicationExecution =
  | SellpiaOwnerBrowserExecution
  | (SellpiaImportExecution & ClaimedSellpiaManualExecution);

export const SELLPIA_IMPORT_RUN_REPOSITORY_PORT = Symbol(
  'SELLPIA_IMPORT_RUN_REPOSITORY_PORT',
);
