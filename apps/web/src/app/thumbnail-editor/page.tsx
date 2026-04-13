'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
} from '@/hooks/useThumbnailGenerations';
import { openCoupangWingInventory } from '@/lib/coupang-wing';

import { useGenerateThumbnail } from './hooks/useThumbnailEditor';
import { EditorInputPanel } from './components/EditorInputPanel';
import { EditorResultPanel } from './components/EditorResultPanel';

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const imageUrlParam = searchParams.get('imageUrl');
  const queryClient = useQueryClient();

  // 상품 정보 로드 (useQuery)
  const { data: product } = useQuery({
    queryKey: queryKeys.products.detail(productId!),
    queryFn: () => apiClient.get<{ id: string; name: string; imageUrl: string | null }>(`/api/products/${productId}`),
    enabled: !!productId,
  });

  const productName = product?.name ?? '';
  const originalImageUrl = product?.imageUrl ?? null;

  // 입력 상태
  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(() => imageUrlParam);
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');

  // productId 진입 시 imageUrl 파라미터 없으면 상품 이미지 사용
  const effectiveProductImage = productImage ?? (imageUrlParam ? null : originalImageUrl);

  // 결과 상태
  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  // 훅
  const generateMutation = useGenerateThumbnail();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();

  const handleGenerate = async () => {
    try {
      const data = await generateMutation.mutateAsync({
        productId: productId ?? undefined,
        packagingImage: packagingImage ?? undefined,
        productImage: effectiveProductImage ?? undefined,
        purpose,
      });
      if (data?.candidates) {
        setResult(data.candidates);
        setGenerationId(data.generationId ?? null);
        setSelectedCandidateUrl(null);
        // 이력 탭 즉시 반영
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
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const handleSkip = async () => {
    if (generationId) {
      await skipGenerationMutation.mutateAsync(generationId);
    }
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const hasInput = !!productId || !!packagingImage || !!productImage;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">썸네일 편집기</h1>
            <p className="text-xs text-slate-400">
              {productName || '이미지를 업로드하여 쿠팡 가이드라인에 맞는 썸네일을 생성합니다'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 좌: 입력 패널 */}
        <EditorInputPanel
          productId={productId}
          productName={productName}
          originalImageUrl={originalImageUrl}
          packagingImage={packagingImage}
          productImage={productImage}
          composition={composition}
          purpose={purpose}
          isPending={generateMutation.isPending}
          hasInput={hasInput}
          onPackagingChange={setPackagingImage}
          onProductImageChange={setProductImage}
          onCompositionChange={setComposition}
          onPurposeChange={setPurpose}
          onGenerate={handleGenerate}
        />

        {/* 우: 결과 패널 */}
        <EditorResultPanel
          originalImage={originalImageUrl ?? productImage}
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
    </div>
  );
}
