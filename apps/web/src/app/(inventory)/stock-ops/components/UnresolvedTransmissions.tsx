'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SellpiaUnresolvedOrderTransmissionIntentView } from '@kiditem/shared/sellpia-inventory-freshness';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import { isApiError } from '@/lib/api-error';
import { formatDateTime } from '@/lib/utils';
import { invalidateSellpiaInventory } from '../../_shared/invalidate-sellpia-inventory';
import { ProjectionCard } from './StockProjectionUi';

/**
 * The only operator path out of a prepared-but-unresolved Sellpia transmission.
 *
 * Order collection deliberately leaves an intent unresolved when the extension
 * errors or the tab dies, and that intent blocks every stock collection claim.
 * The order-collection retry gate can only reopen it while the local generated
 * file still carries a transmission marker, so a crashed submit was previously
 * unrecoverable from any screen.
 */
export default function UnresolvedTransmissions() {
  const { state } = useSellpiaInventoryFreshness({ enabled: true });
  const intents = state?.unresolvedOrderTransmissionIntents ?? [];
  if (intents.length === 0) return null;

  return (
    <ProjectionCard
      title="셀피아 전송 결과 미확인"
      description="이 건이 남아 있는 동안 재고 동기화가 차단됩니다. 셀피아 주문 내역을 확인한 뒤 접수 여부를 확정해주세요."
      icon={AlertTriangle}
    >
      <div className="space-y-2">
        {intents.map((intent) => (
          <UnresolvedTransmissionRow key={intent.intentKey} intent={intent} />
        ))}
      </div>
    </ProjectionCard>
  );
}

function UnresolvedTransmissionRow({
  intent,
}: {
  intent: SellpiaUnresolvedOrderTransmissionIntentView;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<'submitted' | 'not_submitted' | null>(null);

  const resolve = useCallback(async (outcome: 'submitted' | 'not_submitted') => {
    setPending(outcome);
    try {
      await sellpiaInventoryFreshnessApi.reconcileOrderTransmissionIntent({
        intentKey: intent.intentKey,
        outcome,
        note: outcome === 'submitted'
          ? '운영자가 셀피아 주문 접수를 확인함'
          : '운영자가 셀피아 미접수를 확인함',
      });
      await invalidateSellpiaInventory(queryClient);
      toast.success(outcome === 'submitted'
        ? '접수됨으로 확정했습니다. 재고 동기화가 다시 진행됩니다.'
        : '미접수로 확정했습니다. 해당 파일을 다시 전송할 수 있습니다.');
    } catch (err) {
      toast.error(
        isApiError(err) && err.status === 403
          ? '이 확정은 owner/admin 권한이 필요합니다.'
          : '전송 결과 확정에 실패했습니다.',
      );
    } finally {
      setPending(null);
    }
  }, [intent.intentKey, queryClient]);

  const busy = pending !== null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-[var(--text-primary)]">{intent.intentKey}</p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          전송 시각 {formatDateTime(intent.preparedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void resolve('submitted')}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending === 'submitted' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          셀피아에 접수됨
        </button>
        <button
          type="button"
          onClick={() => void resolve('not_submitted')}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          {pending === 'not_submitted' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          미접수 (재전송 필요)
        </button>
      </div>
    </div>
  );
}
