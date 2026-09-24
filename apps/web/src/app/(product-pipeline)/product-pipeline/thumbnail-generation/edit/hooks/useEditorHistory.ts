'use client';

import { useEffect, useMemo } from 'react';
import { resolveImageUrl } from '@/lib/resolve-url';
import { useThumbnailJobs, type ThumbnailJobView } from '../../../_shared/hooks/useThumbnailJobs';
import type { EditorMode, HistoryCandidate } from '../lib/edit-page-types';

interface Args {
  contentWorkspaceId?: string | null;
  mode: EditorMode;
  result: Array<{ url: string; filename: string }>;
  generationId: string | null;
  observedGeneration?: ThumbnailJobView | null;
  selectedCandidateUrl: string | null;
  setSelectedCandidateUrl: (url: string | null) => void;
}

function candidateFilename(url: string): string {
  return url.split('/').pop()?.split('?')[0] || url;
}

/** 편집 화면의 결과 이력: 지켜보는 job 의 후보, 방금 받은 결과, 그 작업공간(또는 직접 업로드)의 이전 후보. */
export function useEditorHistory({
  contentWorkspaceId,
  mode,
  result,
  generationId,
  observedGeneration,
  selectedCandidateUrl,
  setSelectedCandidateUrl,
}: Args) {
  const hasOwnerScope = Boolean(contentWorkspaceId);
  const { data: allJobs = [] } = useThumbnailJobs(
    hasOwnerScope ? { contentWorkspaceId, limit: 24 } : { scope: 'direct-upload', limit: 24 },
  );

  const historyCandidates = useMemo<HistoryCandidate[]>(() => {
    const list: HistoryCandidate[] = [];
    const seen = new Set<string>();
    const push = (c: HistoryCandidate) => {
      const key = resolveImageUrl(c.url) ?? c.url;
      if (seen.has(key)) return;
      seen.add(key);
      list.push(c);
    };
    const pushJob = (job: ThumbnailJobView) => {
      for (const c of job.candidates) {
        push({
          url: c.url,
          filename: c.label ?? candidateFilename(c.url),
          method: job.method,
          createdAt: String(job.createdAt),
          generationId: job.id,
          assetId: c.id,
        });
      }
    };
    const currentMethod = mode === 'creative' ? 'creative' : 'generate';
    const nowIso = new Date().toISOString();
    if (observedGeneration) pushJob(observedGeneration);
    for (const c of result) {
      push({ ...c, method: currentMethod, createdAt: nowIso, generationId, assetId: null });
    }
    // 생성 job 은 콘텐츠 작업공간으로만 이어진다(KID-310).
    const jobs = hasOwnerScope
      ? allJobs
        .filter((job) => job.contentWorkspaceId === contentWorkspaceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : allJobs;
    for (const job of jobs) pushJob(job);
    return list;
  }, [allJobs, hasOwnerScope, contentWorkspaceId, result, mode, generationId, observedGeneration]);

  useEffect(() => {
    if (historyCandidates.length === 0) {
      if (selectedCandidateUrl) setSelectedCandidateUrl(null);
      return;
    }
    const firstUrl = resolveImageUrl(historyCandidates[0].url) ?? historyCandidates[0].url;
    const stillValid = historyCandidates.some((c) => (resolveImageUrl(c.url) ?? c.url) === selectedCandidateUrl);
    if (!stillValid) setSelectedCandidateUrl(firstUrl);
  }, [historyCandidates, selectedCandidateUrl, setSelectedCandidateUrl]);

  // 평가 점수로 후보를 추천하던 분석은 없어졌다(KID-313 W3a) — 추천은 없다.
  return { historyCandidates, recommendedCandidateUrl: null as string | null };
}
