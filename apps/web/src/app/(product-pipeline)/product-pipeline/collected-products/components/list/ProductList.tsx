'use client';

import { AlertCircle } from 'lucide-react';
import SkeletonCard from './SkeletonCard';
import ProductCard from './ProductCard';
import { isInProgress, type SourcedProduct } from '../../lib/sourcing-api';

interface Props {
  isLoading: boolean;
  products: SourcedProduct[];
  processingIds: Set<string>;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onNavigate: (id: string) => void;
  onOpenEditor: (id: string) => void;
}

export default function ProductList({
  isLoading,
  products,
  processingIds,
  deletingId,
  onDelete,
  onNavigate,
  onOpenEditor,
}: Props) {
  return (
    <>
      <label className="inline-flex items-center gap-1.5 mb-3 cursor-pointer">
        <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500" />
        <span className="text-xs font-medium text-slate-500">전체 선택</span>
      </label>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-200 mb-4">
            <AlertCircle size={24} className="text-slate-400" />
          </div>
          <p className="font-bold text-slate-800 text-lg mb-2">수집된 상품이 없습니다.</p>
          <p className="text-sm">1688 URL 수집이나 엑셀 수집으로 첫 상품을 등록해 보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isProcessing={processingIds.has(product.id) || isInProgress(product.status)}
              isDeleting={deletingId === product.id}
              onDelete={onDelete}
              onNavigate={onNavigate}
              onOpenEditor={onOpenEditor}
            />
          ))}
        </div>
      )}
    </>
  );
}
