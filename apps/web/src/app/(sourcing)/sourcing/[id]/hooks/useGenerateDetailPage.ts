'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AgentRunSummary, AgentRunnerResult } from '@kiditem/shared/agent-os';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

export type GenerateMode = 'draft' | 'image' | 'full';

/**
 * `mode` 별 polling timeout — image 생성 (Step2) 가 가장 무겁다.
 *   draft: Gemini 카피 + 색상 → 보통 5~15초
 *   image: hero/studio/detail 이미지 4~6장 생성 → 1~3분
 *   full:  draft → image 연쇄 → 1~3.5분
 */
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUTS_MS: Record<GenerateMode, number> = {
  draft: 60_000,
  image: 240_000,
  full: 240_000,
};

async function pollAgentRun(runId: string, mode: GenerateMode): Promise<AgentRunSummary> {
  const maxAttempts = Math.ceil(POLL_TIMEOUTS_MS[mode] / POLL_INTERVAL_MS);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let run: AgentRunSummary;
    try {
      run = await apiClient.get<AgentRunSummary>(`/api/agent-os/runs/${runId}`);
    } catch {
      continue;
    }
    if (run.status === 'succeeded') return run;
    if (run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(run.errorMessage || run.errorCode || '상세페이지 생성 실패');
    }
  }
  throw new Error('상세페이지 생성 시간 초과 — 백그라운드에서 계속 진행 중일 수 있습니다');
}

const MODE_LABEL: Record<GenerateMode, string> = {
  draft: '카피 + 색상 생성',
  image: '이미지 생성',
  full: '카피 + 이미지 전체 생성',
};

/**
 * `useGenerateDetailPage(productId)` — POST /api/sourcing/:id/generate 후 agent-os run 폴링.
 *
 * 사용:
 *   const { mutate, isPending } = useGenerateDetailPage(productId);
 *   mutate({ mode: 'draft' });
 */
export function useGenerateDetailPage(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { mode: GenerateMode; templateId?: string }) => {
      const start = await apiClient.post<AgentRunnerResult>(`/api/sourcing/${productId}/generate`, {
        mode: params.mode,
        ...(params.templateId && { templateId: params.templateId }),
      });
      const runId = start.runId;
      if (!runId) {
        throw new Error(start.reason || '상세페이지 생성 작업을 시작하지 못했습니다');
      }
      toast.info(`${MODE_LABEL[params.mode]} 시작 — 완료까지 잠시 걸려요`, { duration: 4000 });
      const run = await pollAgentRun(runId, params.mode);
      return { runId, requestId: start.requestId, mode: params.mode, run };
    },
    onSuccess: (_data, params) => {
      toast.success(`${MODE_LABEL[params.mode]} 완료`);
      // 새 draft_content / processed_data 가 들어오므로 detail + preview 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) });
    },
    onError: (e: unknown) => {
      const msg = isApiError(e) ? e.detail : e instanceof Error ? e.message : '상세페이지 생성 실패';
      toast.error(msg);
    },
  });
}
