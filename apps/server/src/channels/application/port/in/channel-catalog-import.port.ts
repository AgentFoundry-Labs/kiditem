import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import type { ParsedWingCatalogWorkbook } from '../../service/coupang-wing-workbook.parser';

export const CHANNEL_CATALOG_IMPORT_PORT = Symbol('CHANNEL_CATALOG_IMPORT_PORT');

export type ImportCoupangWingCatalogInput = ParsedWingCatalogWorkbook & {
  organizationId: string;
  userId: string;
  channelAccountId: string;
  fileName: string;
  fileHash: string;
};

export interface ChannelCatalogImportPort {
  importCoupangWing(
    input: ImportCoupangWingCatalogInput,
  ): Promise<CoupangWingCatalogImportResponse>;
}
