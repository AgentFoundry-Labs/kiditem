'use client';

import type { ProductStatus } from '../../lib/sourcing-api';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<ProductStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PROCESSING: 'bg-yellow-100 text-yellow-700 animate-pulse',
  LISTED: 'bg-emerald-100 text-emerald-700',
  DISCONTINUED: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-600',
  processing: 'bg-yellow-100 text-yellow-700 animate-pulse',
  content_ready: 'bg-sky-100 text-sky-700',
  images_generating: 'bg-violet-100 text-violet-700 animate-pulse',
  processed: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: '등록 대기',
  PROCESSING: 'AI 가공중',
  LISTED: '등록완료',
  DISCONTINUED: '판매중지',
  draft: '소싱 완료',
  processing: '카피 생성중',
  content_ready: '카피 완료',
  images_generating: '이미지 생성중',
  processed: '상세 완료',
};

export default function SourcingStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_STYLES[status])}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
