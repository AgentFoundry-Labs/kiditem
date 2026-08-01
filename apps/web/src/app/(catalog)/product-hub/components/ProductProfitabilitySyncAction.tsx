'use client';

import { useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';

/**
 * Requests the only collection that is allowed to read Sellpia's product-profit
 * report. The background coordinator owns the actual browser collection and
 * recalculation; this control only schedules the full scope explicitly.
 */
export function ProductProfitabilitySyncAction() {
  const { requestRefresh } = useSellpiaInventoryFreshness({ enabled: true });
  const [requesting, setRequesting] = useState(false);

  const requestFullSync = async () => {
    setRequesting(true);
    try {
      await requestRefresh('manual_request', 'full');
      toast.success('상품별 이익현황 수집을 요청했습니다. 완료되면 ABC 등급이 자동 계산됩니다.');
    } catch {
      toast.error('수익성 데이터 갱신 요청에 실패했습니다.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void requestFullSync()}
      disabled={requesting}
      title="현재고와 셀피아 상품별 이익현황을 수집한 뒤 수익성 ABC를 자동 계산합니다."
      className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary-soft)] px-3 text-[13px] font-semibold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white disabled:opacity-60"
    >
      {requesting ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
      {requesting ? '요청 중…' : '수익성 데이터 갱신'}
    </button>
  );
}
