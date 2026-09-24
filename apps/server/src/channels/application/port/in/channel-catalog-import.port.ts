import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';

export const CHANNEL_CATALOG_IMPORT_PORT = Symbol('CHANNEL_CATALOG_IMPORT_PORT');

export type ImportCoupangWingCatalogInput = {
  bytes: Uint8Array;
  organizationId: string;
  userId: string;
  channelAccountId: string;
  fileName: string;
  fileHash: string;
  /**
   * 운영자가 윙에 엑셀 내보내기를 요청한 시각(ISO 8601). 엑셀 값은 이 시각의 스냅샷이다.
   * 없으면 가져온 시각을 쓴다 (KID-349).
   */
  observedAt?: string;
};

export interface ChannelCatalogImportPort {
  importCoupangWing(
    input: ImportCoupangWingCatalogInput,
  ): Promise<CoupangWingCatalogImportResponse>;
}
