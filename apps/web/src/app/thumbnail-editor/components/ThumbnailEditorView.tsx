'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Scissors } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
} from '@/hooks/useThumbnailGenerations';
import { openCoupangWingInventory } from '@/lib/coupang-wing';

import { useGenerateThumbnail } from '../hooks/useThumbnailEditor';
import { EditorInputPanel } from './EditorInputPanel';
import { EditorResultPanel } from './EditorResultPanel';
import { EditorControlPanel } from './EditorControlPanel';

type EditorMode = 'edit' | 'creative';

/**
 * 썸네일 편집기 핵심 UI — 페이지 래퍼 없이 어디서든 임베드 가능
 */
export function ThumbnailEditorView() {
  const queryClient = useQueryClient();

  // 모드 상태
  const [mode, setMode] = useState<EditorMode>('edit');

  const [packagingImage, setPackagingImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<'compliance' | 'quality'>('compliance');
  const [composition, setComposition] = useState('');
  const [userPrompt, setUserPrompt] = useState('');

  // creative 모드 상태
  const [sceneType, setSceneType] = useState('white-studio');
  const [styleType, setStyleType] = useState('minimal');
  const [productDescription, setProductDescription] = useState('');

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
    <div className="flex flex-col h-full">
      {/* 모드 선택 바 */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-3 px-6 py-3 border-b border-slate-100 bg-white">
        {/* 이미지 편집 카드 */}
        <button
          onClick={() => setMode('edit')}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
            mode === 'edit'
              ? 'border-purple-400 bg-purple-50'
              : 'border-slate-200 bg-slate-50/60 hover:border-slate-300',
          )}
        >
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
              mode === 'edit' ? 'bg-purple-500' : 'bg-slate-200',
            )}
          >
            <Scissors size={16} className="text-white" />
          </div>
          <div>
            <div
              className={cn(
                'text-sm font-bold leading-tight',
                mode === 'edit' ? 'text-purple-700' : 'text-slate-600',
              )}
            >
              이미지 편집
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">배경 제거 · 가이드라인 · 구도</div>
          </div>
        </button>

        {/* AI 연출 생성 카드 */}
        <button
          onClick={() => setMode('creative')}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
            mode === 'creative'
              ? 'border-violet-400 bg-violet-50'
              : 'border-slate-200 bg-slate-50/60 hover:border-slate-300',
          )}
        >
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
              mode === 'creative' ? 'bg-violet-500' : 'bg-slate-200',
            )}
          >
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <div
              className={cn(
                'text-sm font-bold leading-tight',
                mode === 'creative' ? 'text-violet-700' : 'text-slate-600',
              )}
            >
              AI 연출 생성
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">컨셉씬 · 라이프스타일 · 무드샷</div>
          </div>
        </button>
      </div>

      {/* 3패널 */}
      <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr_300px]">
        <EditorInputPanel
          mode={mode}
          productId={null}
          productName=""
          packagingImage={packagingImage}
          productImage={productImage}
          onPackagingChange={setPackagingImage}
          onProductImageChange={setProductImage}
        />

        <EditorResultPanel
          mode={mode}
          originalImage={null}
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
