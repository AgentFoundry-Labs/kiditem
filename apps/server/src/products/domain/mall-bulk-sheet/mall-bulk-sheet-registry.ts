import { coupangWingSheet } from './coupang-wing.sheet';
import { elevenstSheet } from './elevenst.sheet';
import { esmSheet } from './esm.sheet';
import { kidsnoteSheet } from './kidsnote.sheet';
import type { MallBulkSheetSpec } from './mall-bulk-sheet';

/**
 * 몰 대량등록 엑셀 규칙 목록. 몰을 늘리는 일 = 양식 파일 하나 + 규칙 파일 하나 + 여기 한 줄.
 *
 * 신규 등록 엑셀이 없는 몰(롯데ON · 카카오 · 올웨이즈 · 꼬망세)은 폼 채우기 등록으로 간다(ADR-0015).
 */
export const MALL_BULK_SHEETS: readonly MallBulkSheetSpec[] = [
  esmSheet,
  elevenstSheet,
  coupangWingSheet,
  kidsnoteSheet,
];

export function findMallBulkSheet(sheetKey: string): MallBulkSheetSpec | null {
  return MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === sheetKey) ?? null;
}
