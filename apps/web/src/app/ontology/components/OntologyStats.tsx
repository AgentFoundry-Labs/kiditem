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
      <div className="card">
        <div className="flex items-center gap-2 card-label">
          <Package className="w-4 h-4" />
          전체 상품
        </div>
        <div className="card-value">{productCount}</div>
      </div>
      <div className="card">
        <div className="flex items-center gap-2 card-label">
          <Layers className="w-4 h-4" />
          카테고리
        </div>
        <div className="card-value">{totalCategories}</div>
      </div>
      <div className="card">
        <div className="flex items-center gap-2 card-label">
          <Tag className="w-4 h-4" />
          브랜드
        </div>
        <div className="card-value">{totalBrands}</div>
      </div>
    </div>
  );
}
