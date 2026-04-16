'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Scissors, ShoppingBag, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
} from '@/hooks/useThumbnailGenerations';
import { openCoupangWingInventory } from '@/lib/coupang-wing';
import { ProductSelector } from '@/components/product/ProductSelector';
import { useProductImages } from '@/hooks/useProductImages';

import { useGenerateThumbnail } from './hooks/useThumbnailEditor';
import { EditorInputPanel } from './components/EditorInputPanel';
import { EditorResultPanel } from './components/EditorResultPanel';
import { EditorControlPanel } from './components/EditorControlPanel';
import { UseCaseSelection, type EditUseCase } from './components/UseCaseSelection';
import type { SupplementaryLabel } from './components/EditorInputPanel';

export type EditorMode = 'edit' | 'creative';

export default function ThumbnailEditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get('productId');
  const imageUrlParam = searchParams.get('imageUrl');
  const queryClient = useQueryClient();

  const { data: product } = useQuery({
    queryKey: queryKeys.products.detail(productId!),
    queryFn: () => apiClient.get<{ id: string; name: string; imageUrl: string | null }>(`/api/products/${productId}`),
    enabled: !!productId,
  });

  const productName = product?.name ?? '';
  const originalImageUrl = product?.imageUrl ?? null;

  // 모드 / 용도
  const [mode, setMode] = useState<EditorMode>('edit');
  const [editCase, setEditCase] = useState<EditUseCase | null>(null);

  // 공통 입력
  const [productImage, setProductImage] = useState<string | null>(() => imageUrlParam);
  const [userPrompt, setUserPrompt] = useState('');

  // compose (Type 2A)
  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [supplementaryLabel, setSupplementaryLabel] = useState<SupplementaryLabel>('박스');
  const [pieceCount, setPieceCount] = useState<number | null>(null);

  // color-variants (Type 2B)
  const [colorImages, setColorImages] = useState<string[]>([]);

  // creative (Type 3)
  const [sceneType, setSceneType] = useState('white-studio');
  const [styleType, setStyleType] = useState('minimal');
  const [productDescription, setProductDescription] = useState('');
  const [backgroundReference, setBackgroundReference] = useState<string | null>(null);

  // 허브 이미지 (1회 fetch — eng review #1)
  const { images: hubImages, loading: hubImagesLoading } = useProductImages(productId);

  // 결과
  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  const effectiveProductImage = productImage ?? (imageUrlParam ? null : originalImageUrl);

  const generateMutation = useGenerateThumbnail();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();

  const resetEditCase = () => {
    setEditCase(null);
    setPackagingImage(null);
    setColorImages([]);
    setSupplementaryLabel('박스');
    setPieceCount(null);
    setUserPrompt('');
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const hasInput = (() => {
    if (mode === 'creative') {
      if (sceneType === 'custom-reference') {
        return !!effectiveProductImage && !!backgroundReference;
      }
      return !!effectiveProductImage;
    }
    if (editCase === 'compose') return !!effectiveProductImage;
    if (editCase === 'color-variants') return colorImages.length >= 2;
    if (editCase === 'single') return !!effectiveProductImage;
    return false;
  })();

  const handleGenerate = async () => {
    try {
      const base = {
        productId: productId ?? undefined,
        mode,
        userPrompt: userPrompt || undefined,
        purpose: mode === 'creative' ? ('quality' as const) : ('compliance' as const),
      };

      let payload: Parameters<typeof generateMutation.mutateAsync>[0];

      if (mode === 'creative') {
        const sceneForBackend = sceneType === 'custom-reference' ? undefined : sceneType;
        payload = {
          ...base,
          productImage: effectiveProductImage ?? undefined,
          sceneType: sceneForBackend,
          styleType,
          productDescription: productDescription || undefined,
          backgroundReference:
            sceneType === 'custom-reference' ? (backgroundReference ?? undefined) : undefined,
        };
      } else if (editCase === 'compose') {
        payload = {
          ...base,
          productImage: effectiveProductImage ?? undefined,
          packagingImage: packagingImage ?? undefined,
          supplementaryLabel,
          pieceCount: pieceCount ?? undefined,
        };
      } else if (editCase === 'color-variants') {
        payload = {
          ...base,
          colorImages,
          colorCount: colorImages.length,
        };
      } else if (editCase === 'single') {
        payload = {
          ...base,
          productImage: effectiveProductImage ?? undefined,
        };
      } else {
        toast.error('용도를 먼저 선택해주세요');
        return;
      }

      const data = await generateMutation.mutateAsync(payload);
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

  // ProductSelector 핸들러
  const handleProductSelect = (selected: { id: string; name: string; imageUrl: string | null; sku: string | null }) => {
    router.replace(`/thumbnail-editor?productId=${selected.id}`);
  };

  const handleClearProduct = () => {
    router.replace('/thumbnail-editor');
    // 상품 변경 — 이미지 + 결과만 리셋, 용도(editCase) + 설정은 보존
    // 사용자가 같은 용도로 다른 상품 편집하는 흐름 유지
    setProductImage(null);
    setPackagingImage(null);
    setColorImages([]);
    setBackgroundReference(null);
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
  };

  const showUseCaseSelection = mode === 'edit' && editCase === null;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ── 헤더 + 모드 선택 ── */}
      <div
        className="flex-shrink-0 bg-gray-50"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center px-4 pt-3 pb-2 gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#eef0f2', border: '1px solid #e5e7eb' }}
          >
            <Sparkles size={15} className="text-violet-600" />
          </div>
          <h1 className="text-base font-bold text-gray-900 tracking-tight flex-shrink-0">썸네일 편집기</h1>

          {/* ProductSelector / Compact pill */}
          <div className="ml-auto w-[280px]">
            {productId && productName ? (
              <button
                type="button"
                onClick={handleClearProduct}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors text-xs font-medium text-violet-700"
              >
                <ShoppingBag size={14} className="flex-shrink-0" />
                <span className="truncate flex-1 text-left">{productName}</span>
                <ChevronDown size={12} className="flex-shrink-0 opacity-60" />
              </button>
            ) : (
              <ProductSelector selectedId={null} onSelect={handleProductSelect} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0" style={{ borderTop: '1px solid #e5e7eb' }}>
          <button
            type="button"
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
              <div className="text-[11px] mt-0.5 text-gray-400">박스/세트 · 색상별 · 가이드라인</div>
            </div>
          </button>

          <button
            type="button"
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

      {/* 본문 */}
      {showUseCaseSelection ? (
        <UseCaseSelection onSelect={setEditCase} />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr_300px]">
          <EditorInputPanel
            mode={mode}
            editCase={editCase}
            productId={productId}
            productName={productName}
            productImage={effectiveProductImage}
            packagingImage={packagingImage}
            supplementaryLabel={supplementaryLabel}
            colorImages={colorImages}
            backgroundReference={backgroundReference}
            sceneType={sceneType}
            hubImages={hubImages}
            hubImagesLoading={hubImagesLoading}
            onProductImageChange={setProductImage}
            onPackagingChange={setPackagingImage}
            onSupplementaryLabelChange={setSupplementaryLabel}
            onColorImagesChange={setColorImages}
            onBackgroundReferenceChange={setBackgroundReference}
            onResetEditCase={resetEditCase}
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
            editCase={editCase}
            pieceCount={pieceCount}
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
            onPieceCountChange={setPieceCount}
            onUserPromptChange={setUserPrompt}
            onSceneTypeChange={setSceneType}
            onStyleTypeChange={setStyleType}
            onProductDescriptionChange={setProductDescription}
            onGenerate={handleGenerate}
            onCoupang={handleCoupang}
            onSkip={handleSkip}
          />
        </div>
      )}
    </div>
  );
}
