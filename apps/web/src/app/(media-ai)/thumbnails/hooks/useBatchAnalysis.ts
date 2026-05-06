'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ThumbnailAnalysisResult } from '@kiditem/shared/ai';
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
    let firstChunkError: unknown = null;
    let succeededInChunks = 0;

    try {
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        if (batchCancelRef.current || signal.aborted) break;

        const chunk = targets.slice(i, i + BATCH_SIZE);
        let chunkResults: ThumbnailAnalysisResult[] = [];
        try {
          chunkResults = await apiClient.post<ThumbnailAnalysisResult[]>(
            '/api/thumbnail-analysis/analyze-batch',
            { productIds: chunk.map((t) => t.productId), scope },
            { signal },
          );
        } catch (err) {
          if (signal.aborted || batchCancelRef.current) break;
          // chunk 실패는 잡 전체를 멈추지 않고 계속 — 다른 chunk 는 성공할 수
          // 있다. 다만 최종 toast 가 정확한 성공/실패 수를 보여주도록
          // firstChunkError 만 보존해서 사용자에게 한 번 노출.
          firstChunkError ??= err;
          chunkResults = [];
        }

        const valid = chunkResults.filter(Boolean) as ThumbnailAnalysisResult[];
        allResults.push(...valid);
        succeededInChunks += valid.length;
        // batch endpoint 가 200/201 + 빈 배열을 돌려보내는 partial-success
        // 케이스도 명확히 카운트. 백엔드가 per-product try/catch 로 silent
        // skip 하면 chunk.length > valid.length 일 수 있음.
        const failedThisChunk = chunk.length - valid.length;
        if (failedThisChunk > 0 && !firstChunkError) {
          firstChunkError = new Error(
            `${failedThisChunk}/${chunk.length}개 분석 실패 — 백엔드 vision 모델 환경 또는 LLM 호출 실패 가능`,
          );
        }

        options.onResults?.(valid);
        setBatchDone((d) => d + chunk.length);
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });

        if (i + BATCH_SIZE < targets.length) {
          await new Promise<void>((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
        }
      }

      if (!batchCancelRef.current) {
        if (firstChunkError && succeededInChunks === 0) {
          // 모든 chunk 실패 — onComplete 부르지 말고 명확한 에러만 보이게.
          toast.error(
            `AI 분류 실패 — ${firstChunkError instanceof Error ? firstChunkError.message : String(firstChunkError)}`,
          );
        } else {
          if (firstChunkError) {
            // 부분 성공 — 사용자가 실패 사실을 인지하도록 추가 토스트.
            toast.error(
              `일부 분석 실패 — 성공 ${succeededInChunks}/${targets.length}개. ${firstChunkError instanceof Error ? firstChunkError.message : ''}`,
            );
          }
          options.onComplete?.(allResults, targets);
        }
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
