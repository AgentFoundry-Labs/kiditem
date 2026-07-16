'use client';

const COLUMNS = ['상품', '재고', '방문', '조회', '장바구니', '주문', '판매', '매출', '광고비율'] as const;

export function ProductsColumnHeader() {
  return (
    <div
      role="row"
      className="grid grid-cols-[minmax(420px,1.45fr)_repeat(8,minmax(76px,.42fr))_72px] items-center gap-4 px-6 py-3 text-[12px] font-semibold text-[var(--text-quaternary)]"
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
