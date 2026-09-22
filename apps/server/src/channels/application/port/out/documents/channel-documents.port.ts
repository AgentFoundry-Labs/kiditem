import type { ParsedWingCatalogWorkbook, ParsedRocketSellpiaMatchingCsv, ParsedSabangnetWorkbook } from './channel-document.models';
import type { CoupangCatalogEdit, CoupangCatalogEditResult, CoupangCatalogSheet } from '../../../../domain/registration/bulk-sheet/coupang-catalog-edit';
export const CHANNEL_DOCUMENTS_PORT = Symbol('CHANNEL_DOCUMENTS_PORT');
export interface GeneratedChannelFile {
  buffer: Uint8Array;
  fileName: string;
  contentType: string;
  rowCount: number;
}
export interface ChannelDocumentsPort {
  readCoupangCatalog(bytes: Uint8Array): CoupangCatalogSheet;
  applyCoupangCatalog(bytes: Uint8Array, edits: readonly CoupangCatalogEdit[]): CoupangCatalogEditResult;
  parseWingWorkbook(bytes: Uint8Array): ParsedWingCatalogWorkbook;
  parseRocketMatchingCsv(bytes: Uint8Array): ParsedRocketSellpiaMatchingCsv;
  parseSabangnetWorkbook(bytes: Uint8Array, name: string): ParsedSabangnetWorkbook;
  exportWingRegistration(template: Uint8Array, products: unknown, fileName?: string): GeneratedChannelFile & { productCount: number };
  exportWingInventory(products: unknown, now: Date, fileName?: string): GeneratedChannelFile & { columns: string[] };
}
