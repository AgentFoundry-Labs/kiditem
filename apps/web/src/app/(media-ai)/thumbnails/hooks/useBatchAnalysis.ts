'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ThumbnailAnalysisResult } from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { isApiError } from '@/lib/api-error';
import type { AnalysisScope } from './useThumbnailAnalysis';

const STORAGE_KEY = 'kiditem.thumbnail-analysis.batch.jobId';

interface RunOptions {
  /**
   * Backend job 모델로 옮기기 전에는 chunk 별 결과를 frontend 가 받아 즉시
   * 머지했지만, 이제 backend 가 모든 chunk 를 처리하므로 호출자는 polling 을
   * 통해 invalidation 받은 새 list 만 본다. backwards compat 을 위해 옵션은
   * 유지하지만 실제 호출되지 않는다.
   */
  onResults?: (results: ThumbnailAnalysisResult[]) => void;
  onComplete?: (results: ThumbnailAnalysisResult[], targets: ThumbnailAnalysisResult[]) => void;
}

export type BatchJobStatus = 'running' | 'done' | 'failed' | 'cancelled';

interface BatchJob {
  jobId: string;
  organizationId: string;
  status: BatchJobStatus;
  scope: AnalysisScope;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

function readStoredJobId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredJobId(jobId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (jobId) window.localStorage.setItem(STORAGE_KEY, jobId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Thumbnail batch analysis hook — backend job tracker 기반.
 *
 * 핵심 변화 vs 이전 useState 만 쓰던 구현:
 *  - `start()` → `POST /api/thumbnail-analysis/batch` (productIds + scope) → jobId
 *  - jobId 를 localStorage 에 저장 → 페이지 새로고침/탭 닫음 후에도 복원
 *  - `useQuery` 가 jobId 가 살아있을 때 1.5s polling, 아니면 off
 *  - `cancel()` → `DELETE /api/thumbnail-analysis/batch/:jobId`
 *  - 잡 진행 중에 frontend 는 `queryKeys.thumbnailAnalysis.all` 만 invalidate
 *    해서 리스트 / summary 가 부분 업데이트되는 걸 보여준다 (backend 는 이미
 *    DB 에 chunk 단위로 commit).
 *
 * On mount:
 *  - localStorage 에 잡 ID 가 있으면 status 폴링 시도
 *  - 404 (이미 GC) → localStorage cleanup + UI idle
 *  - cross-tab safety 는 backend organization-scope 가 자체 보장
 *    (한 조직 1잡 — `start()` 가 ConflictException 으로 막음)
 */
export function useBatchAnalysis() {
  const queryClient = useQueryClient();
  const [activeJobId, setActiveJobId] = useState<string | null>(() => readStoredJobId());
  const [optimisticAt, setOptimisticAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const statusQuery = useQuery({
    queryKey: activeJobId
      ? queryKeys.thumbnailAnalysis.batchJob(activeJobId)
      : queryKeys.thumbnailAnalysis.batchCurrent(),
    queryFn: async () => {
      if (activeJobId) {
        return apiClient.get<BatchJob>(`/api/thumbnail-analysis/batch/${activeJobId}`);
      }
      const r = await apiClient.get<{ job: BatchJob | null }>('/api/thumbnail-analysis/batch');
      return r.job;
    },
    refetchInterval: (query) => {
      const data = query.state.data as BatchJob | null | undefined;
      return data && data.status === 'running' ? 1_500 : false;
    },
    retry: (count, error) => {
      // 404 — backend 가 GC 한 잡. localStorage cleanup + idle 상태로 회복.
      if (isApiError(error) && error.status === 404) return false;
      return count < 2;
    },
    refetchOnWindowFocus: false,
  });

  // 404 회복 — error 상태일 때 localStorage + activeJobId 정리.
  useEffect(() => {
    if (statusQuery.isError && activeJobId) {
      const err = statusQuery.error;
      if (isApiError(err) && err.status === 404) {
        writeStoredJobId(null);
        setActiveJobId(null);
      }
    }
  }, [statusQuery.isError, statusQuery.error, activeJobId]);

  const job = (statusQuery.data ?? null) as BatchJob | null;

  // 진행 중일 때 1초마다 elapsed 갱신용 tick.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [job?.status, job?.jobId]);

  // 잡 진행 중일 때 list/summary 주기적 invalidate — partial DB update 를 화면에 반영.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    if (job.processed === 0) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
  }, [job?.processed, job?.status, queryClient]);

  // 잡 완료 시 — toast + cleanup.
  useEffect(() => {
    if (!job) return;
    if (job.status === 'running') return;
    if (activeJobId !== job.jobId) return;

    const total = job.total;
    if (job.status === 'done') {
      toast.success(`AI 분류 완료 — 성공 ${job.succeeded} / 실패 ${job.failed} / 전체 ${total}`);
    } else if (job.status === 'cancelled') {
      toast.info(`AI 분류 중단됨 — 처리 ${job.processed} / 전체 ${total}`);
    } else if (job.status === 'failed') {
      toast.error(`AI 분류 실패 — ${job.error ?? '알 수 없는 오류'}`);
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
    writeStoredJobId(null);
    setActiveJobId(null);
  }, [job?.status, job?.jobId, activeJobId, queryClient, job]);

  const startMutation = useMutation({
    mutationFn: async (input: { productIds: string[]; scope: AnalysisScope }) => {
      const r = await apiClient.post<{ jobId: string }>('/api/thumbnail-analysis/batch', {
        productIds: input.productIds,
        scope: input.scope,
      });
      return r.jobId;
    },
    onMutate: () => {
      setOptimisticAt(Date.now());
    },
    onSuccess: (jobId) => {
      writeStoredJobId(jobId);
      setActiveJobId(jobId);
      setOptimisticAt(null);
      // 즉시 폴링 시작.
      void queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.batchJob(jobId) });
    },
    onError: (err) => {
      setOptimisticAt(null);
      toast.error(err instanceof Error ? err.message : 'batch 시작 실패');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient.delete<{ ok: true }>(`/api/thumbnail-analysis/batch/${jobId}`);
    },
    onSuccess: () => {
      toast.success('AI 분류를 중단했습니다');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '중단 실패');
    },
    onSettled: (_data, _err, jobId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnailAnalysis.batchJob(jobId),
      });
    },
  });

  const run = async (
    items: ThumbnailAnalysisResult[],
    scope: AnalysisScope = 'all',
    _options: RunOptions = {},
  ) => {
    const targets = items.filter((i) => i.imageUrl);
    if (targets.length === 0) {
      toast.error('분석할 상품이 없습니다 (이미지 없음)');
      return;
    }
    try {
      await startMutation.mutateAsync({
        productIds: targets.map((t) => t.productId),
        scope,
      });
    } catch {
      // toast 는 onError 가 처리.
    }
  };

  const cancel = () => {
    if (!activeJobId) return;
    cancelMutation.mutate(activeJobId);
  };

  // 외부 노출 상태 — 기존 useState 시그니처와 호환.
  const isOptimistic = startMutation.isPending || optimisticAt !== null;
  const isBatchRunning = isOptimistic || (job?.status === 'running');
  const batchTotal = job?.total ?? 0;
  const batchDone = job?.processed ?? 0;
  const startedAt = job?.startedAt ?? optimisticAt ?? null;
  const elapsed = startedAt && isBatchRunning ? Math.floor((now - startedAt) / 1000) : 0;

  return {
    isBatchRunning,
    batchTotal,
    batchDone,
    elapsed,
    cancel,
    run,
  };
}
