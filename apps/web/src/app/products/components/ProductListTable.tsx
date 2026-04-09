'use client';
import type { ProductListItem as Product } from "@kiditem/shared";
import { Pagination } from "@/components/ui/Pagination";
import ProductListItem from "./ProductListItem";

interface ProductListTableProps {
  displayProducts: Product[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function ProductListTable({
  displayProducts, page, pageSize, total, onPageChange,
}: ProductListTableProps) {
  if (displayProducts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        등록된 상품이 없습니다.
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="flex items-center px-5 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8" />
          <div className="w-[60px]" />
        </div>
        <div className="flex-1 min-w-0 ml-4" />
        <div className="flex items-center shrink-0">
          <div className="w-[72px] text-right text-xs font-medium text-slate-400">옵션</div>
          <div className="w-[80px] text-right text-xs font-medium text-slate-400">방문자▼</div>
          <div className="w-[72px] text-right text-xs font-medium text-slate-400">조회▼</div>
          <div className="w-[80px] text-right text-xs font-medium text-slate-400">장바구니▼</div>
          <div className="w-[72px] text-right text-xs font-medium text-slate-400">주문▼</div>
          <div className="w-[88px] text-right text-xs font-medium text-slate-400">판매량</div>
          <div className="w-[120px] text-right text-xs font-medium text-slate-400">매출 (원) ▼</div>
        </div>
      </div>
      {displayProducts.map((p, index) => (
        <ProductListItem
          key={p.id}
          product={p}
          rank={(page - 1) * pageSize + index + 1}
        />
      ))}
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
