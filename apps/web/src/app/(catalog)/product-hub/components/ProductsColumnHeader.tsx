'use client';

const COLUMNS = ['상품', '등급', '현재고', '월 평균', '매출', '판매', '원가', '매출총이익', '총이익률'] as const;

/** Keep the row and header on the same grid so monthly facts stay readable. */
export const PRODUCT_ROW_GRID =
  'grid grid-cols-[minmax(340px,1.3fr)_repeat(8,minmax(74px,.42fr))_72px] items-center gap-3';

/** Include each row's horizontal padding so its grid never overflows its clipped card. */
export const PRODUCT_TABLE_MIN_WIDTH = 'min-w-[1164px]';

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
