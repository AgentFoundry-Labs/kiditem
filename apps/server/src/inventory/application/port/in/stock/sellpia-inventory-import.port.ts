import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type {
  SellpiaInventoryCollectionTrigger,
  SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_INVENTORY_IMPORT_PORT = Symbol('SELLPIA_INVENTORY_IMPORT_PORT');

export type SellpiaImportExecution = {
  kind: 'manual';
  manualFreshExportConfirmed: true;
};

export type ImportSellpiaInventoryInput = {
  organizationId: string;
  userId: string;
  file: { buffer: Buffer; fileName: string; mimeType: string };
  execution: SellpiaImportExecution;
};

export type SellpiaInventorySourcePlan = {
  sourceType: 'sellpia_inventory';
  parserVersion: 'sellpia-inventory-v1';
  scope: SellpiaSyncScope;
  trigger: SellpiaInventoryCollectionTrigger;
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourceAccountKey: 'kiditem';
  generation: string;
};

export type SellpiaInventorySourceAttempt = {
  attemptId: string;
  attemptToken: string;
  generation: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: SellpiaInventorySourcePlan;
  expiresAt: string;
  actualCutoffAt: string | null;
  fileName: string | null;
  fileHash: string | null;
  contentChecksum: string | null;
  rowCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export interface SellpiaInventoryImportPort {
  importInventory(
    input: ImportSellpiaInventoryInput,
  ): Promise<SellpiaInventoryImportResponse>;

  beginAttempt(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    scope: SellpiaSyncScope;
    trigger?: SellpiaInventoryCollectionTrigger;
  }): Promise<SellpiaInventorySourceAttempt>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaInventorySourceAttempt>;

  completeAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    file: { buffer: Buffer; fileName: string; mimeType: string };
    manualFreshExportConfirmed?: true;
  }): Promise<SellpiaInventorySourceAttempt>;

  failAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaInventorySourceAttempt>;

  /** Operator stop without the attempt token; a terminal attempt is returned unchanged. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaInventorySourceAttempt>;
}
