'use client';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RecomposeVariantKey, ThumbnailGenerationItem } from '@kiditem/shared/ai';
import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import { isActive } from '../lib/thumbnail-status';
import {
  mergeThumbnailRegistration,
  thumbnailExecutionIdChunks,
  type ThumbnailRegistrationFields,
} from '../lib/thumbnail-registration';
import {
  confirmWingThumbnailApplied,
  markWingThumbnailNotApplied,
  registerWingThumbnailViaExtension,
  resendWingThumbnailViaExtension,
  wingUploadReached,
  type WingRegistrationResult,
} from '../lib/wing-registration';

/** 생성 한 건과 그 생성의 몰 반영 상태(Channels 실행에서 읽는다). */
export type ThumbnailGenerationListItem = ThumbnailGenerationItem & ThumbnailRegistrationFields;

export type ThumbnailGenerationListScope = 'workspace-bound' | 'direct-upload' | 'all';

export function useGenerationList(
  params: {
    scope?: ThumbnailGenerationListScope;
    limit?: number;
    contentWorkspaceId?: string | null;
  } = {},
) {
  const queryParams: Record<string, string> = {};
  // 생성 목록은 콘텐츠 작업공간으로만 좁힌다 — 서버가 sourceCandidateId 를 더 이상 받지 않는다(KID-310).
  if (params.contentWorkspaceId) {
    queryParams.contentWorkspaceId = params.contentWorkspaceId;
  }
  if (params.scope && params.scope !== 'workspace-bound') queryParams.scope = params.scope;
  if (params.limit) queryParams.limit = String(params.limit);
  const query = new URLSearchParams(queryParams).toString();
  const generations = useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations(Object.keys(queryParams).length > 0 ? queryParams : undefined),
    queryFn: async () => {
      const href = query ? `/api/thumbnail-analysis/generations?${query}` : '/api/thumbnail-analysis/generations';
      const res = await apiClient.get<{
        items: ThumbnailGenerationItem[];
        total: number;
      }>(href);
      return res?.items ?? [];
    },
    staleTime: 1000,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const data = query.state.data;
      if (!data) return 3000;
      return data.some(isActive) ? 3000 : false;
    },
  });
  // 몰 반영 상태는 적용된 생성에만 의미가 있다. 목록 하나에 조회 한 번(200개씩)이다.
  const appliedIds = useMemo(
    () => (generations.data ?? []).filter((generation) => generation.phase === 'applied').map((generation) => generation.id),
    [generations.data],
  );
  const executions = useThumbnailExecutionStatuses(appliedIds);
  const data = useMemo(
    () => (generations.data ? mergeThumbnailRegistration(generations.data, executions.data ?? []) : undefined),
    [generations.data, executions.data],
  );
  return { ...generations, data };
}

/** 생성마다 가장 최근 대표이미지 몰 반영 실행(`GET /api/channels/thumbnail-executions`). */
export function useThumbnailExecutionStatuses(generationIds: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.thumbnailExecutions.latest(generationIds),
    enabled: generationIds.length > 0,
    queryFn: async () => {
      const pages = await Promise.all(
        thumbnailExecutionIdChunks(generationIds).map((ids) =>
          apiClient.get<{ items: ThumbnailExecutionStatus[] }>(
            `/api/channels/thumbnail-executions?generationIds=${ids.map(encodeURIComponent).join(',')}`,
          ),
        ),
      );
      return pages.flatMap((page) => page?.items ?? []);
    },
    staleTime: 1000,
  });
}

function invalidateThumbnailRegistration(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailExecutions.all }),
  ]);
}

export function useSelectCandidate() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: ({ id, selectedUrl }: { id: string; selectedUrl: string }) =>
      apiClient.put(`/api/thumbnail-analysis/generations/${id}/select`, {
        selectedUrl,
      }),
    onMutate: async ({ id, selectedUrl }) => {
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      queryClient.setQueryData<ThumbnailGenerationItem[]>(
        qKey,
        (old) =>
          old?.map((g): ThumbnailGenerationItem =>
            g.id === id
              ? {
                  ...g,
                  selectedUrl: selectedUrl || null,
                  status: 'succeeded',
                  phase: 'ready',
                }
              : g,
          ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });
}

/**
 * "선택 대기" 탭 진입 시 모든 ready generation 의 `selectedUrl` 일괄 해제.
 * Optimistic — 즉시 cache 의 selectedUrl 을 null 로 비우고 서버 호출.
 */
export function useClearReadySelections() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: () =>
      apiClient.put<{ count: number }>('/api/thumbnail-analysis/generations/clear-ready-selections', {}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      queryClient.setQueryData<ThumbnailGenerationItem[]>(
        qKey,
        (old) =>
          old?.map((g): ThumbnailGenerationItem =>
            g.phase === 'ready' && g.selectedUrl ? { ...g, selectedUrl: null } : g,
          ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });
}

export function useApplyGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/api/thumbnail-analysis/generations/${id}/apply`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnailAnalysis.generations(),
      });
    },
  });
}

export function useSkipGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/api/thumbnail-analysis/generations/${id}/skip`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnailAnalysis.generations(),
      });
    },
  });
}

export function useCancelGeneration() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(
        `/api/thumbnail-analysis/generations/${encodeURIComponent(id)}/cancel`,
        { reason: '사용자 요청' },
      ),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      queryClient.setQueryData<ThumbnailGenerationItem[]>(
        qKey,
        (old) =>
          old?.map((g): ThumbnailGenerationItem =>
            g.id === id
              ? {
                  ...g,
                  status: 'cancelled',
                  phase: null,
                  errorMessage: '사용자 요청으로 생성이 중단되었습니다.',
                }
              : g,
          ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });
}

