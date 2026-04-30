'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MasterSchema } from '@kiditem/shared/product';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useStore } from '@/store/useStore';
import { useSelectCandidate, useWingRegister, useDeleteCandidate } from '../../_shared/hooks/useThumbnailGenerations';
import { resolveImageUrl } from '@/lib/resolve-url';
import { useProductImages } from '../../_shared/hooks/useProductImages';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { useGenerateThumbnail } from '../hooks/useThumbnailEditor';
import { EditorInputPanel } from '../components/EditorInputPanel';
import { EditorResultPanel } from '../components/EditorResultPanel';
import { EditorControlPanel } from '../components/EditorControlPanel';
import { ModeCaseModal } from '../components/ModeCaseModal';
import type { EditUseCase } from '../components/UseCaseSelection';
import type { SupplementaryLabel } from '../components/EditorInputPanel';
import {
  buildInitialSlots, pickCaseFromSlots, selectProductValue, setFirstSlotValueByKind, slotsToDto,
  type Slot,
} from './lib/slots';
import { type EditorMode, parseEditCaseParam } from './lib/edit-page-types';
import { useEditorHistory } from './hooks/useEditorHistory';
import { EditorPageHeader } from './components/EditorPageHeader';

export type { EditorMode, HistoryCandidate } from './lib/edit-page-types';

export default function ThumbnailEditorWorkspacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get('productId');
  const imageUrlParam = searchParams.get('imageUrl');
  const generationIdParam = searchParams.get('generationId');
  const modeParam = searchParams.get('mode');
  const editCaseParam = searchParams.get('editCase');
  const queryClient = useQueryClient();

  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  useEffect(() => {
    const prev = useStore.getState().sidebarOpen;
    setSidebarOpen(false);
    return () => setSidebarOpen(prev);
  }, [setSidebarOpen]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const { data: product } = useQuery({
    queryKey: queryKeys.products.detail(productId!),
    queryFn: () => apiClient.getParsed(`/api/products/masters/${productId}`, MasterSchema),
    enabled: !!productId,
  });

  const productName = product?.name ?? '';
  const originalImageUrl = product?.imageUrl ?? null;

  const [mode, setMode] = useState<EditorMode>(modeParam === 'creative' ? 'creative' : 'edit');
  // edit 모드는 editCase 를 항상 'single' 로 기본값. UseCaseSelection 중간 단계 제거 — 사용자는 이미
  // 허브에서 "이미지 편집 / AI 연출 생성" 결정 후 진입한다. 슬롯에 box/color/bundle 을 추가하면
  // pickCaseFromSlots 가 자동으로 승격하므로 'single' 시작점으로 충분.
  const [editCase, setEditCase] = useState<EditUseCase | null>(
    parseEditCaseParam(editCaseParam) ?? (modeParam === 'creative' ? null : 'single'),
  );
  const [modalOpen, setModalOpen] = useState(false);

  const [slots, setSlots] = useState<Slot[]>(() =>
    buildInitialSlots(
      modeParam === 'creative' ? 'creative' : 'edit',
      parseEditCaseParam(editCaseParam) ?? (modeParam === 'creative' ? null : 'single'),
      {
        initialProductImage: imageUrlParam,
        sceneType: 'white-studio',
        // bundle 케이스로 직접 진입할 때 첫 슬롯이 owner 가 되도록 박아둠.
        ownerProductId: productId,
      },
    ),
  );
  const [supplementaryLabel, setSupplementaryLabel] = useState<SupplementaryLabel>('박스');
  const [pieceCount, setPieceCount] = useState<number | null>(null);
  const [layout, setLayout] = useState<import('./lib/slots').LayoutKindLite>('auto');
  const [userPrompt, setUserPrompt] = useState('');

  const [sceneType, setSceneType] = useState('white-studio');
  const [styleType, setStyleType] = useState('minimal');
  const [productDescription, setProductDescription] = useState('');

  const { images: hubImages, loading: hubImagesLoading } = useProductImages(productId);

  const productImage = selectProductValue(slots);
  const effectiveProductImage = productImage ?? (imageUrlParam ? null : originalImageUrl);
  const fallbackProductImage = !productImage && !imageUrlParam ? originalImageUrl : null;
  const hasInputSlotFilled = slots.some((s) => s.value);

  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  const { data: initialGeneration } = useQuery({
    queryKey: ['thumbnail-generation', generationIdParam],
    queryFn: () =>
      apiClient.get<ThumbnailGenerationItem>(`/api/thumbnail-analysis/generations/${generationIdParam}`),
    enabled: !!generationIdParam,
  });

  useEffect(() => {
    if (!initialGeneration) return;
    if (generationId === initialGeneration.id) return;
    if (initialGeneration.candidates?.length > 0) {
      setResult(initialGeneration.candidates);
      setGenerationId(initialGeneration.id);
      setSelectedCandidateUrl(null);
    }
  }, [initialGeneration, generationId]);

  const { historyCandidates, recommendedCandidateUrl } = useEditorHistory({
    productId, mode, result, generationId,
    selectedCandidateUrl, setSelectedCandidateUrl,
  });

  const generateMutation = useGenerateThumbnail();
  const selectCandidateMutation = useSelectCandidate();
  const wingRegisterMutation = useWingRegister();
  const deleteCandidateMutation = useDeleteCandidate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleGenerate = async () => {
    try {
      // editCase 는 UI state 지만 실제 프롬프트 라우팅은 슬롯 구성 기준으로 재계산.
      // creative 는 그대로 editCase=null. edit 모드는 슬롯에 bundle/color/packaging 이 있으면
      // 자동으로 해당 케이스로 승격해서 백엔드 프롬프트 선택 정확도 보장.
      const resolvedCase = mode === 'creative' ? null : pickCaseFromSlots(slots);
      const dto = slotsToDto(slots, resolvedCase, {
        productId, supplementaryLabel, pieceCount,
        purpose: mode === 'creative' ? 'quality' : 'compliance',
        mode, userPrompt, sceneType, styleType, productDescription,
        productImageOverride: effectiveProductImage,
        layout,
      });
      const data = await generateMutation.mutateAsync(dto);
      if (!mountedRef.current) return;
      if (data?.candidates) {
        setResult(data.candidates);
        setGenerationId(data.generationId ?? null);
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
        toast.success(`썸네일 ${data.candidates.length}장 생성 완료`);
        // 새로고침해도 기존 결과를 복원할 수 있도록 generationId 를 URL 에 박아둔다.
        // 기존 initialGeneration 쿼리가 이 id 로 candidates 를 복원.
        if (data.generationId) {
          const next = new URLSearchParams(searchParams.toString());
          next.set('generationId', data.generationId);
          // imageUrl 은 더 이상 auto-start 트리거가 아니지만, 편집 시작점 복원용으로 유지.
          router.replace(`?${next.toString()}`, { scroll: false });
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      toast.error(err instanceof Error ? err.message : '썸네일 생성 실패');
    }
  };

  const handleSelectCandidate = (url: string) => {
    setSelectedCandidateUrl(url || null);
    if (generationId && url) {
      selectCandidateMutation.mutate({ id: generationId, selectedUrl: url });
    }
  };

  const handleReEditFromSelected = () => {
    if (!selectedCandidateUrl) {
      toast.error('먼저 결과 이미지를 선택하세요');
      return;
    }
    setSlots((prev) => setFirstSlotValueByKind(prev, 'product', selectedCandidateUrl, 'prev-gen'));
    setResult([]);
    setGenerationId(null);
    setSelectedCandidateUrl(null);
    toast.success('선택한 이미지로 편집 시작점 전환됨');
  };

  const handleCoupang = async () => {
    if (!generationId) {
      toast.error('먼저 썸네일을 생성하세요');
      return;
    }
    if (!selectedCandidateUrl) {
      toast.error('먼저 결과 이미지를 선택하세요');
      return;
    }
    try {
      const status = await apiClient.get<{ connected: boolean; error?: string }>(
        '/api/thumbnail-analysis/playwriter-status',
      );
      if (!mountedRef.current) return;
      if (!status.connected) {
        toast.error(
          status.error ?? '활성 Playwriter 세션이 없습니다. 터미널에서 `playwriter session new` 실행 후 쿠팡 Wing 에 로그인하세요.',
          { duration: 8000 },
        );
        return;
      }
    } catch {
      if (!mountedRef.current) return;
      toast.error('Playwriter 상태를 확인할 수 없습니다. 서버 연결을 확인하세요.');
      return;
    }
    try {
      const wingResult = await wingRegisterMutation.mutateAsync(generationId);
      if (!mountedRef.current) return;
      if (wingResult.success) {
        toast.success('Wing 대표이미지 업로드 완료 — 스크린샷 확인 후 저장하세요');
        setResult([]);
        setGenerationId(null);
        setSelectedCandidateUrl(null);
      } else {
        toast.error(wingResult.error ?? 'Wing 업로드 실패');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      toast.error(err instanceof Error ? err.message : 'Wing 연동 오류');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedCandidateUrl) {
      setDeleteDialogOpen(false);
      return;
    }
    // selectedCandidateUrl 은 resolveImageUrl 거친 값 — 원본 url 찾아서 backend 로 보낸다
    const target = historyCandidates.find(
      (c) => (resolveImageUrl(c.url) ?? c.url) === selectedCandidateUrl,
    );
    if (!target?.generationId) {
      setDeleteDialogOpen(false);
      toast.error('선택한 이미지를 찾을 수 없습니다');
      return;
    }
    const targetGenId = target.generationId;
    const targetUrl = target.url;
    setDeleteDialogOpen(false);
    try {
      const res = await deleteCandidateMutation.mutateAsync({
        id: targetGenId,
        url: targetUrl,
      });
      if (!mountedRef.current) return;
      // 현재 편집 중인 generation 의 candidate 를 삭제했을 때만 로컬 state 조정
      if (targetGenId === generationId) {
        if (res.generationDeleted) {
          // 현재 gen row 도 cascade 삭제됨. history 에 다른 gen 후보가 남았으면
          // 그 중 가장 최근 것으로 편집기 재진입 (UseCaseSelection 폴백 방지).
          const remaining = historyCandidates.find(
            (c) => c.generationId && c.generationId !== targetGenId,
          );
          setResult([]);
          setGenerationId(null);
          setSelectedCandidateUrl(null);
          if (!remaining?.generationId) {
            toast.success('생성 결과가 삭제되었습니다');
            router.push('/thumbnail-editor');
            return;
          }
          const next = new URLSearchParams(searchParams.toString());
          next.set('generationId', remaining.generationId);
          router.replace(`?${next.toString()}`, { scroll: false });
          toast.success('선택한 이미지가 삭제되었습니다');
          return;
        }
        setResult((prev) => prev.filter((c) => c.url !== targetUrl));
        setSelectedCandidateUrl(null); // useEditorHistory 가 다음 후보로 자동 이동
        toast.success('선택한 이미지가 삭제되었습니다');
      } else {
        // 과거 generation 의 candidate — useDeleteCandidate 캐시 업데이트로 historyCandidates 자동 반영
        setSelectedCandidateUrl(null);
        toast.success('선택한 이미지가 삭제되었습니다');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      toast.error(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  const hasInput = !!productId || hasInputSlotFilled;

  // NOTE: 예전에는 imageUrl+productId+mode+editCase 쿼리가 있으면 자동으로 handleGenerate 를 호출했다.
  // 하지만 이 동작이 두 가지 UX 문제를 일으켰다:
  //   1. 모달 → "편집화면으로 가기" 를 누르면 편집 화면에 들어가자마자 바로 생성 mutation 이 돌아서
  //      사용자가 입력·설정을 확인할 틈도 없이 AI 가 돌아감.
  //   2. 생성 중에 새로고침하면 동일 useEffect 가 다시 fire 되어 **재생성** 이 일어남 (중복 과금 + 혼란).
  //
  // 의도된 플로우: 편집 화면은 항상 "편집하기" 버튼(EditorControlPanel → onGenerate) 클릭으로만 시작.
  // 생성 성공 직후 handleGenerate 가 `generationId` 를 URL 에 replace 하므로, 그 이후 새로고침은
  // 기존 initialGeneration 쿼리가 자동으로 candidates 를 복원한다.

  return (
    <div className="flex flex-col h-screen -m-6 bg-slate-50">
      <EditorPageHeader
        productName={productName}
        mode={mode}
        editCase={editCase}
        onBack={() => router.push('/thumbnail-editor')}
        onOpenModeModal={() => setModalOpen(true)}
      />

      <ModeCaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={mode}
        editCase={editCase}
        onSelect={(nextMode, nextCase) => {
          setMode(nextMode);
          setEditCase(nextCase);
          // 모드/케이스 전환 시 현재 슬롯에 들어 있던 이미지를 새 레이아웃의 첫 슬롯으로
          // carry-over. (예: bundle → single 로 가면 첫 bundle 슬롯의 이미지가 product 슬롯으로
          // 옮겨짐.) 슬롯 레이아웃이 mode/editCase 와 항상 일관되게 유지되도록 보장.
          const carryOverImage =
            selectProductValue(slots) ??
            slots.find((s) => s.value)?.value ??
            imageUrlParam ??
            null;
          setSlots(
            buildInitialSlots(nextMode, nextCase, {
              initialProductImage: carryOverImage,
              sceneType,
              ownerProductId: productId,
            }),
          );
          const next = new URLSearchParams(searchParams.toString());
          next.set('mode', nextMode);
          if (nextMode === 'edit' && nextCase) next.set('editCase', nextCase);
          else next.delete('editCase');
          router.replace(`?${next.toString()}`, { scroll: false });
        }}
      />

      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr_320px]">
          <EditorInputPanel
            mode={mode}
            editCase={editCase}
            productId={productId}
            slots={slots}
            onSlotsChange={setSlots}
            fallbackProductImage={fallbackProductImage}
            originalImage={initialGeneration?.originalUrl ?? originalImageUrl}
            supplementaryLabel={supplementaryLabel}
            sceneType={sceneType}
            hubImages={hubImages}
            hubImagesLoading={hubImagesLoading}
            historyCandidates={historyCandidates}
            selectedCandidateUrl={selectedCandidateUrl}
            recommendedCandidateUrl={recommendedCandidateUrl}
            onSelectCandidate={handleSelectCandidate}
            onSupplementaryLabelChange={setSupplementaryLabel}
            onPromoteCase={(nextCase) => {
              // 현재 product 슬롯 값 보존하며 editCase 승격 → 새 슬롯 레이아웃으로 재빌드.
              // color-variants/bundle 케이스에도 carry-over 되도록 buildInitialSlots 가
              // initialProductImage 를 첫 슬롯 (color_variant 1 / bundle_item A) 에 복사.
              // bundle 의 경우 ownerProductId 를 박아두면 결과 저장 기준이 "이 상품" 으로 유지.
              const currentProduct = selectProductValue(slots) ?? imageUrlParam ?? null;
              setEditCase(nextCase);
              setSlots(
                buildInitialSlots('edit', nextCase, {
                  initialProductImage: currentProduct,
                  sceneType,
                  ownerProductId: productId,
                }),
              );
              const next = new URLSearchParams(searchParams.toString());
              next.set('editCase', nextCase);
              router.replace(`?${next.toString()}`, { scroll: false });
            }}
            generationId={generationId}
            onDeleteSelectedCandidate={() => setDeleteDialogOpen(true)}
          />

          <EditorResultPanel
            mode={mode}
            originalImage={originalImageUrl ?? productImage}
            candidates={historyCandidates}
            selectedCandidateUrl={selectedCandidateUrl}
            isGenerating={generateMutation.isPending}
            productName={productName}
            onSelectCandidate={handleSelectCandidate}
          />

          <EditorControlPanel
            mode={mode}
            editCase={editCase}
            pieceCount={pieceCount}
            layout={layout}
            userPrompt={userPrompt}
            sceneType={sceneType}
            styleType={styleType}
            productDescription={productDescription}
            isPending={generateMutation.isPending}
            hasInput={hasInput}
            selectedCandidateUrl={selectedCandidateUrl}
            generationId={generationId}
            isApplying={wingRegisterMutation.isPending}
            onPieceCountChange={setPieceCount}
            onLayoutChange={setLayout}
            onUserPromptChange={setUserPrompt}
            onSceneTypeChange={setSceneType}
            onStyleTypeChange={setStyleType}
            onProductDescriptionChange={setProductDescription}
            onGenerate={handleGenerate}
            onCoupang={handleCoupang}
            onReEditFromSelected={handleReEditFromSelected}
          />
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        tone="danger"
        title="선택한 이미지를 삭제할까요?"
        description={
          <>
            현재 선택한 이미지 <span className="font-semibold text-[var(--text-primary,#0f172a)]">1장</span>만
            삭제되고, 같은 생성의 다른 후보는 남습니다. 마지막 1장을 삭제하면 생성 결과 자체가 함께 사라집니다.
          </>
        }
        confirmText="삭제"
        cancelText="취소"
        isLoading={deleteCandidateMutation.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
