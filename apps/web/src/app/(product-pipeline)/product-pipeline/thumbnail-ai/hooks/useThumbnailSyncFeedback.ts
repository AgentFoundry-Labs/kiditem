'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { useCoupangImageSync } from './useCoupangImageSync';

interface UseThumbnailSyncFeedbackArgs {
  sync: ReturnType<typeof useCoupangImageSync>;
  refetchAnalysis: () => void;
}

export function useThumbnailSyncFeedback({
  sync,
  refetchAnalysis,
}: UseThumbnailSyncFeedbackArgs) {
  const syncStatus = sync.status;
  const lastSyncRefreshAt = useRef(0);
  // 매칭 센터 CTA 배너 — 이미지 동기화가 끝났을 때 unmatched > 0 이면 표시.
  // sync.reset() 이 status 를 비워도 사용자가 명시적으로 닫기 전까지 유지.
  const [unmatchedBanner, setUnmatchedBanner] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (!sync.startError) return;
    if (sync.isCancelledError) {
      toast.info('이미지 수집을 중단했습니다');
      return;
    }
    toast.error(
      `이미지 동기화 실패: ${
        sync.startError instanceof Error ? sync.startError.message : '알 수 없는 오류'
      }`,
    );
  }, [sync.startError, sync.isCancelledError]);

  useEffect(() => {
    if (!syncStatus || syncStatus.status === 'running') return;
    if (syncStatus.status === 'failed') {
      toast.error(`이미지 동기화 실패: ${syncStatus.error ?? '알 수 없는 오류'}`);
    } else if (syncStatus.total === 0) {
      toast.info('동기화할 이미지가 없습니다 (모든 상품에 이미지가 이미 있음)');
    } else {
      toast.success(
        `이미지 동기화 완료 — 성공 ${syncStatus.succeeded}건${
          syncStatus.unmatched ? ` / 매칭 필요 ${syncStatus.unmatched}건` : ''
        }${syncStatus.failed ? ` / 실패 ${syncStatus.failed}건` : ''}`,
      );
      refetchAnalysis();
      if (syncStatus.unmatched > 0) {
        setUnmatchedBanner({ count: syncStatus.unmatched });
      }
    }
    const t = setTimeout(() => sync.reset(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus?.status, syncStatus?.jobId]);

  useEffect(() => {
    if (!syncStatus || syncStatus.status !== 'running') return;
    if (syncStatus.phase !== 'linking' || syncStatus.processed <= 0) return;

    const now = Date.now();
    if (now - lastSyncRefreshAt.current < 5000) return;
    lastSyncRefreshAt.current = now;
    void refetchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus?.processed, syncStatus?.phase, syncStatus?.status]);

  return {
    syncStatus,
    unmatchedBanner,
    dismissUnmatchedBanner: () => setUnmatchedBanner(null),
  };
}
