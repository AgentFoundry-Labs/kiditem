'use client';
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RecomposeVariantKey, ThumbnailJobListResponse, ThumbnailJobWorkspaceSummary } from '@kiditem/shared/ai';
import type { ContentAssetItem, ThumbnailJob } from '@kiditem/shared/product-content';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { thumbnailRegistrationFor, type ThumbnailRegistrationFields } from '../lib/thumbnail-registration';
import { isThumbnailJobActive } from '../lib/thumbnail-status';
import { useThumbnailExecutionStatuses } from './useRepresentativeImage';

/**
 * 대표이미지 생성 job 한 줄(KID-313 W3a). job 은 상태만 갖고, 결과 후보는 콘텐츠 자산(`thumbnailGenerationId`
 * 가 이 job)이다. 채택은 작업공간의 대표이미지 자산 하나를 바꾸는 일이라 `adoptedCandidate` 는 이 job 의 후보 중
 * 지금 대표이미지인 것이다.
 */
export interface ThumbnailJobView extends ThumbnailJob {
  candidates: ContentAssetItem[];
  workspace: ThumbnailJobWorkspaceSummary | null;
  adoptedCandidate: ContentAssetItem | null;
}

/** job 과 그 후보의 몰 반영 상태(Channels 실행, 판매상품 · 자산 기준). */
export type ThumbnailJobListItem = ThumbnailJobView & ThumbnailRegistrationFields;

export type ThumbnailJobListScope = 'workspace-bound' | 'direct-upload' | 'all';

export function toThumbnailJobViews(response: ThumbnailJobListResponse | null | undefined): ThumbnailJobView[] {
  if (!response) return [];
  const workspaces = new Map(response.workspaces.map((workspace) => [workspace.id, workspace] as const));
  return response.items.map((job) => {
    const candidates = response.candidates
      .filter((candidate) => candidate.thumbnailGenerationId === job.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      ...job,
      candidates,
      workspace: workspaces.get(job.contentWorkspaceId) ?? null,
      adoptedCandidate: candidates.find((candidate) => candidate.isCurrentThumbnail) ?? null,
    };
  });
}

export function thumbnailJobTitle(job: Pick<ThumbnailJobView, 'workspace'>, fallback = '상품 정보 없음'): string {
  return job.workspace?.name?.trim() || fallback;
}

function jobListParams(params: { scope?: ThumbnailJobListScope; limit?: number; contentWorkspaceId?: string | null }) {
  const query: Record<string, string> = {};
  if (params.contentWorkspaceId) query.contentWorkspaceId = params.contentWorkspaceId;
  if (params.scope && params.scope !== 'workspace-bound') query.scope = params.scope;
  if (params.limit) query.limit = String(params.limit);
  return query;
}

export function useThumbnailJobs(
  params: {
    scope?: ThumbnailJobListScope;
    limit?: number;
    contentWorkspaceId?: string | null;
    enabled?: boolean;
  } = {},
) {
  const queryParams = jobListParams(params);
  const qs = new URLSearchParams(queryParams).toString();
  const jobs = useQuery({
    queryKey: queryKeys.thumbnailJobs.list(Object.keys(queryParams).length > 0 ? queryParams : undefined),
    enabled: params.enabled ?? true,
    queryFn: async () => {
      const href = qs ? `/api/ai/thumbnail-jobs?${qs}` : '/api/ai/thumbnail-jobs';
      return toThumbnailJobViews(await apiClient.get<ThumbnailJobListResponse>(href));
    },
    staleTime: 1000,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const data = query.state.data;
      if (!data) return 3000;
      return data.some(isThumbnailJobActive) ? 3000 : false;
    },
  });
  // 몰 반영 상태는 목록의 모든 판매상품에 대해 한 번에 읽는다 — Agent 가 올린 실행도 화면에 출구가 있어야 한다.
  const salesProductIds = useMemo(
    () => [...new Set((jobs.data ?? []).flatMap((job) => (job.workspace?.salesProductId ? [job.workspace.salesProductId] : [])))],
    [jobs.data],
  );
  const executions = useThumbnailExecutionStatuses(salesProductIds);
  const data = useMemo<ThumbnailJobListItem[] | undefined>(
    () =>
      jobs.data?.map((job) => ({
        ...job,
        ...thumbnailRegistrationFor(executions.data ?? [], {
          salesProductId: job.workspace?.salesProductId ?? null,
          assetIds: job.candidates.map((candidate) => candidate.id),
        }),
      })),
    [jobs.data, executions.data],
  );
  // 몰 반영 상태가 오기 전에는 "등록 안 됨" 처럼 보이지 않게 로딩으로 본다.
  const statusLoading = salesProductIds.length > 0 && executions.isLoading;
  const refetch = useCallback(async () => {
    const result = await jobs.refetch();
    await executions.refetch();
    return result;
  }, [jobs, executions]);
  return {
    data,
    isLoading: jobs.isLoading || statusLoading,
    isError: jobs.isError || executions.isError,
    error: jobs.error ?? executions.error,
    refetch,
  };
}

