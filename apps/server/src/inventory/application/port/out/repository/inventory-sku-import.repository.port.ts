import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type { ParsedSellpiaInventoryRow } from '../../../service/sellpia-inventory-workbook.parser';

export type ImportClaim =
  | { kind: 'started'; runId: string; attemptToken: string }
  | { kind: 'duplicate'; response: SellpiaInventoryImportResponse }
  | { kind: 'running' };

export interface InventorySkuImportRepositoryPort {
  claimSellpiaImport(input: {
    organizationId: string;
    userId: string;
    fileName: string;
    fileHash: string;
    rowCount: number;
  }): Promise<ImportClaim>;

  replaceSellpiaSnapshot(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    rows: ParsedSellpiaInventoryRow[];
  }): Promise<SellpiaInventoryImportResponse>;

  markImportFailed(
    organizationId: string,
    runId: string,
    attemptToken: string,
  ): Promise<void>;
}

export const INVENTORY_SKU_IMPORT_REPOSITORY_PORT = Symbol(
  'INVENTORY_SKU_IMPORT_REPOSITORY_PORT',
);
