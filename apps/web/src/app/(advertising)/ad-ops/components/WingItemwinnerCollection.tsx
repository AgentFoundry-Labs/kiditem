'use client';

import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE, stoppedAttempt } from '@/lib/collection-source-status-query';
import { wingItemwinnerCollection } from '../lib/wing-itemwinner-collection';

/** Starts and stops the Wing itemwinner capture from the card that shows its KPIs. */
export function WingItemwinnerCollection() {
  const control = useCollectionSourceControl(wingItemwinnerCollection);
  const attempt = control.status?.latestAttempt;
  const stopped = stoppedAttempt(attempt);
  const failure = attempt?.state === 'FAILED'
    ? (stopped ? COLLECTION_STOPPED_MESSAGE : attempt.errorMessage ?? '최근 아이템위너 수집에 실패했습니다.')
    : null;

  return (
    <div className="flex flex-wrap items-start justify-end gap-3" data-testid="wing-itemwinner-collection">
      {failure && (
        <p
          className="text-[11px]"
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
