'use client';

import type { SourcingCandidateStatus } from '@kiditem/shared/product-content';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<SourcingCandidateStatus, string> = {
  sourced: 'bg-slate-100 text-slate-600',
  promoted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<SourcingCandidateStatus, string> = {
  sourced: '소싱 완료',
  promoted: '제품 등록됨',
  rejected: '반려됨',
};

export default function SourcingStatusBadge({ status }: { status: SourcingCandidateStatus }) {
  return (
    <span
      className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_STYLES[status])}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
