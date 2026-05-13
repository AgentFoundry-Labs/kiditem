'use client';

import { AlertCircle } from 'lucide-react';
import { ProductContentCard } from './ProductContentCard';
import type { ProductContentCardItem } from '../lib/product-content-api';

interface ProductContentGridProps {
  items: ProductContentCardItem[];
  isLoading: boolean;
}

export function ProductContentGrid({ items, isLoading }: ProductContentGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="flex min-h-[320px] animate-pulse flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="aspect-[4/3] bg-[var(--surface-sunken)]" />
            <div className="space-y-3 p-3">
              <div className="h-3 w-20 rounded bg-[var(--surface-sunken)]" />
              <div className="h-4 w-full rounded bg-[var(--surface-sunken)]" />
              <div className="h-4 w-4/5 rounded bg-[var(--surface-sunken)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          <AlertCircle size={24} />
        </div>
        <p className="text-base font-black text-[var(--text-primary)]">생성된 상품 콘텐츠가 없습니다.</p>
        <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
          상세페이지를 생성하면 이곳에 콘텐츠 카드가 쌓입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <ProductContentCard key={item.generationId} item={item} />
      ))}
    </div>
  );
}
