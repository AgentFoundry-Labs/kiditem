import type { ParsedWingCatalogWorkbook, ParsedRocketSellpiaMatchingCsv, ParsedSabangnetWorkbook, SabangnetProductRow } from './channel-document.models';
import type { SabangnetDetailDigests } from '../../../../domain/sales-product/sales-product-reimport-merge';
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
   * 디지스트로만 있고, 디지스트를 남기기 전 원문이면 `detailDigests` 가 null 이다. 읽을 수 없으면 null.
   */
  readSabangnetProductSource(sourceRaw: unknown): { row: SabangnetProductRow; detailDigests: SabangnetDetailDigests | null } | null;
  /**
   * 시스템이 상세를 고쳐 쓸 때 원문의 상세 디지스트를 함께 옮긴다. 고치기 전 상세가 기준값과 같았던 칸만
   * 옮기고, 사람이 고친 상세는 그대로 둔다. 바꿀 것이 없으면 null.
   */
  restampSabangnetDetailDigests(
    sourceRaw: unknown,
    before: { detailHtml: string | null; extraDetailHtml: readonly string[] },
    after: { detailHtml: string | null; extraDetailHtml: readonly string[] },
  ): Record<string, unknown> | null;
  exportWingRegistration(template: Uint8Array, products: unknown, fileName?: string): GeneratedChannelFile & { productCount: number };
  exportWingInventory(products: unknown, now: Date, fileName?: string): GeneratedChannelFile & { columns: string[] };
}
