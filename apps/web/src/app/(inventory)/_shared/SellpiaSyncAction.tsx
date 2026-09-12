'use client';

import { Link2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { cn, timeAgo } from '@/lib/utils';
import { useSellpiaInventorySourceOwner } from './sellpia-inventory-source-owner';

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
  const {
    start,
    isStarting,
    isConfirming,
    confirmSourceBinding,
    state,
  } = useSellpiaInventorySourceOwner({ enabled: true });
  // A persisted RUNNING attempt is resumable after a lost response or reload.
  // The owner hook's startingRef still blocks duplicate clicks while this
  // explicit action is in flight.
  const busy = isStarting;
  const bindingBusy = isConfirming;
  const statusMeta = state ? STOCK_FRESHNESS_META[state.status] : null;
  const stockAge = state?.lastVerifiedAt ? timeAgo(state.lastVerifiedAt) : null;

  const runSync = async () => {
    try {
      const attempt = await start();
      if (attempt.state === 'COMPLETE') {
        toast.success('셀피아 재고 동기화가 완료되었습니다.');
      } else if (attempt.state === 'FAILED') {
        toast.error(attempt.errorMessage ?? '셀피아 재고 동기화에 실패했습니다.');
      } else {
        toast.success('셀피아 재고 동기화를 시작했습니다.');
      }
    } catch (error) {
      toast.error(friendlyError(error) ?? '셀피아 동기화를 시작하지 못했습니다.');
    }
  };

  const runConfirmSourceBinding = async () => {
    try {
      await confirmSourceBinding();
      toast.success('셀피아 계정 연결이 확인되었습니다.');
    } catch (error) {
      toast.error(friendlyError(error) ?? '셀피아 계정 연결을 확인하지 못했습니다.');
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
      {!compact && state?.sourceBindingConfirmed === false ? (
        <span className="w-full text-right text-xs text-amber-800">
          이 출처(https://kiditem.sellpia.com · kiditem)가 현재 조직의 재고 계정임을 확인합니다.
        </span>
      ) : null}
      {!compact && state?.sourceBindingConfirmed === false ? (
        <button
          type="button"
          onClick={() => void runConfirmSourceBinding()}
          disabled={bindingBusy || busy}
          aria-label="셀피아 계정 연결 확인"
          title="이 출처가 현재 조직의 재고 계정임을 확인합니다."
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
        >
          {bindingBusy
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Link2 className="h-4 w-4" aria-hidden="true" />}
          {bindingBusy ? '확인 중…' : '셀피아 계정 연결 확인'}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void runSync()}
        disabled={busy}
        aria-label="셀피아 재고 동기화"
        title="셀피아 현재고만 동기화합니다. 수익성 데이터는 상품 운영 센터에서 별도로 갱신할 수 있습니다."
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
        {busy ? '동기화 중…' : '재고 동기화'}
      </button>
    </div>
  );
}
