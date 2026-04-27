'use client';
import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { ThumbnailGenerationItem } from '@kiditem/shared';
import {
  useGenerationList,
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
  useDeleteGeneration,
} from '@/hooks/useThumbnailGenerations';
import { ProductCard } from '@/components/thumbnails/ProductCard';
import { DetailModal } from '@/components/thumbnails/DetailModal';
import { ThumbnailStatusBadge } from '@/components/thumbnails/ThumbnailStatusBadge';
import { isReady, isApplied } from '@/lib/thumbnail-status';
import { openCoupangWingInventory } from '@/lib/coupang-wing';

export function EditorHistoryTab() {
  const { data: allGenerations = [] } = useGenerationList();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();
  const deleteGenerationMutation = useDeleteGeneration();

  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);

  // 편집기에서 생성된 것만 (method: 'generate')
  const generations = allGenerations.filter((g) => g.method === 'generate');

  // 폴링 동기화: 선택된 gen의 상태가 바뀌면 업데이트
  useEffect(() => {
    if (!selectedGen) return;
    const latest = allGenerations.find((g) => g.id === selectedGen.id);
    if (!latest) return;
    const changed =
      latest.status !== selectedGen.status ||
      latest.candidates.length !== selectedGen.candidates.length ||
      latest.selectedUrl !== selectedGen.selectedUrl;
    if (changed) setSelectedGen(latest);
  }, [allGenerations, selectedGen]);

  const handleSelectCandidate = async (selectedUrl: string) => {
    if (!selectedGen) return;
    await selectCandidateMutation.mutateAsync({ id: selectedGen.id, selectedUrl });
    setSelectedGen((prev) => (prev ? { ...prev, selectedUrl, status: 'succeeded', phase: 'ready' } : prev));
  };

  const handleApply = () => {
    if (!selectedGen) return;
    openCoupangWingInventory();
    applyGenerationMutation.mutate(selectedGen.id);
    setSelectedGen(null);
  };

  const handleSkip = async () => {
    if (!selectedGen) return;
    await skipGenerationMutation.mutateAsync(selectedGen.id);
    setSelectedGen(null);
  };

  const handleDelete = async () => {
    if (!selectedGen) return;
    await deleteGenerationMutation.mutateAsync(selectedGen.id);
    setSelectedGen(null);
  };

  if (generations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <History size={24} className="text-slate-300" />
        </div>
        <div className="text-sm font-semibold text-slate-400 mb-1">편집 이력이 없습니다</div>
        <div className="text-xs text-slate-300">상품을 연결하여 편집하면 여기에 저장됩니다</div>
      </div>
    );
  }

  const productGenerations = selectedGen
    ? allGenerations.filter((g) => g.productId === selectedGen.productId)
    : [];

  return (
    <>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {generations.map((gen) => (
          <ProductCard
            key={gen.id}
            imageUrl={gen.selectedUrl ?? gen.originalUrl ?? gen.product.imageUrl}
            name={gen.product.name}
            badge={<ThumbnailStatusBadge status={gen.status} phase={gen.phase ?? null} />}
            overlay={
              gen.status === 'running' || gen.status === 'pending'
                ? 'generating'
                : isApplied(gen)
                ? 'applied'
                : gen.status === 'cancelled'
                ? 'skipped'
                : isReady(gen)
                ? 'selected'
                : undefined
            }
            onClick={() => setSelectedGen(gen)}
          />
        ))}
      </div>

      {selectedGen && (
        <DetailModal
          product={null}
          gen={selectedGen}
          productGenerations={productGenerations}
          isAiAnalyzing={false}
          generatedProductIds={new Set(generations.map((g) => g.productId))}
          onClose={() => setSelectedGen(null)}
          onAiAnalyze={() => {}}
          onEditCompliance={() => {}}
          onEditQuality={() => {}}
          onSelectCandidate={handleSelectCandidate}
          onApply={handleApply}
          onSkip={handleSkip}
          onDelete={handleDelete}
          onSelectGen={(g) => setSelectedGen(g)}
        />
      )}
    </>
  );
}
