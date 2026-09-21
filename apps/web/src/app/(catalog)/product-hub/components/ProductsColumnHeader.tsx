'use client';

const COLUMNS = ['상품', '등급', '재고', '월 평균', '매출', '판매', '원가', '매출총이익', '총이익률'] as const;

/**
 * 상품 줄의 열 — 머리글과 줄이 이 한 줄을 같이 쓴다(사장님 2026-09-21: "정렬이랑 이런것도
 * 좀 맞춰줘라 열에 맞게"). 여기만 고치면 둘이 같이 움직인다.
 */
export const PRODUCT_ROW_GRID =
  'grid grid-cols-[minmax(340px,1.3fr)_repeat(8,minmax(74px,.42fr))_72px] items-center gap-3';

export function ProductsColumnHeader() {
  return (
    <div
      role="row"
      className={`${PRODUCT_ROW_GRID} px-6 py-3 text-[12px] font-semibold text-[var(--text-quaternary)]`}
    >
      {COLUMNS.map((column, index) => (
        <span key={column} role="columnheader" className={index === 0 ? undefined : 'text-right'}>
          {column}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}
