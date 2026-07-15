'use client';

import type { SellpiaInventoryFreshnessStatus } from '@kiditem/shared/sellpia-inventory-freshness';
import { RefreshCw } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

const STATUS_META: Record<
  SellpiaInventoryFreshnessStatus,
  { label: string; className: string }
> = {
  fresh: { label: '최신', className: 'bg-emerald-100 text-emerald-700' },
  refresh_required: { label: '갱신 필요', className: 'bg-amber-100 text-amber-800' },
  syncing: { label: '갱신 중', className: 'bg-blue-100 text-blue-700' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

export function SellpiaFreshnessStatus({
  status,
  lastVerifiedAt,
  now,
  onOpen,
}: {
  status: SellpiaInventoryFreshnessStatus;
  lastVerifiedAt: string | null;
  now?: Date;
  onOpen: () => void;
}) {
  const meta = STATUS_META[status];
  const age = lastVerifiedAt ? timeAgo(lastVerifiedAt, now) : '확인 전';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Sellpia 재고 상태: ${meta.label}`}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-medium shadow-lg"
    >
      <RefreshCw
        aria-hidden="true"
        className={cn('h-4 w-4', status === 'syncing' && 'animate-spin')}
      />
      <span className={cn('rounded-full px-2 py-0.5', meta.className)}>
        {meta.label}
      </span>
      <span className="text-[var(--text-secondary)]">{age}</span>
    </button>
  );
}
