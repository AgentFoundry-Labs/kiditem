'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Scissors } from 'lucide-react';
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
import { EditorControlPanel } from './components/EditorControlPanel';

type EditorMode = 'edit' | 'creative';

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const imageUrlParam = searchParams.get('imageUrl');
  const queryClient = useQueryClient();

  // 상품 정보 로드
  const { data: product } = useQuery({
    queryKey: queryKeys.products.detail(productId!),
    queryFn: () => apiClient.get<{ id: string; name: string; imageUrl: string | null }>(`/api/products/${productId}`),
    enabled: !!productId,
  });

  const productName = product?.name ?? '';
  const originalImageUrl = product?.imageUrl ?? null;

  // 모드 상태
  const [mode, setMode] = useState<EditorMode>('edit');

  // 입력 상태
  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(() => imageUrlParam);
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');
  const [composition, setComposition] = useState('');
  const [userPrompt, setUserPrompt] = useState('');

  // creative 모드 상태
  const [sceneType, setSceneType] = useState('white-studio');
  const [styleType, setStyleType] = useState('minimal');
  const [productDescription, setProductDescription] = useState('');

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
        purpose: mode === 'creative' ? 'quality' : purpose,
        mode,
        composition: mode === 'edit' ? (composition || undefined) : undefined,
        userPrompt: userPrompt || undefined,
        sceneType: mode === 'creative' ? sceneType : undefined,
        styleType: mode === 'creative' ? styleType : undefined,
        productDescription: mode === 'creative' ? (productDescription || undefined) : undefined,
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
    <div className="flex flex-col h-screen bg-white">
      {/* ── 헤더 + 모드 선택 ── */}
      <div
        className="flex-shrink-0 bg-gray-50"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        {/* 타이틀 행 */}
        <div className="flex items-center px-4 pt-3 pb-2 gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#eef0f2', border: '1px solid #e5e7eb' }}
          >
            <Sparkles size={15} className="text-violet-600" />
          </div>
          <h1 className="text-base font-bold text-gray-900 tracking-tight">썸네일 편집기</h1>
          {productName && <span className="text-xs text-gray-400 truncate">— {productName}</span>}
        </div>

        {/* 모드 탭 버튼 */}
        <div className="grid grid-cols-2 gap-0" style={{ borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={() => setMode('edit')}
            className="flex items-center gap-3 px-5 py-5 text-left transition-all duration-200"
            style={{
              background: mode === 'edit' ? 'rgba(139,92,246,0.08)' : 'transparent',
              borderRight: '1px solid #e5e7eb',
              borderBottom: mode === 'edit' ? '2px solid #7c3aed' : '2px solid transparent',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: mode === 'edit' ? 'rgba(139,92,246,0.15)' : '#f3f4f6' }}
            >
              <Scissors size={16} style={{ color: mode === 'edit' ? '#7c3aed' : '#9ca3af' }} />
            </div>
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: mode === 'edit' ? '#6d28d9' : '#374151' }}>이미지 편집</div>
              <div className="text-[11px] mt-0.5 text-gray-400">배경 제거 · 가이드라인 · 구도</div>
            </div>
          </button>

          <button
            onClick={() => setMode('creative')}
            className="flex items-center gap-3 px-5 py-5 text-left transition-all duration-200"
            style={{
              background: mode === 'creative' ? 'rgba(217,70,239,0.07)' : 'transparent',
              borderBottom: mode === 'creative' ? '2px solid #c026d3' : '2px solid transparent',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: mode === 'creative' ? 'rgba(217,70,239,0.12)' : '#f3f4f6' }}
            >
              <Sparkles size={16} style={{ color: mode === 'creative' ? '#c026d3' : '#9ca3af' }} />
            </div>
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: mode === 'creative' ? '#a21caf' : '#374151' }}>AI 연출 생성</div>
              <div className="text-[11px] mt-0.5 text-gray-400">컨셉씬 · 라이프스타일 · 무드샷</div>
            </div>
          </button>
        </div>
      </div>

      {/* 3패널 */}
      <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr_300px]">
        <EditorInputPanel
          mode={mode}
          productId={productId}
          productName={productName}
          packagingImage={packagingImage}
          productImage={effectiveProductImage}
          onPackagingChange={setPackagingImage}
          onProductImageChange={setProductImage}
        />

        <EditorResultPanel
          mode={mode}
          originalImage={originalImageUrl ?? productImage}
          candidates={result}
          selectedCandidateUrl={selectedCandidateUrl}
          isGenerating={generateMutation.isPending}
          onSelectCandidate={handleSelectCandidate}
        />

        <EditorControlPanel
          mode={mode}
          purpose={purpose}
          composition={composition}
          userPrompt={userPrompt}
          sceneType={sceneType}
          styleType={styleType}
          productDescription={productDescription}
          isPending={generateMutation.isPending}
          hasInput={hasInput}
          selectedCandidateUrl={selectedCandidateUrl}
          generationId={generationId}
          isApplying={applyGenerationMutation.isPending}
          isSkipping={skipGenerationMutation.isPending}
          onPurposeChange={setPurpose}
          onCompositionChange={setComposition}
          onUserPromptChange={setUserPrompt}
          onSceneTypeChange={setSceneType}
          onStyleTypeChange={setStyleType}
          onProductDescriptionChange={setProductDescription}
          onGenerate={handleGenerate}
          onCoupang={handleCoupang}
          onSkip={handleSkip}
        />
      </div>
    </div>
  );
}
