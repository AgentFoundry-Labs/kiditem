import { coupangWingSheet } from './coupang-wing.sheet';
import { elevenstSheet } from './elevenst.sheet';
import { esmSheet } from './esm.sheet';
import { kidsnoteSheet } from './kidsnote.sheet';
import { kkomangseSheet } from './kkomangse.sheet';
import { teachervilleSheet } from './teacherville.sheet';
import { thirtymallSheet } from './thirtymall.sheet';
import type { MallBulkSheetSpec } from './mall-bulk-sheet';

/**
 * 몰 대량등록 엑셀 규칙 목록. 몰을 늘리는 일 = 양식 파일 하나 + 규칙 파일 하나 + 여기 한 줄.
 *
 * 신규 등록 엑셀이 없는 몰(롯데ON · 카카오 · 올웨이즈)은 폼 채우기 등록으로 간다(ADR-0015).
 */
export const MALL_BULK_SHEETS: readonly MallBulkSheetSpec[] = [
  esmSheet,
  elevenstSheet,
  coupangWingSheet,
  kidsnoteSheet,
  thirtymallSheet,
  teachervilleSheet,
  kkomangseSheet,
];

/**
 * 신규 등록 엑셀이 없는 몰(2026-09-20 공개 자료 · 판매자센터 조사, Linear KID-265). 이 몰은 폼 채우기 등록으로 간다.
 * 쇼핑몰 현황의 대량등록 칸이 '불가'로 읽는다.
 */
export const MALL_BULK_SHEET_UNAVAILABLE: readonly { mallKey: string; reason: string }[] = [
  { mallKey: 'lotte-on', reason: '롯데ON은 신규 등록 엑셀이 없습니다(일괄수정만). 상품등록 폼으로 올립니다.' },
  { mallKey: 'kakao', reason: '카카오 톡스토어는 신규 등록 엑셀이 없습니다(상품 안의 옵션 엑셀만). 상품등록 폼으로 올립니다.' },
  { mallKey: 'always', reason: '올웨이즈는 자체 등록 엑셀이 없습니다(수정용 엑셀만). 상품등록 폼으로 올립니다.' },
];

export function findMallBulkSheet(sheetKey: string): MallBulkSheetSpec | null {
  return MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === sheetKey) ?? null;
}
