'use client';

import { useEffect, useMemo } from 'react';
import { useGenerationList } from '../../../_shared/hooks/useThumbnailGenerations';
import { resolveImageUrl } from '@/lib/resolve-url';
import type { EditorMode, HistoryCandidate } from '../lib/edit-page-types';

interface Args {
  productId: string | null;
  sourceCandidateId?: string | null;
  mode: EditorMode;
  result: Array<{ url: string; filename: string }>;
  generationId: string | null;
  selectedCandidateUrl: string | null;
  setSelectedCandidateUrl: (url: string | null) => void;
}

export function useEditorHistory({
  productId, sourceCandidateId, mode, result, generationId,
  selectedCandidateUrl, setSelectedCandidateUrl,
}: Args) {
  const { data: allGenerations = [] } = useGenerationList();

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
    for (const c of result) {
      push({ ...c, method: currentMethod, createdAt: nowIso, generationId });
    }
    if (productId || sourceCandidateId) {
      const workspaceGens = allGenerations
        .filter((g) => productId
          ? g.productId === productId
          : g.sourceCandidateId === sourceCandidateId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const gen of workspaceGens) {
        for (const c of gen.candidates ?? []) {
          push({ ...c, method: gen.method, createdAt: gen.createdAt, generationId: gen.id });
        }
      }
    }
    return list;
  }, [allGenerations, productId, sourceCandidateId, result, mode, generationId]);

  const recommendedCandidateUrl = useMemo(() => {
    if (!productId && !sourceCandidateId) return null;
    const scored = allGenerations.filter(
      (g) => (productId
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
  }, [allGenerations, productId, sourceCandidateId]);

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
