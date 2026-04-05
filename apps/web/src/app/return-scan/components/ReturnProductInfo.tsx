'use client';

import { PackagePlus, Loader2 } from 'lucide-react';

interface ProductInfo {
  id: string;
  name: string;
  sku: string | null;
  currentStock: number;
}

interface Props {
  product: ProductInfo;
  processing: boolean;
  onRecovery: () => void;
}

export default function ReturnProductInfo({
  product,
  processing,
  onRecovery,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-blue-200">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          반품 상품 정보
        </h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-slate-500">상품명</div>
            <div className="text-sm font-medium">{product.name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">SKU</div>
            <div className="text-sm font-mono">{product.sku || '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">현재 재고</div>
            <div className="text-sm">{product.currentStock}개</div>
          </div>
        </div>
        <button
          onClick={onRecovery}
          disabled={processing}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {processing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <PackagePlus size={16} />
          )}
          회수 완료 (재고 +1)
        </button>
      </div>
    </div>
  );
}
