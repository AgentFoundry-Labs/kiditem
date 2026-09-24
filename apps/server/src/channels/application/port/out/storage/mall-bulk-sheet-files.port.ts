import type { MallSheetRow, MallSheetTemplate } from '../../../../domain/registration/bulk-sheet/mall-bulk-sheet';
import type { MallCategoryTables } from '../../../../domain/registration/bulk-sheet/mall-sheet-categories';

export const MALL_BULK_SHEET_FILES_PORT = Symbol('MALL_BULK_SHEET_FILES_PORT');

/** 몰 양식 파일 · 몰 카테고리표(저장소에 둔 자료)를 읽고, 양식에 행을 채운 새 파일을 만든다. */
export interface MallBulkSheetFilesPort {
  categoryTables(): Promise<MallCategoryTables>;
  /**
   * 양식 파일의 상품 행을 비우고 `rows` 를 채운 파일. 행이 쓰는 칸이 양식 머리행에 없으면 던진다 — 몰이 양식을
   * 바꿨는데 그대로 채우면 값이 엉뚱한 칸에 들어간다.
   */
  write(template: MallSheetTemplate, rows: readonly MallSheetRow[]): Promise<Uint8Array>;
}
