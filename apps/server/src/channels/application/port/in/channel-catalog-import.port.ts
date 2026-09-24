import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';

export const CHANNEL_CATALOG_IMPORT_PORT = Symbol('CHANNEL_CATALOG_IMPORT_PORT');

export type ImportCoupangWingCatalogInput = {
  bytes: Uint8Array;
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
