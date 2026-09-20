import { artgongguSheet } from './artgonggu.sheet';
import { coupangWingSheet } from './coupang-wing.sheet';
import { domeggookSheet } from './domeggook.sheet';
import { elevenstSheet } from './elevenst.sheet';
import { esmSheet } from './esm.sheet';
import { kidsnoteSheet } from './kidsnote.sheet';
import { kkomangseSheet } from './kkomangse.sheet';
import { lotteonSheet } from './lotteon.sheet';
import { teachervilleSheet } from './teacherville.sheet';
import { thirtymallSheet } from './thirtymall.sheet';
import type { MallBulkSheetSpec } from './mall-bulk-sheet';

/**
 * 몰 대량등록 엑셀 규칙 목록. 몰을 늘리는 일 = 양식 파일 하나 + 규칙 파일 하나 + 여기 한 줄.
 *
 * 신규 등록 엑셀이 없는 몰(카카오 · 올웨이즈)은 폼 채우기 등록으로 간다(ADR-0015). 올웨이즈는 플레이오토를 거쳐야
 * 대량등록이 되고(사장님 2026-09-20 "이건 못하겠다"), 카카오는 상품 안의 옵션 엑셀만 있다.
 */
export const MALL_BULK_SHEETS: readonly MallBulkSheetSpec[] = [
  esmSheet,
  elevenstSheet,
  coupangWingSheet,
  kidsnoteSheet,
  thirtymallSheet,
  teachervilleSheet,
  kkomangseSheet,
  lotteonSheet,
  domeggookSheet,
  artgongguSheet,
];

/**
 * 신규 등록 엑셀이 없는 몰(2026-09-20 공개 자료 · 판매자센터 조사, Linear KID-265). 이 몰은 폼 채우기 등록으로 간다.
 * 쇼핑몰 현황의 대량등록 칸이 '불가'로 읽는다.
 */
export const MALL_BULK_SHEET_UNAVAILABLE: readonly { mallKey: string; reason: string }[] = [
  { mallKey: 'kakao', reason: '카카오 톡스토어는 신규 등록 엑셀이 없습니다(상품 안의 옵션 엑셀만). 상품등록 폼으로 올립니다.' },
  { mallKey: 'always', reason: '올웨이즈 대량등록은 플레이오토를 거쳐야 합니다. 상품등록 폼으로 올립니다.' },
];

export function findMallBulkSheet(sheetKey: string): MallBulkSheetSpec | null {
  return MALL_BULK_SHEETS.find((sheet) => sheet.sheetKey === sheetKey) ?? null;
}
