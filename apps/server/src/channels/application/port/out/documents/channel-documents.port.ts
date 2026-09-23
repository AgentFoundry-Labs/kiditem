import type { ParsedWingCatalogWorkbook, ParsedRocketSellpiaMatchingCsv, ParsedSabangnetWorkbook, SabangnetProductRow } from './channel-document.models';
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
  /**
   * 저장된 사방넷 상품 원문을 그 줄을 읽었던 매핑으로 다시 읽는다(다시 가져오기의 기준값). 상세는 원문에
   * 디지스트로만 있어 기준값에 들지 않는다. 읽을 수 없으면 null.
   */
  readSabangnetProductSource(sourceRaw: unknown): SabangnetProductRow | null;
  exportWingRegistration(template: Uint8Array, products: unknown, fileName?: string): GeneratedChannelFile & { productCount: number };
  exportWingInventory(products: unknown, now: Date, fileName?: string): GeneratedChannelFile & { columns: string[] };
}
