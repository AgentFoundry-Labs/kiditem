import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type { SellpiaInventoryRefreshReason } from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_INVENTORY_IMPORT_PORT = Symbol('SELLPIA_INVENTORY_IMPORT_PORT');

export type SellpiaImportExecution =
  | {
      kind: 'browser';
      claimToken: string;
      activeGeneration: string;
      trigger: SellpiaInventoryRefreshReason;
      sourceOrigin: 'https://kiditem.sellpia.com';
      sourceAccountKey: 'kiditem';
    }
  | {
      kind: 'manual';
      manualFreshExportConfirmed: true;
    };

export type ImportSellpiaInventoryInput = {
  organizationId: string;
  userId: string;
  file: { buffer: Buffer; fileName: string; mimeType: string };
  execution: SellpiaImportExecution;
};

export interface SellpiaInventoryImportPort {
  importInventory(
    input: ImportSellpiaInventoryInput,
  ): Promise<SellpiaInventoryImportResponse>;
}
