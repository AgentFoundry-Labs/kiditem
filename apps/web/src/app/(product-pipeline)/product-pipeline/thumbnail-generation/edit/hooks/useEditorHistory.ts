'use client';

import { useEffect, useMemo } from 'react';
import { useGenerationList } from '../../../_shared/hooks/useThumbnailGenerations';
import { resolveImageUrl } from '@/lib/resolve-url';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import type { EditorMode, HistoryCandidate } from '../lib/edit-page-types';

interface Args {
  productId: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
  mode: EditorMode;
  result: Array<{ url: string; filename: string }>;
  generationId: string | null;
  observedGeneration?: ThumbnailGenerationItem | null;
  selectedCandidateUrl: string | null;
  setSelectedCandidateUrl: (url: string | null) => void;
}

export function useEditorHistory({
  productId, sourceCandidateId, contentWorkspaceId, mode, result, generationId,
  observedGeneration, selectedCandidateUrl, setSelectedCandidateUrl,
}: Args) {
  const hasOwnerScope = Boolean(productId || sourceCandidateId || contentWorkspaceId);
  const { data: allGenerations = [] } = useGenerationList(
    hasOwnerScope
      ? { productId, sourceCandidateId, contentWorkspaceId, limit: 24 }
      : { scope: 'direct-upload', limit: 24 },
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
    const currentMethod = mode === 'creative' ? 'creative' : 'generate';
    const nowIso = new Date().toISOString();
    if (observedGeneration?.candidates?.length) {
      for (const c of observedGeneration.candidates) {
        push({
          ...c,
          method: observedGeneration.method,
          createdAt: observedGeneration.createdAt,
          generationId: observedGeneration.id,
        });
      }
    }
    for (const c of result) {
      push({ ...c, method: currentMethod, createdAt: nowIso, generationId });
    }
    if (hasOwnerScope) {
      const workspaceGens = allGenerations
        .filter((g) =>
          contentWorkspaceId
            ? g.contentWorkspaceId === contentWorkspaceId
            : productId
              ? g.productId === productId
              : g.sourceCandidateId === sourceCandidateId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const gen of workspaceGens) {
        for (const c of gen.candidates ?? []) {
          push({ ...c, method: gen.method, createdAt: gen.createdAt, generationId: gen.id });
        }
      }
    } else {
      for (const gen of allGenerations) {
        for (const c of gen.candidates ?? []) {
          push({ ...c, method: gen.method, createdAt: gen.createdAt, generationId: gen.id });
        }
      }
    }
    return list;
  }, [
    allGenerations,
    hasOwnerScope,
    productId,
    sourceCandidateId,
    contentWorkspaceId,
    result,
    mode,
    generationId,
    observedGeneration,
  ]);

  const recommendedCandidateUrl = useMemo(() => {
    if (!productId && !sourceCandidateId && !contentWorkspaceId) return null;
    const scored = allGenerations.filter(
      (g) => (contentWorkspaceId
        ? g.contentWorkspaceId === contentWorkspaceId
        : productId
          ? g.productId === productId
          : g.sourceCandidateId === sourceCandidateId) &&
        typeof g.score === 'number' &&
        g.score > 0,
    );
    if (scored.length === 0) return null;
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    const pick = best.selectedUrl ?? best.candidates?.[0]?.url ?? null;
    if (!pick) return null;
    return resolveImageUrl(pick) ?? pick;
  }, [allGenerations, productId, sourceCandidateId, contentWorkspaceId]);

  useEffect(() => {
    if (historyCandidates.length === 0) {
      if (selectedCandidateUrl) setSelectedCandidateUrl(null);
      return;
    }
    const firstUrl = resolveImageUrl(historyCandidates[0].url) ?? historyCandidates[0].url;
    const stillValid = historyCandidates.some(
      (c) => (resolveImageUrl(c.url) ?? c.url) === selectedCandidateUrl,
    );
    if (!stillValid) setSelectedCandidateUrl(firstUrl);
  }, [historyCandidates, selectedCandidateUrl, setSelectedCandidateUrl]);

  return { historyCandidates, recommendedCandidateUrl };
}
