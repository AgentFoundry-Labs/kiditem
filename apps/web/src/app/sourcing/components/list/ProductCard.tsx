'use client';

import { Eye, Loader2, MoreVertical, Sparkles, Trash2 } from 'lucide-react';
import SourcingStatusBadge from './SourcingStatusBadge';
import { formatKRW } from '@/lib/utils';
import type { SourcedProduct } from '../../lib/sourcing-api';

interface Props {
  product: SourcedProduct;
  isProcessing: boolean;
  isDeleting: boolean;
  onDelete: (id: string) => void;
  onNavigate: (id: string) => void;
  onOpenEditor: (id: string) => void;
}

export default function ProductCard({
  product,
  isProcessing,
  isDeleting,
  onDelete,
  onNavigate,
  onOpenEditor,
}: Props) {
  return (
    <div
      className={`bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg transition-all group relative ${
        isDeleting ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      <div
        className="aspect-[4/5] relative overflow-hidden bg-gray-100 cursor-pointer"
        onClick={() => onNavigate(product.id)}
      >
        {product.thumbnail_url ? (
          <img
            src={product.thumbnail_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
            No Image
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor(product.id);
            }}
            className="text-white font-bold py-3 px-6 rounded-full shadow-lg transform scale-95 group-hover:scale-100 transition-all flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600"
          >
            <Sparkles size={16} /> 에디터 열기
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900/80 p-3 pt-6 z-0 flex justify-between items-center text-white">
          <SourcingStatusBadge status={product.status} />
          <div className="flex items-center gap-1">
            <span className="text-[10px] bg-blue-500/80 text-white px-1.5 py-0.5 rounded font-medium">
              {product.source_platform}
            </span>
            <MoreVertical size={16} className="text-gray-300" />
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50">
        <span className="text-[10px] text-gray-500 block mb-1">
          ID: {product.id.slice(0, 8)}...
        </span>
        <h3
          className="text-sm font-bold text-gray-800 mb-3 line-clamp-1"
          title={product.name}
        >
          {product.name}
        </h3>

        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500">판매가</span>
          <span className="text-sm font-bold">
            {product.price_krw != null ? `₩${formatKRW(product.price_krw)}` : '-'}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500">원가 (CNY)</span>
          <span className="text-sm font-bold text-gray-600">
            {product.cost_cny != null ? `¥${product.cost_cny}` : '-'}
          </span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-gray-500">이미지</span>
          <span className="text-sm font-medium text-gray-600">
            {product.image_count}장
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onNavigate(product.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
          >
            <Eye size={12} /> 상세
          </button>
          <button
            onClick={() => onDelete(product.id)}
            disabled={isDeleting}
            className="flex items-center justify-center gap-1 py-2 px-3 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
