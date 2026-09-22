'use client';

import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { friendlyError } from '@/lib/api-error';
import { cn, timeAgo } from '@/lib/utils';
import { useSellpiaInventoryCollection } from './sellpia-inventory-source-owner';

const STOCK_COLLECTION_META: Record<string, { label: string; className: string }> = {
  not_collected: { label: '미수집', className: 'bg-amber-100 text-amber-800' },
  complete: { label: '수집 완료', className: 'bg-emerald-100 text-emerald-700' },
  running: { label: '수집 중', className: 'bg-blue-100 text-blue-700' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};
// A stopped collection is not a failure; the previous snapshot stays in use.
const STOPPED_META = { label: '수집 중단됨', className: 'bg-slate-100 text-slate-700' };

export const SELLPIA_INVENTORY_START_TITLE =
  '셀피아 현재고만 동기화합니다. 수익성 데이터는 상품 운영 센터에서 별도로 갱신할 수 있습니다.';

/** The stock screens' Sellpia inventory control, with collection state and source binding. */
export function SellpiaSyncAction({ compact = false, showStatus = false }: {
  compact?: boolean;
  showStatus?: boolean;
}) {
  const { control, state, isConfirming, confirmSourceBinding } = useSellpiaInventoryCollection();
  const statusMeta = state ? (state.stopped ? STOPPED_META : STOCK_COLLECTION_META[state.status]) : null;
  const stockAge = state?.lastCompletedAt ? timeAgo(state.lastCompletedAt) : null;

  const runConfirmSourceBinding = async () => {
    try {
      await confirmSourceBinding();
      toast.success('셀피아 계정 연결이 확인되었습니다.');
    } catch (error) {
      toast.error(friendlyError(error) ?? '셀피아 계정 연결을 확인하지 못했습니다.');
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      {showStatus && statusMeta ? (
        <span className={cn('self-center rounded-full px-2 py-1 text-[11px] font-semibold', statusMeta.className)}>
          {statusMeta.label}
        </span>
      ) : null}
      {showStatus && stockAge ? <span className="self-center text-xs text-slate-400">{stockAge}</span> : null}
      {!compact && state?.sourceBindingConfirmed === false ? (
        <span className="w-full text-right text-xs text-amber-800">
          이 출처(https://kiditem.sellpia.com · kiditem)가 현재 조직의 재고 계정임을 확인합니다.
        </span>
      ) : null}
      {!compact && state?.sourceBindingConfirmed === false ? (
        <button
          type="button"
          onClick={() => void runConfirmSourceBinding()}
          disabled={isConfirming || control.state === 'starting'}
          aria-label="셀피아 계정 연결 확인"
          title="이 출처가 현재 조직의 재고 계정임을 확인합니다."
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
        >
          {isConfirming
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Link2 className="h-4 w-4" aria-hidden="true" />}
          {isConfirming ? '확인 중…' : '셀피아 계정 연결 확인'}
        </button>
      ) : null}
      <CollectionStartControl
        control={control}
        startLabel="셀피아 재고 동기화"
        startTitle={SELLPIA_INVENTORY_START_TITLE}
        onStart={() => control.start()}
        onStop={control.stop}
      />
    </div>
  );
}