export function useDeleteGeneration() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/thumbnail-analysis/generations/${id}`),
    // Optimistic: 서버 응답 기다리지 말고 즉시 cache 에서 제거 → UI 반영
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      queryClient.setQueryData<ThumbnailGenerationItem[]>(qKey, (old) => (old ?? []).filter((g) => g.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // 실패 시 원상복구
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });
}

/**
 * 생성 결과 중 단일 candidate URL 삭제.
 * 마지막 하나를 지우면 서버가 generation row 도 cascade 로 삭제 → `generationDeleted: true`.
 * 낙관적 업데이트로 리스트 cache 에서 해당 candidate 만 즉시 빼둔다.
 */
export function useDeleteCandidate() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      apiClient.delete<{
        ok: true;
        generationDeleted: boolean;
        remaining: number;
      }>(`/api/thumbnail-analysis/generations/${id}/candidates`, { url }),
    onMutate: async ({ id, url }) => {
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      queryClient.setQueryData<ThumbnailGenerationItem[]>(qKey, (old) => {
        if (!old) return old ?? [];
        const next: ThumbnailGenerationItem[] = [];
        for (const g of old) {
          if (g.id !== id) {
            next.push(g);
            continue;
          }
          const remaining = (g.candidates ?? []).filter((c) => c.url !== url);
          if (remaining.length === 0) continue; // generation 도 cascade 삭제
          next.push({
            ...g,
            candidates: remaining,
            selectedUrl: g.selectedUrl === url ? null : g.selectedUrl,
          });
        }
        return next;
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });
}

interface ReEditParams {
  id: string;
  purpose?: 'compliance' | 'quality';
  variantKey?: RecomposeVariantKey;
}

export function useReEditGeneration() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: (params: string | ReEditParams) => {
      // 호환성 유지: 기존 호출(string id)도 그대로 동작.
      const { id, purpose, variantKey } =
        typeof params === 'string' ? { id: params, purpose: undefined, variantKey: undefined } : params;
      const body: { purpose?: string; variantKey?: string } = {};
      if (purpose) body.purpose = purpose;
      if (variantKey) body.variantKey = variantKey;
      return apiClient.post(`/api/thumbnail-analysis/generations/${id}/re-edit`, body);
    },
    onMutate: async (params) => {
      const id = typeof params === 'string' ? params : params.id;
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      // 즉시 generating으로 낙관적 업데이트 (UI에서 생성 중 탭으로 이동)
      queryClient.setQueryData<ThumbnailGenerationItem[]>(
        qKey,
        (old) =>
          old?.map((g): ThumbnailGenerationItem =>
            g.id === id ? { ...g, status: 'running', phase: null, candidates: [] } : g,
          ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });
}

interface CreateEditJobsParams {
  contentWorkspaceIds: string[];
  purpose?: 'compliance' | 'quality';
  /**
   * 사용자가 카드에서 선택한 recompose variant.
   * single-product trigger 에서만 의미가 있음. 미지정 → 서버가 auto 처리.
   */
  variantKey?: RecomposeVariantKey;
}

export function useCreateEditJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateEditJobsParams) =>
      apiClient.post<ThumbnailGenerationItem[]>('/api/thumbnail-analysis/edit-jobs', params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnailAnalysis.generations(),
      });
    },
  });
}

export function useWingRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => registerWingThumbnailViaExtension(id),
    onSettled: () => invalidateThumbnailRegistration(queryClient),
  });
}

export interface WingBatchItemResult {
  id: string;
  success: boolean;
  screenshotPath: string | null;
  error?: string;
}

export function useBatchWingRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (generationIds: string[]) => {
      const results: WingBatchItemResult[] = [];
      for (const id of generationIds) {
        try {
          const result: WingRegistrationResult = await registerWingThumbnailViaExtension(id);
          // 배치의 성공은 "Wing 수정 화면에 올렸다" 이다. 반영은 운영자가 저장 뒤 확인한다.
          const uploaded = wingUploadReached(result);
          results.push({
            id,
            success: uploaded,
            screenshotPath: result.screenshotPath,
            ...(!uploaded && result.error ? { error: result.error } : {}),
          });
        } catch (error) {
          results.push({
            id,
            success: false,
            screenshotPath: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { results };
    },
    onSettled: () => invalidateThumbnailRegistration(queryClient),
  });
}

/** "확인 중" 인 같은 실행을 확장에 다시 보낸다(`executionId` 는 `registrationExecutionId`). */
export function useResendWingRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => resendWingThumbnailViaExtension(executionId),
    onSettled: () => invalidateThumbnailRegistration(queryClient),
  });
}

/** "반영됨으로 표시" — 운영자가 Wing 에서 저장한 것을 확인했다. 성공으로 가는 유일한 길이다. */
export function useConfirmRegistrationApplied() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => confirmWingThumbnailApplied(executionId),
    onSettled: () => invalidateThumbnailRegistration(queryClient),
  });
}

/** "반영 안 됨으로 표시" — 결과를 모르는 실행을 끝내 새 등록을 연다. */
export function useMarkRegistrationNotApplied() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => markWingThumbnailNotApplied(executionId),
    onSettled: () => invalidateThumbnailRegistration(queryClient),
  });
}

/** 운영자가 치운 실패는 최근 실행 목록에서 빠진다(행은 Channels 에 남는다). */
export function useClearRegistrationError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ dismissed: boolean }>(
        `/api/channels/thumbnail-executions/failed/${encodeURIComponent(id)}`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailExecutions.all }),
  });
}
