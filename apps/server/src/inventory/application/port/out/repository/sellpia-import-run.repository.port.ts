import type {
  SellpiaInventoryRefreshReason,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type {
  SellpiaImportExecution,
} from '../../in/stock/sellpia-inventory-import.port';

export type ClaimedSellpiaImportExecution = {
  claimToken: string;
  activeGeneration: string;
  trigger: SellpiaInventoryRefreshReason;
};

export type SellpiaFileRunClaim =
  | { kind: 'running' }
  | {
      kind: 'completed';
      runId: string;
      claimedExecution?: ClaimedSellpiaImportExecution;
    }
  | {
      kind: 'started';
      runId: string;
      attemptToken: string;
      claimedExecution?: ClaimedSellpiaImportExecution;
    };

export interface SellpiaImportRunRepositoryPort {
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
  | Extract<SellpiaImportExecution, { kind: 'browser' }>
  | (Extract<SellpiaImportExecution, { kind: 'manual' }>
    & ClaimedSellpiaImportExecution);

export const SELLPIA_IMPORT_RUN_REPOSITORY_PORT = Symbol(
  'SELLPIA_IMPORT_RUN_REPOSITORY_PORT',
);
