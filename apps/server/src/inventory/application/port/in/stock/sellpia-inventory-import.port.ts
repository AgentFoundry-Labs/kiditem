import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type { ParsedSellpiaInventoryWorkbook } from '../../../service/sellpia-inventory-workbook.parser';

export const SELLPIA_INVENTORY_IMPORT_PORT = Symbol('SELLPIA_INVENTORY_IMPORT_PORT');

export type ImportSellpiaInventoryInput = ParsedSellpiaInventoryWorkbook & {
  organizationId: string;
  userId: string;
  fileName: string;
  fileHash: string;
};

export interface SellpiaInventoryImportPort {
  importInventory(
    input: ImportSellpiaInventoryInput,
  ): Promise<SellpiaInventoryImportResponse>;
}
