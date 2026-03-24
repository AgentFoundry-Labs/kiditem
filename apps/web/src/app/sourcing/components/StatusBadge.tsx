'use client';

import type { ProductStatus } from '@/lib/sourcing-api';

const STATUS_STYLES: Record<ProductStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-yellow-100 text-yellow-700 animate-pulse',
  LISTED: 'bg-emerald-100 text-emerald-700',
  DISCONTINUED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: '등록 대기',
  PROCESSING: 'AI 가공중',
  LISTED: '등록완료',
  DISCONTINUED: '판매중지',
};

export default function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
