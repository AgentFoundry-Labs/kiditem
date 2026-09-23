'use client';

import { useThumbnailJobs } from './useThumbnailJobs';

/**
 * 이 작업공간의 대표이미지 생성 job(후보 자산 포함). 작업공간이 없으면(첫 생성 전) 읽지 않는다 — 원천 기록 id 로
 * 묻지 않는다(서버는 그 필터를 400 으로 거절한다).
 */
export function useSourcingThumbnailGenerations(contentWorkspaceId: string | null | undefined) {
  return useThumbnailJobs({ contentWorkspaceId, limit: 20, enabled: Boolean(contentWorkspaceId) });
}
