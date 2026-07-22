/**
 * 로켓 미리보기 표의 셀피아 재고 기준 자동채움(순수). 매칭 성공 시 미등록·미편집 행만
 * 서버 공동할당 confirmQuantity 로 채우고, 사용자가 만진 행(touched)과 등록상품(레시피)은 보존한다.
 */

export type AutoFillRow = {
  poLineId: string;
  orderQuantity: number;
  /** 등록상품(ProductVariant 레시피 있음)이면 true — 백엔드 추천값을 유지하고 자동채움 대상에서 제외. */
  hasRecipe: boolean;
};

export type AutoFillMatch = {
  matched: boolean;
  /** 서버 공동할당 확정수량(발주 단위). */
  confirmQuantity: number;
};

/** 미등록·미편집 행만 서버 confirmQuantity 로 채운 확정수량 맵. 편집 행·등록 행은 그대로. */
export function computeStockAutoFillQuantities(
  rows: AutoFillRow[],
  matchByLineId: Map<string, AutoFillMatch>,
  touched: Set<string>,
  current: Record<string, number>,
): Record<string, number> {
  const next = { ...current };
  for (const row of rows) {
    if (row.hasRecipe || touched.has(row.poLineId)) continue;
    const match = matchByLineId.get(row.poLineId);
    next[row.poLineId] = match?.matched ? match.confirmQuantity : 0;
  }
  return next;
}

/** 부족(확정<발주) 미등록·미편집 행에 기본 사유를 적용하고, 전량 확정이면 제거. */
export function computeStockAutoFillReasons<Reason extends string>(
  rows: AutoFillRow[],
  quantities: Record<string, number>,
  touched: Set<string>,
  current: Record<string, Reason>,
  defaultReason: Reason,
): Record<string, Reason> {
  const next = { ...current };
  for (const row of rows) {
    if (row.hasRecipe || touched.has(row.poLineId)) continue;
    const qty = quantities[row.poLineId] ?? 0;
    if (qty < row.orderQuantity) next[row.poLineId] = defaultReason;
    else delete next[row.poLineId];
  }
  return next;
}
