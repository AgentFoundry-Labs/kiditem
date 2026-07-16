'use client';

import { PRODUCT_OPERATIONS_GRID_CLASS } from '../lib/product-list-layout';

const COLUMNS = ['상품', '재고', '방문', '조회', '장바구니', '주문', '판매', '매출', '광고비율'] as const;

export function ProductsColumnHeader() {
  return (
    <div
      role="row"
      className={`${PRODUCT_OPERATIONS_GRID_CLASS} px-4 py-3 text-[11px] font-semibold text-[var(--text-quaternary)] 2xl:px-6 2xl:text-[12px]`}
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
