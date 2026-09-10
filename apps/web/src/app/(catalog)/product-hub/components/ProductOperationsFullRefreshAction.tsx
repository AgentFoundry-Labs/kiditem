'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { useAuth } from '@/hooks/useAuth';
import { collectSellpiaProductProfitFromExtension } from '@/lib/sellpia-product-profitability-collection';
import { useSellpiaInventorySourceOwner } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';

/**
 * Product Management's convenience action owns two independent source
 * admissions. It never invokes ABC publication; that remains an explicit
 * command in the data-status dialog.
 */
export function ProductOperationsFullRefreshAction() {
  const { user } = useAuth();
  const { start: startInventory, isStarting: inventoryStarting } =
    useSellpiaInventorySourceOwner({ enabled: false });
  const [isStarting, setIsStarting] = useState(false);

  const refresh = async () => {
    if (isStarting || inventoryStarting) return;
    setIsStarting(true);
    const failures: string[] = [];
    try {
      try {
        const inventoryAttempt = await startInventory('manual_request');
        if (inventoryAttempt?.state !== 'COMPLETE') {
          const message = inventoryAttempt?.state === 'FAILED'
            ? inventoryAttempt.errorMessage ?? '수집 실패'
            : inventoryAttempt?.state === 'RUNNING'
              ? '수집이 아직 진행 중입니다.'
              : '수집 결과를 확인하지 못했습니다.';
          failures.push(`재고: ${message}`);
        }
      } catch (error) {
        failures.push(`재고: ${friendlyError(error) ?? '수집 실패'}`);
      }

      // Inventory and profitability are independent source owners. A failed
      // stock admission must not suppress the profitability collection.
      try {
        if (!user?.organizationId) {
          throw new Error('조직 정보가 없어 수익성 수집을 시작할 수 없습니다.');
        }
        const outcome = await collectSellpiaProductProfitFromExtension({
          organizationId: user.organizationId,
        });
        if (outcome.state === 'FAILED') {
          failures.push(`수익성: ${outcome.errorMessage ?? '수집 실패'}`);
        } else if (outcome.state !== 'COMPLETE') {
          failures.push('수익성: 수집이 아직 진행 중입니다.');
        }
      } catch (error) {
        failures.push(`수익성: ${friendlyError(error) ?? '수집 실패'}`);
      }

      if (failures.length === 0) {
        toast.success('상품 전체 데이터 갱신을 완료했습니다.');
      } else {
        toast.error(`상품 데이터 갱신 미완료 — ${failures.join(' · ')}`);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const busy = isStarting || inventoryStarting;
  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={busy}
      aria-label="상품 전체 데이터 갱신"
      title="현재고와 401일 수익성 원천을 각각 갱신합니다. ABC 등급은 자동 발행하지 않습니다."
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
    >
      <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
      {busy ? '전체 갱신 중…' : '상품 전체 데이터 갱신'}
    </button>
  );
}