/** job 하나(편집 화면이 지켜보는 job). 진행 중이면 2.5초마다 다시 읽는다. */
export function useThumbnailJob(jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.thumbnailJobs.detail(jobId ?? 'none'),
    enabled: Boolean(jobId),
    queryFn: async () =>
      toThumbnailJobViews(
        await apiClient.get<ThumbnailJobListResponse>(`/api/ai/thumbnail-jobs/${encodeURIComponent(jobId!)}`),
      )[0] ?? null,
    refetchInterval: (query) => {
      const job = query.state.data;
      return job && isThumbnailJobActive(job) ? 2500 : false;
    },
  });
}

export function invalidateThumbnailJobs(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailJobs.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailExecutions.all }),
  ]);
}

export function useSkipThumbnailJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/api/ai/thumbnail-jobs/${encodeURIComponent(id)}/skip`, {}),
    onSettled: () => invalidateThumbnailJobs(queryClient),
  });
}

export function useCancelThumbnailJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/ai/thumbnail-jobs/${encodeURIComponent(id)}/cancel`, { reason: '사용자 요청' }),
    onSettled: () => invalidateThumbnailJobs(queryClient),
  });
}

/** job 과 그 후보 자산을 지운다. 후보가 대표이미지로 채택돼 있으면 서버가 409 로 거절한다. */
export function useDeleteThumbnailJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/ai/thumbnail-jobs/${encodeURIComponent(id)}`),
    onSettled: () => invalidateThumbnailJobs(queryClient),
  });
}

/** 후보 자산 하나를 지운다. 마지막 후보면 서버가 job 도 지운다(`generationDeleted`). 채택된 후보는 409. */
export function useDeleteThumbnailCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, assetId }: { jobId: string; assetId: string }) =>
      apiClient.delete<{ ok: true; generationDeleted: boolean; remaining: number }>(
        `/api/ai/thumbnail-jobs/${encodeURIComponent(jobId)}/candidates`,
        { assetId },
      ),
    onSettled: () =>
      Promise.all([
        invalidateThumbnailJobs(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.all }),
      ]),
  });
}

interface ReEditParams {
  id: string;
  purpose?: 'compliance' | 'quality';
  variantKey?: RecomposeVariantKey;
}

/** 끝난 job 을 `input_meta` 의 입력 사진으로 다시 편집한다. 채택된 후보가 있으면 서버가 거절한다. */
export function useReEditThumbnailJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, purpose, variantKey }: ReEditParams) =>
      apiClient.post(`/api/ai/thumbnail-jobs/${encodeURIComponent(id)}/re-edit`, {
        ...(purpose ? { purpose } : {}),
        ...(variantKey ? { variantKey } : {}),
      }),
    onSettled: () => invalidateThumbnailJobs(queryClient),
  });
}

export function useCreateThumbnailEditJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { contentWorkspaceIds: string[]; purpose?: 'compliance' | 'quality'; variantKey?: RecomposeVariantKey }) =>
      apiClient.post<ThumbnailJob[]>('/api/ai/thumbnail-jobs/edit', params),
    onSettled: () => invalidateThumbnailJobs(queryClient),
  });
}
