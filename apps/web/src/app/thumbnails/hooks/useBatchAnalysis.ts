'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ThumbnailAnalysisResult } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { AnalysisScope } from './useThumbnailAnalysis';

const BATCH_SIZE = 15;
const RATE_LIMIT_DELAY_MS = 2000;

interface RunOptions {
  onResults?: (results: ThumbnailAnalysisResult[]) => void;
  onComplete?: (results: ThumbnailAnalysisResult[], targets: ThumbnailAnalysisResult[]) => void;
}

export function useBatchAnalysis() {
  const queryClient = useQueryClient();
  const batchCancelRef = useRef(false);
  const batchAbortRef = useRef<AbortController | null>(null);

  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!batchStartTime) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - batchStartTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [batchStartTime]);

  const cancel = () => {
    batchCancelRef.current = true;
    batchAbortRef.current?.abort();
    toast.success('배치 분류를 중단했습니다');
  };

  const run = async (
    items: ThumbnailAnalysisResult[],
    scope: AnalysisScope = 'all',
    options: RunOptions = {},
  ) => {
    // 개별 "AI 분석" 버튼과 동일하게 — 이미 분석된 상품도 항상 덮어쓴다.
    const targets = items.filter((i) => i.imageUrl);
    if (targets.length === 0) {
      toast.error('분석할 상품이 없습니다 (이미지 없음)');
      return;
    }

    setBatchTotal(targets.length);
    setBatchDone(0);
    setBatchStartTime(Date.now());
    setElapsed(0);
    setIsBatchRunning(true);
    batchCancelRef.current = false;
    batchAbortRef.current = new AbortController();

    const allResults: ThumbnailAnalysisResult[] = [];
    const signal = batchAbortRef.current.signal;

    try {
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        if (batchCancelRef.current || signal.aborted) break;

        const chunk = targets.slice(i, i + BATCH_SIZE);
        const chunkResults = await apiClient
          .post<ThumbnailAnalysisResult[]>(
            '/api/thumbnail-analysis/analyze-batch',
            { productIds: chunk.map((t) => t.productId), scope },
            { signal },
          )
          .catch(() => [] as ThumbnailAnalysisResult[]);

        const valid = chunkResults.filter(Boolean) as ThumbnailAnalysisResult[];
        allResults.push(...valid);

        options.onResults?.(valid);
        setBatchDone((d) => d + valid.length);
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });

        if (i + BATCH_SIZE < targets.length) {
          await new Promise<void>((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
        }
      }

      if (!batchCancelRef.current) {
        options.onComplete?.(allResults, targets);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'batch 분석 실패');
    } finally {
      setIsBatchRunning(false);
      setBatchStartTime(null);
      batchAbortRef.current = null;
    }
  };

  return {
    isBatchRunning,
    batchTotal,
    batchDone,
    elapsed,
    cancel,
    run,
  };
}
