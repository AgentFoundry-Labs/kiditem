export function ProductsColumnHeader() {
  return (
    <div className="grid grid-cols-[minmax(300px,1.5fr)_minmax(140px,.7fr)_120px_120px_100px_64px] items-center gap-4 px-6 py-2 text-[11px] font-semibold text-[var(--text-quaternary)]">
      <span>Sellpia 상품</span>
      <span>바코드</span>
      <span className="text-right">매입가</span>
      <span className="text-right">판매가</span>
      <span className="text-right">현재 재고</span>
      <span />
    </div>
  );
}
