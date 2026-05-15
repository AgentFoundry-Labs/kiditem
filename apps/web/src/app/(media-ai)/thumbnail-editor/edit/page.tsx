'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MasterSchema } from '@kiditem/shared/product';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useStore } from '@/store/useStore';
import {
  useCreateEditJobs,
  useGenerationList,
  useSelectCandidate,
  useWingRegister,
  useDeleteCandidate,
} from '../../_shared/hooks/useThumbnailGenerations';
import { useAnalysisList } from '../../thumbnails/hooks/useThumbnailAnalysis';
import type { RecomposeVariantKey, ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { resolveImageUrl } from '@/lib/resolve-url';
import { useProductImages } from '../../_shared/hooks/useProductImages';

import { useGenerateThumbnail } from '../hooks/useThumbnailEditor';
import { EditorInputPanel } from '../components/input/EditorInputPanel';
import { EditorResultPanel } from '../components/result/EditorResultPanel';
import { EditorControlPanel } from '../components/control/EditorControlPanel';
import { ModeCaseModal } from '../components/control/ModeCaseModal';
import type { EditUseCase } from '../components/control/UseCaseSelection';
import type { SupplementaryLabel } from '../components/input/EditorInputPanel';
import {
  buildInitialSlots, selectProductValue, setFirstSlotValueByKind,
  type Slot,
} from './lib/slots';
import { type EditorMode, parseEditCaseParam } from './lib/edit-page-types';
import { buildGenerateThumbnailDto } from './lib/build-generate-thumbnail-dto';
import {
  readThumbnailEditorUpload,
  readThumbnailEditorUploadResult,
  rememberThumbnailEditorUpload,
  writeThumbnailEditorUploadResult,
} from './lib/upload-session';
import { useEditorHistory } from './hooks/useEditorHistory';
import { useGenerationAwaitingState } from './hooks/useGenerationAwaitingState';
import { EditorPageHeader } from './components/EditorPageHeader';
import { DeleteCandidateConfirmDialog } from './components/DeleteCandidateConfirmDialog';
import { RecomposeControlSlot } from './components/RecomposeControlSlot';
import { getThemeHint } from './lib/theme-hint';

export type { EditorMode, HistoryCandidate } from './lib/edit-page-types';

export default function ThumbnailEditorWorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ThumbnailEditorWorkspaceContent />
    </Suspense>
  );
}

function ThumbnailEditorWorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get('productId');
  const imageUrlParam = searchParams.get('imageUrl');
  const uploadKeyParam = searchParams.get('uploadKey');
  const productNameParam = searchParams.get('productName')?.trim() ?? '';
  const generationIdParam = searchParams.get('generationId');
  const modeParam = searchParams.get('mode');
  const editCaseParam = searchParams.get('editCase');
  /** AI 편집하기 버튼이 productName 분석해서 자동 prefill 한 thematic hint. */
  const hintParam = searchParams.get('hint');
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

  const productName = product?.name ?? productNameParam;
  const originalImageUrl = product?.imageUrl ?? null;

  // 분석 결과 fetch — productId 의 recompose 분류 정보 (kind, options) 받아서 picker 노출.
  const { data: analysisList } = useAnalysisList();
  const productAnalysis = productId
    ? analysisList?.allResults.find((r) => r.productId === productId)
    : null;
  const recomposeClassification = productAnalysis?.recompose ?? null;

  // recompose flow (variant picker) 클릭 시 호출 — backend 의 recompose endpoint.
  const editJobsMutation = useCreateEditJobs();

  /**
   * Picker 에서 사용자가 선택한 variantKey — 즉시 호출하지 않고 state 로만 보관.
   * 우측 상단 "편집하기" 버튼 클릭 시 이 state 가 set 되어 있으면 recompose flow,
   * 없으면 기존 generate flow.
   */
  const [selectedVariantKey, setSelectedVariantKey] = useState<RecomposeVariantKey | undefined>(undefined);

  const [mode, setMode] = useState<EditorMode>(modeParam === 'creative' ? 'creative' : 'edit');
  // edit 모드는 editCase 를 항상 'single' 로 기본값. UseCaseSelection 중간 단계 제거 — 사용자는 이미
  // 허브에서 "이미지 편집 / AI 연출 생성" 결정 후 진입한다. 슬롯에 box/color/bundle 을 추가하면
  // pickCaseFromSlots 가 자동으로 승격하므로 'single' 시작점으로 충분.
  const [editCase, setEditCase] = useState<EditUseCase | null>(
    parseEditCaseParam(editCaseParam) ?? (modeParam === 'creative' ? null : 'single'),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const initialImageUrl = uploadedImageUrl ?? imageUrlParam;

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

  useEffect(() => {
    if (!uploadKeyParam) return;
    try {
      const stored = readThumbnailEditorUpload(uploadKeyParam);
      if (stored) {
        setUploadedImageUrl(stored);
        rememberThumbnailEditorUpload(uploadKeyParam, {
          productName,
          mode,
        });
        const storedResult = readThumbnailEditorUploadResult(uploadKeyParam);
        if (storedResult?.candidates.length) {
          setResult(storedResult.candidates);
          setGenerationId(null);
        }
      } else {
        toast.error('업로드 이미지를 찾을 수 없습니다. 다시 업로드해 주세요.');
      }
    } catch {
      toast.error('업로드 이미지를 불러오지 못했습니다. 다시 업로드해 주세요.');
    }
  }, [uploadKeyParam]);

  useEffect(() => {
    if (!uploadedImageUrl) return;
    setSlots((prev) => {
      if (prev.some((slot) => slot.value)) return prev;
      return setFirstSlotValueByKind(prev, 'product', uploadedImageUrl, 'upload');
    });
  }, [uploadedImageUrl]);
  const [supplementaryLabel, setSupplementaryLabel] = useState<SupplementaryLabel>('박스');
  const [pieceCount, setPieceCount] = useState<number | null>(null);
  const [layout, setLayout] = useState<import('./lib/slots').LayoutKindLite>('auto');
  // hint query 가 있으면 자동 prefill — AI 편집하기 클릭 시 productName 기반 thematic hint.
  const [userPrompt, setUserPrompt] = useState(hintParam ?? '');

  /**
   * 사용자가 textarea 를 한 번이라도 직접 수정했는지 추적 — true 면 자동 prefill 덮어쓰기 금지.
   * productName fetch 완료 후 자동으로 thematic hint 가 채워지도록 하되, 사용자 입력 보호.
   */
  const userPromptDirtyRef = useRef(!!hintParam);
  useEffect(() => {
    if (userPromptDirtyRef.current) return;
    if (userPrompt) {
      userPromptDirtyRef.current = true;
      return;
    }
    if (productName) {
      const hint = getThemeHint(productName);
      if (hint) {
        setUserPrompt(hint);
        userPromptDirtyRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName]);

  const [sceneType, setSceneType] = useState('white-studio');
  const [styleType, setStyleType] = useState('minimal');
  const [productDescription, setProductDescription] = useState('');

  const { images: hubImages, loading: hubImagesLoading } = useProductImages(productId);

  const productImage = selectProductValue(slots);
  const effectiveProductImage = productImage ?? (initialImageUrl ? null : originalImageUrl);
  const fallbackProductImage = !productImage && !initialImageUrl ? originalImageUrl : null;
  const hasInputSlotFilled = slots.some((s) => s.value);

  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  const { data: pollingGenerations = [] } = useGenerationList();
  const { forcedAwaiting, isAwaitingGen, beginAwaiting, clearAwaiting } =
    useGenerationAwaitingState(generationId, pollingGenerations);

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

  /**
   * 페이지 진입 시 productId 의 active (pending/running) generation 이 있으면
   * generationId 자동 박기 → 모달 자연스럽게 복원. 새로고침해도 진행 상태 유지.
   *
   * 우선순위: URL ?generationId 가 있으면 그걸 사용. 없을 때만 자동 detect.
   */
  useEffect(() => {
    if (generationId || generationIdParam) return; // 이미 있으면 skip
    if (!productId) return;
    const activeGen = pollingGenerations.find(
      (g) =>
        g.productId === productId &&
        (g.status === 'pending' || g.status === 'running'),
    );
    if (activeGen) {
      setGenerationId(activeGen.id);
      const next = new URLSearchParams(searchParams.toString());
      next.set('generationId', activeGen.id);
      router.replace(`?${next.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, pollingGenerations.length, generationId, generationIdParam]);

  const { historyCandidates, recommendedCandidateUrl } = useEditorHistory({
    productId, mode, result, generationId,
    selectedCandidateUrl, setSelectedCandidateUrl,
  });

  const generateMutation = useGenerateThumbnail();
  const selectCandidateMutation = useSelectCandidate();
  const wingRegisterMutation = useWingRegister();
  const deleteCandidateMutation = useDeleteCandidate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleGenerate = async (options: { imageOnly?: boolean } = {}) => {
    const imageOnly = options.imageOnly === true;
    console.log('[edit-page] handleGenerate called', {
      selectedVariantKey,
      productId,
      mode,
      hasRecompose: !!recomposeClassification,
      userPromptEmpty: !userPrompt.trim(),
      imageOnly,
    });

    // Path 결정 (top-down 우선순위):
    // 1. Picker 명시 선택 → recompose flow (variant prompt)
    // 2. AI 분류 결과 있고 + 사용자 textarea 비어있음 → recompose flow (auto variant)
    //    (사용자가 그냥 편집하기 누른 경우 = AI 분류 따라가는 의도)
    // 3. 그 외 (textarea 에 사용자 instruction 있음) → generate flow

    if (!imageOnly && selectedVariantKey) {
      console.log('[edit-page] → recompose flow (variantKey 명시 선택)');
      await handleRecomposeVariant(selectedVariantKey);
      return;
    }

    if (!imageOnly && recomposeClassification && !userPrompt.trim()) {
      console.log('[edit-page] → recompose flow (AI 분류 + 빈 textarea — auto variant)');
      await handleRecomposeVariant(undefined);
      return;
    }

    // generate flow — textarea instruction 기반
    console.log('[edit-page] → generate flow (textarea hint)');
    beginAwaiting();
    try {
      const dto = buildGenerateThumbnailDto({
        mode,
        slots,
        productId,
        supplementaryLabel,
        pieceCount,
        imageOnly,
        userPrompt,
        sceneType,
        styleType,
        productDescription,
        productName,
        effectiveProductImage,
        layout,
      });
      const data = await generateMutation.mutateAsync(dto);
      if (!mountedRef.current) return;

      if (data?.status === 'pending' && data.generationId) {
        // Async product-bound path — backend enqueued an Agent OS request
        // and returned immediately. Don't set candidates here; the
        // existing `useGenerationList` polling already detects the
        // pending row and `useEffect`s above flip status → result.
        // forcedAwaiting stays true so the loading modal holds until the
        // bridge + sink finalize the row.
        setGenerationId(data.generationId);
        const next = new URLSearchParams(searchParams.toString());
        next.set('generationId', data.generationId);
        router.replace(`?${next.toString()}`, { scroll: false });
        await queryClient.refetchQueries({
          queryKey: queryKeys.thumbnailAnalysis.generations(),
        });
        toast.success('썸네일 생성 시작 — 잠시만 기다려주세요');
        return;
      }

      if (data?.candidates && data.candidates.length > 0) {
        // Sync standalone path (no productId) — candidates returned
        // immediately. Mirror the legacy behaviour for non-product
        // uploads: render directly + persist into the upload session.
        setResult(data.candidates);
        setGenerationId(data.generationId ?? null);
        if (uploadKeyParam) {
          writeThumbnailEditorUploadResult(uploadKeyParam, data.candidates, {
            productName,
            mode,
          });
        }
        clearAwaiting();
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
        toast.success(`썸네일 ${data.candidates.length}장 생성 완료`);
        if (data.generationId) {
          const next = new URLSearchParams(searchParams.toString());
          next.set('generationId', data.generationId);
          router.replace(`?${next.toString()}`, { scroll: false });
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      clearAwaiting(); // 에러 시에만 해제. 정상 응답 시는 generationId 있어 useEffect 가 status 기반 해제.
      toast.error(err instanceof Error ? err.message : '썸네일 생성 실패');
    }
  };

  /**
   * RecomposeVariantPicker 클릭 시 — backend 의 recompose endpoint 호출.
   * generation flow ("편집하기" 버튼) 와 별도 path. variantKey 별 다른 prompt 사용.
   *
   * 응답: ThumbnailGenerationItem[] — generationId 받아 URL 갱신 → 결과 폴링/표시.
   */
  const handleRecomposeVariant = async (variantKey: RecomposeVariantKey | undefined) => {
    console.log('[edit-page] handleRecomposeVariant called', { variantKey, productId });
    if (!productId) {
      toast.error('상품 정보가 필요합니다');
      return;
    }
    beginAwaiting(); // mutation 직후 race window 차단 — UI 즉시 loading
    console.log('[edit-page] forcedAwaiting=true, calling editJobsMutation...');
    try {
      const created = await editJobsMutation.mutateAsync({
        productIds: [productId],
        purpose: 'compliance',
        variantKey,
      });
      console.log('[edit-page] editJobsMutation response:', created);
      const item = Array.isArray(created)
        ? created.find((d) => d.productId === productId)
        : null;
      if (item) {
        setGenerationId(item.id);
        // mutation 응답 candidates 는 일반적으로 빈 배열 (status=pending). 결과 도착은 polling 으로.
        // candidates 가 mutation 응답에 이미 채워져 있어도 setResult 안 함 — useEffect 가 status='succeeded' 잡고
        // 모달 종료 후 자연스럽게 historyCandidates 통해 표시되도록.
        const next = new URLSearchParams(searchParams.toString());
        next.set('generationId', item.id);
        router.replace(`?${next.toString()}`, { scroll: false });
        // 명시적 refetch 강제 — invalidate 보다 빠르게 polling 데이터에 새 row 반영.
        await queryClient.refetchQueries({
          queryKey: queryKeys.thumbnailAnalysis.generations(),
        });
        toast.success('AI 편집 시작 — 잠시만 기다려주세요');
      } else {
        // mutation 응답 빈 array — 이미 진행 중인 같은 productId job 있음.
        // 해당 active generation 을 폴링 데이터에서 찾아 generationId 박기 → 모달 유지.
        const activeGen = pollingGenerations.find(
          (g) =>
            g.productId === productId &&
            (g.status === 'pending' || g.status === 'running'),
        );
        if (activeGen) {
          setGenerationId(activeGen.id);
          if (Array.isArray(activeGen.candidates) && activeGen.candidates.length > 0) {
            setResult(activeGen.candidates);
          }
          const next = new URLSearchParams(searchParams.toString());
          next.set('generationId', activeGen.id);
          router.replace(`?${next.toString()}`, { scroll: false });
          // forcedAwaiting 유지 — useEffect 가 status 'succeeded/failed' 보고 자동 해제.
          toast.info('이미 편집 진행 중 — 결과 기다리는 중...');
        } else {
          // active 못 찾으면 일반 경고
          clearAwaiting();
          toast.warning('이미 편집이 진행 중인 상품입니다');
        }
      }
    } catch (err) {
      clearAwaiting();
      toast.error(err instanceof Error ? err.message : 'AI 편집 실패');
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
      const wingResult = await wingRegisterMutation.mutateAsync(generationId);
      if (!mountedRef.current) return;
      if (wingResult.success) {
        toast.success('Wing 대표이미지 업로드 완료 — 열린 Wing 화면 확인 후 저장하세요');
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
            isGenerating={
              generateMutation.isPending ||
              editJobsMutation.isPending ||
              isAwaitingGen ||
              forcedAwaiting
            }
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
            isPending={
              generateMutation.isPending ||
              editJobsMutation.isPending ||
              isAwaitingGen ||
              forcedAwaiting
            }
            hasInput={hasInput}
            selectedCandidateUrl={selectedCandidateUrl}
            generationId={generationId}
            isApplying={wingRegisterMutation.isPending}
            onPieceCountChange={setPieceCount}
            onLayoutChange={setLayout}
            onUserPromptChange={(v) => {
              userPromptDirtyRef.current = true;
              setUserPrompt(v);
            }}
            onSceneTypeChange={setSceneType}
            onStyleTypeChange={setStyleType}
            onProductDescriptionChange={setProductDescription}
            onGenerateImageOnly={() => handleGenerate({ imageOnly: true })}
            onGenerate={() => handleGenerate()}
            onCoupang={handleCoupang}
            onReEditFromSelected={handleReEditFromSelected}
            recomposeSlot={
              recomposeClassification ? (
                <RecomposeControlSlot
                  classification={recomposeClassification}
                  userPrompt={userPrompt}
                  selectedVariantKey={selectedVariantKey}
                  onSelectVariant={setSelectedVariantKey}
                />
              ) : undefined
            }
          />
      </div>

      <DeleteCandidateConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        isLoading={deleteCandidateMutation.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
