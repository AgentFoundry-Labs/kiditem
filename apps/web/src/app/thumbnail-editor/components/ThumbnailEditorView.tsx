'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
} from '@/hooks/useThumbnailGenerations';
import { openCoupangWingInventory } from '@/lib/coupang-wing';

import { useGenerateThumbnail } from '../hooks/useThumbnailEditor';
import { EditorInputPanel } from './EditorInputPanel';
import { EditorResultPanel } from './EditorResultPanel';

/**
 * 썸네일 편집기 핵심 UI — 페이지 래퍼 없이 어디서든 임베드 가능
 */
export function ThumbnailEditorView() {
  const queryClient = useQueryClient();

  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');

  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  const generateMutation = useGenerateThumbnail();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();

  const hasInput = !!packagingImage || !!productImage;

  const handleGenerate = async () => {
    try {
      const data = await generateMutation.mutateAsync({
        packagingImage: packagingImage ?? undefined,
        productImage: productImage ?? undefined,
        purpose,
      });
      if (data?.candidates) {
        setResult(data.candidates);
        setGenerationId(data.generationId ?? null);
        setSelectedCandidateUrl(null);
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
        toast.success(`썸네일 ${data.candidates.length}장 생성 완료`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '썸네일 생성 실패');
    }
  };

  const handleSelectCandidate = (url: string) => {
    setSelectedCandidateUrl(url || null);
    if (generationId && url) {
      selectCandidateMutation.mutate({ id: generationId, selectedUrl: url });
    }
  };

  const handleCoupang = async () => {
    try {
      const status = await apiClient.get<{ connected: boolean; error?: string }>(
        '/api/thumbnail-analysis/playwriter-status',
      );
      if (!status.connected) {
        toast.error('Playwriter가 연결되어 있지 않습니다. Playwriter를 실행한 후 다시 시도하세요.');
        return;
      }
    } catch {
      toast.error('Playwriter 상태를 확인할 수 없습니다. 서버 연결을 확인하세요.');
      return;
    }
    openCoupangWingInventory();
    if (generationId) {
      applyGenerationMutation.mutate(generationId);
    }
  };

  const handleSkip = async () => {
    if (generationId) {
      await skipGenerationMutation.mutateAsync(generationId);
    }
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <EditorInputPanel
        productId={null}
        productName=""
        originalImageUrl={null}
        packagingImage={packagingImage}
        productImage={productImage}
        composition=""
        purpose={purpose}
        isPending={generateMutation.isPending}
        hasInput={hasInput}
        onPackagingChange={setPackagingImage}
        onProductImageChange={setProductImage}
        onCompositionChange={() => {}}
        onPurposeChange={setPurpose}
        onGenerate={handleGenerate}
      />

      <EditorResultPanel
        originalImage={null}
        candidates={result}
        selectedCandidateUrl={selectedCandidateUrl}
        generationId={generationId}
        isApplying={applyGenerationMutation.isPending}
        isSkipping={skipGenerationMutation.isPending}
        onSelectCandidate={handleSelectCandidate}
        onCoupang={handleCoupang}
        onSkip={handleSkip}
      />
    </div>
  );
}
