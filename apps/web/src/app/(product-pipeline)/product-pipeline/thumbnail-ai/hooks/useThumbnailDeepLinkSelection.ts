'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isApplied } from '../../_shared/lib/thumbnail-status';
import type { MainTabKey } from '../components/ThumbnailMainTabs';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';

interface UseThumbnailDeepLinkSelectionArgs {
  generations: ThumbnailGenerationItem[];
  selectedGen: ThumbnailGenerationItem | null;
  setSelectedProduct: (product: ThumbnailAnalysisResult | null) => void;
  setSelectedGen: (generation: ThumbnailGenerationItem | null) => void;
  setActiveTab: (tab: MainTabKey) => void;
  setHistorySubTab: (tab: 'history' | 'tracking') => void;
  setEditFilter: (filter: 'pending' | 'generating' | 'ready' | 'applied' | 'failed') => void;
}

export function useThumbnailDeepLinkSelection({
  generations,
  selectedGen,
  setSelectedProduct,
  setSelectedGen,
  setActiveTab,
  setHistorySubTab,
  setEditFilter,
}: UseThumbnailDeepLinkSelectionArgs) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkGenerationId = searchParams.get('generationId');
  const handledDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedGen) return;
    const latest = generations.find((g) => g.id === selectedGen.id);
    if (!latest) return;
    const changed =
      latest.status !== selectedGen.status ||
      latest.candidates.length !== selectedGen.candidates.length ||
      latest.selectedUrl !== selectedGen.selectedUrl;
    if (changed) setSelectedGen(latest);
  }, [generations, selectedGen, setSelectedGen]);

  useEffect(() => {
    if (!deepLinkGenerationId) return;
    if (handledDeepLinkRef.current === deepLinkGenerationId) return;

    const generation = generations.find((g) => g.id === deepLinkGenerationId);
    if (!generation) return;

    handledDeepLinkRef.current = deepLinkGenerationId;
    setSelectedProduct(null);
    setSelectedGen(generation);
    if (isApplied(generation)) {
      setActiveTab('history');
      setHistorySubTab('history');
    } else if (generation.status === 'failed' || generation.status === 'cancelled') {
      setActiveTab('ai-edit');
      setEditFilter('failed');
    } else if (generation.status === 'pending' || generation.status === 'running') {
      setActiveTab('ai-edit');
      setEditFilter('generating');
    } else {
      setActiveTab('ai-edit');
      setEditFilter('ready');
    }
  }, [
    deepLinkGenerationId,
    generations,
    setActiveTab,
    setEditFilter,
    setHistorySubTab,
    setSelectedGen,
    setSelectedProduct,
  ]);

  const closeDetailModal = () => {
    setSelectedProduct(null);
    setSelectedGen(null);
    if (!deepLinkGenerationId) return;

    const next = new URLSearchParams(searchParams.toString());
    next.delete('generationId');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    handledDeepLinkRef.current = null;
  };

  return { closeDetailModal };
}
