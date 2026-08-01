'use client';

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';
import { cn, timeAgo } from '@/lib/utils';

const STOCK_FRESHNESS_META: Record<string, { label: string; className: string }> = {
  fresh: { label: '최신', className: 'bg-emerald-100 text-emerald-700' },
  refresh_required: { label: '갱신 필요', className: 'bg-amber-100 text-amber-800' },
  syncing: { label: '갱신 중', className: 'bg-blue-100 text-blue-700' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

export function SellpiaSyncAction({ compact = false, showStatus = false }: {
  compact?: boolean;
  showStatus?: boolean;
}) {
  const { requestRefresh, state } = useSellpiaInventoryFreshness({ enabled: true });
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || state?.status === 'syncing';
  const statusMeta = state ? STOCK_FRESHNESS_META[state.status] : null;
  const stockAge = state?.lastVerifiedAt ? timeAgo(state.lastVerifiedAt) : null;

  const runSync = async () => {
    setRequesting(true);
    try {
      await requestRefresh(state?.status === 'failed' ? 'retry' : 'manual_request');
      toast.success('셀피아 동기화를 시작했습니다.');
    } catch {
      toast.error('셀피아 동기화를 시작하지 못했습니다.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {showStatus && statusMeta ? (
        <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold', statusMeta.className)}>
          {statusMeta.label}
        </span>
      ) : null}
      {showStatus && stockAge ? <span className="text-xs text-slate-400">{stockAge}</span> : null}
      <button
        type="button"
        onClick={() => void runSync()}
        disabled={busy}
        aria-label="셀피아 동기화"
        title="셀피아 현재고와 상품별 소진을 함께 동기화"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-50',
          compact
            ? 'bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700'
            : 'bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-hover)]',
        )}
      >
        {busy
          ? <Loader2 className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', 'animate-spin')} aria-hidden="true" />
          : <RefreshCw className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />}
        {busy ? '동기화 중…' : '셀피아 동기화'}
      </button>
    </div>
  );
}
