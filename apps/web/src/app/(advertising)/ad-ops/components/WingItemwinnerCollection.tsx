'use client';

import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { latestItemwinnerOperation, wingItemwinnerCollection } from '../lib/wing-itemwinner-collection';
import { attemptFailureText } from '@/lib/operator-error';

/** Starts and stops the Wing itemwinner operation from the card that shows its KPIs. */
export function WingItemwinnerCollection() {
  const control = useCollectionSourceControl(wingItemwinnerCollection);
  const latest = latestItemwinnerOperation(control.status);
  const stopped = latest?.status === 'cancelled';
  const failure = stopped
    ? COLLECTION_STOPPED_MESSAGE
    : latest?.status === 'failed'
      ? attemptFailureText(latest, 'coupang_wing_itemwinner') ?? '최근 아이템위너 수집에 실패했습니다.'
      : null;

  return (
    <div className="flex flex-wrap items-start justify-end gap-3" data-testid="wing-itemwinner-collection">
      {failure && (
        <p
          className="text-[11px]"
          data-testid={stopped ? 'wing-itemwinner-stopped' : 'wing-itemwinner-failure'}
          style={{ color: stopped ? 'var(--warning)' : 'var(--danger)' }}
        >
          {failure}
        </p>
      )}
      <CollectionStartControl
        control={control}
        startLabel="아이템위너 수집"
        onStart={() => control.start()}
        onStop={control.stop}
      />
    </div>
  );
}
