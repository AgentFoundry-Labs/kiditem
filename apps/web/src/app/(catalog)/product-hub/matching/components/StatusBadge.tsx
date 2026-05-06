'use client';

import { cn } from '@/lib/utils';
import type { ReconciliationItemStatus } from '@kiditem/shared/channel-reconciliation';

interface ReconciliationStatusBadgeProps {
  status: ReconciliationItemStatus;
  resolutionSource: string | null;
}

export function ReconciliationStatusBadge({
  status,
  resolutionSource,
}: ReconciliationStatusBadgeProps) {
  const isAutoLinked =
    status === 'linked' && resolutionSource === 'auto_legacy_code';
  const isManualLinked =
    status === 'linked' && resolutionSource === 'manual';
  const isExistingLinked =
    status === 'linked' && resolutionSource === 'existing_external_id';

  const meta = isAutoLinked
    ? { label: '자동 연결', class: 'bg-green-50 text-green-700 border-green-200' }
    : isManualLinked
      ? { label: '수동 연결', class: 'bg-purple-50 text-purple-700 border-purple-200' }
      : isExistingLinked
        ? { label: '연결됨', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        : status === 'needs_review'
          ? { label: '확인 필요', class: 'bg-amber-50 text-amber-700 border-amber-200' }
          : status === 'conflict'
            ? { label: '충돌', class: 'bg-red-50 text-red-700 border-red-200' }
            : status === 'ignored'
              ? { label: '제외', class: 'bg-slate-100 text-slate-500 border-slate-200' }
              : { label: status, class: 'bg-slate-100 text-slate-500 border-slate-200' };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        meta.class,
      )}
    >
      {meta.label}
    </span>
  );
}
