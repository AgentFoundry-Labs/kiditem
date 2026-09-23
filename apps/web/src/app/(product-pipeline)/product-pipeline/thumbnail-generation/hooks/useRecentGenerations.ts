'use client';

import { useThumbnailJobs } from '../../_shared/hooks/useThumbnailJobs';

/** 이 작업공간의 최근 대표이미지 생성 job(후보 자산 포함). 작업공간이 없으면 읽지 않는다. */
export function useRecentGenerations(contentWorkspaceId: string | null, limit = 10) {
  return useThumbnailJobs({ contentWorkspaceId, limit, enabled: Boolean(contentWorkspaceId) });
}
