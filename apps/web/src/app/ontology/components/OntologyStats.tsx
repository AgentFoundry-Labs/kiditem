'use client';

import { Package, Layers, Tag } from 'lucide-react';

interface Props {
  productCount: number;
  totalCategories: number;
  totalBrands: number;
}

export function OntologyStats({ productCount, totalCategories, totalBrands }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Package className="w-4 h-4" />
          전체 상품
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{productCount}</div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Layers className="w-4 h-4" />
          카테고리
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{totalCategories}</div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Tag className="w-4 h-4" />
          브랜드
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{totalBrands}</div>
      </div>
    </div>
  );
}
