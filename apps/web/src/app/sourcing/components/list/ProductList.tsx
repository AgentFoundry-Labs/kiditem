'use client';

import { AlertCircle } from 'lucide-react';
import type { SourcedProduct } from '../../lib/sourcing-api';
import SkeletonCard from './SkeletonCard';
import ProductCard from './ProductCard';

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
      <div className="flex items-center gap-2 mb-4">
        <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
        <span className="text-sm font-medium text-slate-500">전체 선택</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-200 mb-4">
            <AlertCircle size={24} className="text-slate-400" />
          </div>
          <p className="font-bold text-slate-800 text-lg mb-2">수집된 상품이 없습니다.</p>
          <p className="text-sm">URL 수집이나 상세페이지 생성을 통해 첫 상품을 등록해 보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isProcessing={processingIds.has(product.id) || product.status === 'PROCESSING'}
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
