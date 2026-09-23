'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ThumbnailJobListResponse } from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** 이 화면에서 AI 작업을 시작한 초안 하나와 서버가 돌려준 생성 id. */
export interface StartedGeneration {
  salesProductId: string;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  /** 시작 응답을 받은 시각(ms). 이보다 먼저 읽은 목록에는 이 생성이 아직 없을 수 있다. */
  startedAt: number;
}

export const STARTED_GENERATION_POLL_MS = 15_000;

interface StatusRow {
  id: string;
  status: string;
}

type Kind = 'detail' | 'thumbnail';

const RUNNING_STATUSES: Record<Kind, ReadonlySet<string>> = {
  detail: new Set(['pending', 'processing']),
  thumbnail: new Set(['pending', 'running']),
};

const PROGRESS_KEYS: Record<Kind, readonly unknown[]> = {
  detail: queryKeys.collectedProducts.startedProgress('detail'),
  thumbnail: queryKeys.collectedProducts.startedProgress('thumbnail'),
};

function generationIdOf(item: StartedGeneration, kind: Kind): string | null {
  return kind === 'detail' ? item.detailGenerationId : item.thumbnailGenerationId;
}

/** 목록이 끝났다고 하기 전까지는 돈다. 시작 뒤에 읽은 목록에도 없으면 끝난 것으로 본다. */
function runningFor(
  kind: Kind,
  started: readonly StartedGeneration[],
  rows: StatusRow[] | undefined,
  dataUpdatedAt: number,
): StartedGeneration[] {
  return started.filter((item) => {
    const generationId = generationIdOf(item, kind);
    if (!generationId) return false;
    const row = rows?.find((candidate) => candidate.id === generationId);
    if (row) return RUNNING_STATUSES[kind].has(row.status);
    return !rows || dataUpdatedAt < item.startedAt;
  });
}

function cachedRunning(queryClient: QueryClient, kind: Kind, started: readonly StartedGeneration[]) {
  const state = queryClient.getQueryState<StatusRow[]>(PROGRESS_KEYS[kind]);
  return runningFor(kind, started, state?.data, state?.dataUpdatedAt ?? 0);
}

/**
 * 폴링 간격. 도는 생성이 없으면 멈춘다.
 *
 * 예산(`apps/web/CLAUDE.md`, 이 화면은 탭당 분당 최대 4회): 한 종류만 돌면 그 목록 하나를 15초마다
 * → 60 / 15 = 분당 4회. 상세 · 썸네일이 함께 돌면 두 목록을 각각 30초마다 → 2 × 60 / 30 = 분당 4회.
 * 카드 수와 무관하고, 도는 것이 없으면 0회다.
 */
function pollInterval(queryClient: QueryClient, kind: Kind, started: readonly StartedGeneration[]): number | false {
  if (cachedRunning(queryClient, kind, started).length === 0) return false;
  const other: Kind = kind === 'detail' ? 'thumbnail' : 'detail';
  const otherRunning = cachedRunning(queryClient, other, started).length > 0;
  return otherRunning ? STARTED_GENERATION_POLL_MS * 2 : STARTED_GENERATION_POLL_MS;
}

/**
 * 이 화면이 시작한 생성의 진행 — 종류마다 목록 한 번에 묻고 생성 id 로 맞춘다.
 *
 * 카드는 스스로 묻지 않는다. 다른 곳에서 시작한 생성은 여기 보이지 않고, 그 상품의 작업공간
 * 화면이 보여준다.
 */
export function useStartedGenerationProgress(started: readonly StartedGeneration[]) {
  const queryClient = useQueryClient();
  const hasDetail = started.some((item) => item.detailGenerationId);
  const hasThumbnail = started.some((item) => item.thumbnailGenerationId);

  const detailQuery = useQuery({
    queryKey: PROGRESS_KEYS.detail,
    enabled: hasDetail && cachedRunning(queryClient, 'detail', started).length > 0,
    // 조직 전체의 최근 상세페이지(필터 없음) — 이 화면이 시작한 id 만 골라 본다.
    queryFn: async (): Promise<StatusRow[]> => {
      const rows = await apiClient.get<Array<{ id: string; imageProcessingStatus: string }>>('/api/ai/detail-page');
      return rows.map((row) => ({ id: row.id, status: row.imageProcessingStatus }));
    },
    refetchInterval: () => pollInterval(queryClient, 'detail', started),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const thumbnailQuery = useQuery({
    queryKey: PROGRESS_KEYS.thumbnail,
    enabled: hasThumbnail && cachedRunning(queryClient, 'thumbnail', started).length > 0,
    queryFn: async (): Promise<StatusRow[]> => {
      const response = await apiClient.get<ThumbnailJobListResponse>(
        '/api/thumbnail-analysis/generations?limit=100',
      );
      return response.items.map((row) => ({ id: row.id, status: row.status }));
    },
    refetchInterval: () => pollInterval(queryClient, 'thumbnail', started),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const runningDetail = runningFor('detail', started, detailQuery.data, detailQuery.dataUpdatedAt);
  const runningThumbnail = runningFor('thumbnail', started, thumbnailQuery.data, thumbnailQuery.dataUpdatedAt);

  return {
    runningSalesProductIds: new Set([...runningDetail, ...runningThumbnail].map((item) => item.salesProductId)),
    runningDetailCount: runningDetail.length,
    runningThumbnailCount: runningThumbnail.length,
  };
}
