import { useEffect, useRef, useState } from 'react';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

export function useGenerationAwaitingState(
  generationId: string | null,
  pollingGenerations: ThumbnailGenerationItem[],
) {
  const targetGen = generationId
    ? pollingGenerations.find((g) => g.id === generationId)
    : null;
  const [forcedAwaiting, setForcedAwaiting] = useState(false);
  const forcedStartRef = useRef(0);

  const isAwaitingGen =
    forcedAwaiting ||
    (!!targetGen && (targetGen.status === 'pending' || targetGen.status === 'running'));

  const isGenComplete = !!(
    targetGen &&
    targetGen.status === 'succeeded' &&
    Array.isArray(targetGen.candidates) &&
    targetGen.candidates.length > 0
  );
  const isGenError = !!(
    targetGen &&
    (targetGen.status === 'failed' || targetGen.status === 'cancelled')
  );

  const beginAwaiting = () => {
    forcedStartRef.current = Date.now();
    setForcedAwaiting(true);
  };

  const clearAwaiting = () => setForcedAwaiting(false);

  useEffect(() => {
    if (!forcedAwaiting) return;
    if (!isGenComplete && !isGenError) return;
    const elapsed = Date.now() - forcedStartRef.current;
    const wait = Math.max(0, 3000 - elapsed);
    console.log('[edit-page] generation 종결 — hold', wait, 'ms 후 모달 해제');
    const t = setTimeout(() => setForcedAwaiting(false), wait);
    return () => clearTimeout(t);
  }, [forcedAwaiting, isGenComplete, isGenError]);

  useEffect(() => {
    if (!forcedAwaiting) return;
    const safety = setTimeout(() => {
      console.log('[edit-page] safety timeout 90s — forcedAwaiting 강제 해제');
      setForcedAwaiting(false);
    }, 90000);
    return () => clearTimeout(safety);
  }, [forcedAwaiting]);

  return {
    targetGen,
    forcedAwaiting,
    isAwaitingGen,
    beginAwaiting,
    clearAwaiting,
  };
}
