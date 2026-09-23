'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { queryKeys } from '@/lib/query-keys';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import {
  useDeleteThumbnailCandidate,
  useThumbnailJob,
  useThumbnailJobs,
  type ThumbnailJobView,
} from '../../../_shared/hooks/useThumbnailJobs';
import { useAdoptAndUploadThumbnail } from '../../../_shared/hooks/useRepresentativeImage';
import {
  THUMBNAIL_GENERATION_ROOT,
  normalizeProductPipelineReturnTo,
} from '../../../_shared/lib/product-pipeline-routes';
import { thumbnailSubjectFromParams } from '../../../_shared/lib/thumbnail-subject';
import { representativeImageUploadedMessage, representativeImageUploadReached } from '../../../_shared/lib/representative-image-execution';
import { resolveImageUrl } from '@/lib/resolve-url';
import { useContentWorkspaceImages } from '../../../_shared/hooks/useContentWorkspaceImages';

import { useGenerateThumbnail } from '../../hooks/useThumbnailEditor';
import { EditorInputPanel } from '../../components/input/EditorInputPanel';
import { EditorResultPanel } from '../../components/result/EditorResultPanel';
import { EditorControlPanel } from '../../components/control/EditorControlPanel';
import { ModeCaseModal } from '../../components/control/ModeCaseModal';
import type { EditUseCase } from '../../components/control/UseCaseSelection';
import type { SupplementaryLabel } from '../../components/input/EditorInputPanel';
import { buildInitialSlots, selectProductValue, setFirstSlotValueByKind, type Slot } from '../lib/slots';
import { type EditorMode, parseEditCaseParam } from '../lib/edit-page-types';
import { buildGenerateThumbnailDto } from '../lib/build-generate-thumbnail-dto';
import { resolveOriginalPreviewImage } from '../lib/preview-image';
import {
  readThumbnailEditorUpload,
  readThumbnailEditorUploadResult,
  rememberThumbnailEditorUpload,
  writeThumbnailEditorUploadResult,
} from '../lib/upload-session';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { useGenerationAwaitingState } from '../hooks/useGenerationAwaitingState';
import { EditorPageHeader } from './EditorPageHeader';
import { DeleteCandidateConfirmDialog } from './DeleteCandidateConfirmDialog';
import { getThemeHint } from '../lib/theme-hint';

export type { EditorMode, HistoryCandidate } from '../lib/edit-page-types';

interface ThumbnailEditorWorkspaceProps {
  embedded?: boolean;
  onBack?: () => void;
}

export function ThumbnailEditorWorkspace({ embedded = false, onBack }: ThumbnailEditorWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const contentWorkspaceId = searchParams.get('contentWorkspaceId');
  // 작업공간이 아직 없는 판매상품 초안에서 연 편집 — 결과는 서버가 그 초안의 작업공간에 붙인다.
  const salesProductId = contentWorkspaceId ? null : searchParams.get('salesProductId');
  const imageUrlParam = searchParams.get('imageUrl');
  const uploadKeyParam = searchParams.get('uploadKey');
  const productNameParam = searchParams.get('productName')?.trim() ?? '';
  const productDescriptionParam = searchParams.get('productDescription')?.trim() ?? '';
  const generationIdParam = searchParams.get('generationId');
  const modeParam = searchParams.get('mode') ?? searchParams.get('thumbnailMode');
  const editCaseParam = searchParams.get('editCase');
  const returnTo = normalizeProductPipelineReturnTo(searchParams.get('returnTo'));
  /** AI 편집하기 버튼이 productName 분석해서 자동 prefill 한 thematic hint. */
  const hintParam = searchParams.get('hint');
  const queryClient = useQueryClient();

  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  useEffect(() => {
    if (embedded) return undefined;
    const prev = useStore.getState().sidebarOpen;
    setSidebarOpen(false);
    return () => setSidebarOpen(prev);
  }, [embedded, setSidebarOpen]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const productName = productNameParam;

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
        ownerContentWorkspaceId: contentWorkspaceId,
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
  const [layout, setLayout] = useState<import('../lib/slots').LayoutKindLite>('auto');
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
  const [productDescription, setProductDescription] = useState(productDescriptionParam);

  const { images: hubImages, loading: hubImagesLoading } = useContentWorkspaceImages(contentWorkspaceId);
  const originalImageUrl = hubImages[0]?.url ?? null;

  const productImage = selectProductValue(slots);
  const effectiveProductImage = productImage ?? (initialImageUrl ? null : originalImageUrl);
  const fallbackProductImage = !productImage && !initialImageUrl ? originalImageUrl : null;
  const hasInputSlotFilled = slots.some((s) => s.value);

  const [result, setResult] = useState<Array<{ url: string; filename: string }>>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);

  const { data: pollingGenerations = [] } = useThumbnailJobs();
  const observedGenerationId = generationId ?? generationIdParam;
  const { data: observedGeneration } = useThumbnailJob(observedGenerationId);
  const { forcedAwaiting, isAwaitingGen, beginAwaiting, clearAwaiting } = useGenerationAwaitingState(
    observedGenerationId,
    pollingGenerations,
    observedGeneration,
  );
  const originalPreviewImage = resolveOriginalPreviewImage({
    initialImageUrl,
    originalImageUrl,
  });

  useEffect(() => {
    if (!observedGeneration) return;
    if (generationId !== observedGeneration.id) {
      setGenerationId(observedGeneration.id);
    }
    if (observedGeneration.candidates.length > 0) {
      const observedResult = jobResult(observedGeneration);
      const hasSameCandidates =
        result.length === observedResult.length &&
        result.every((candidate, index) => candidate.url === observedResult[index]?.url);
      if (!hasSameCandidates) {
        setResult(observedResult);
        setSelectedCandidateUrl(null);
        if (uploadKeyParam) {
          writeThumbnailEditorUploadResult(uploadKeyParam, observedResult, {
            productName,
            mode,
          });
        }
      }
    }
  }, [observedGeneration, generationId, result, uploadKeyParam, productName, mode]);

  /**
   * 페이지 진입 시 workspace 의 active (pending/running) generation 이 있으면
   * generationId 자동 박기 → 모달 자연스럽게 복원. 새로고침해도 진행 상태 유지.
   *
   * 우선순위: URL ?generationId 가 있으면 그걸 사용. 없을 때만 자동 detect.
   */
  useEffect(() => {
    if (generationId || generationIdParam) return; // 이미 있으면 skip
    // 생성 항목은 콘텐츠 작업공간으로만 이어진다(KID-310) — 그 id가 없으면 자동 감지할 것이 없다.
    if (!contentWorkspaceId) return;
    const activeGen = pollingGenerations.find(
      (g) =>
        g.contentWorkspaceId === contentWorkspaceId &&
        (g.status === 'pending' || g.status === 'running'),
    );
    if (activeGen) {
      setGenerationId(activeGen.id);
      const next = new URLSearchParams(searchParams.toString());
      next.set('generationId', activeGen.id);
      router.replace(`?${next.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWorkspaceId, pollingGenerations.length, generationId, generationIdParam]);

  const { historyCandidates, recommendedCandidateUrl } = useEditorHistory({
    contentWorkspaceId,
    mode,
    result,
    generationId,
    observedGeneration,
    selectedCandidateUrl,
    setSelectedCandidateUrl,
  });

  const generateMutation = useGenerateThumbnail();
  const wingRegisterMutation = useAdoptAndUploadThumbnail();
  const deleteCandidateMutation = useDeleteThumbnailCandidate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleGenerate = async (options: { imageOnly?: boolean } = {}) => {
    const imageOnly = options.imageOnly === true;
    beginAwaiting();
    try {
      const dto = buildGenerateThumbnailDto({
        mode,
        slots,
        subject: thumbnailSubjectFromParams({ contentWorkspaceId, salesProductId }),
        contentWorkspaceId,
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
        // Uniform async path: workspace-bound, candidate-bound, workspace, and
        // direct-upload jobs all return a ThumbnailGeneration id first. The
        // single-generation query above keeps polling even when ownerless rows
        // are intentionally absent from the workspace-bound list query.
        setGenerationId(data.generationId);
        const next = new URLSearchParams(searchParams.toString());
        next.set('generationId', data.generationId);
        router.replace(`?${next.toString()}`, { scroll: false });
        await queryClient.refetchQueries({
          queryKey: queryKeys.thumbnailJobs.all,
        });
        toast.success('썸네일 생성 시작 — 잠시만 기다려주세요');
        return;
      }

      if (data?.candidates && data.candidates.length > 0) {
        // Legacy compatibility only. Current server responses are async
        // `pending` ledgers, but older previews may still return candidates.
        setResult(data.candidates);
        setGenerationId(data.generationId);
        if (uploadKeyParam) {
          writeThumbnailEditorUploadResult(uploadKeyParam, data.candidates, {
            productName,
            mode,
          });
        }
        clearAwaiting();
        queryClient.invalidateQueries({
          queryKey: queryKeys.thumbnailJobs.all,
        });
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

  // 후보 고르기는 화면 선택일 뿐이다 — 채택(작업공간의 대표이미지)은 몰에 올릴 때 한다(KID-313 W3a).
  const handleSelectCandidate = (url: string) => {
    setSelectedCandidateUrl(url || null);
  };

  const selectedHistoryCandidate = selectedCandidateUrl
    ? historyCandidates.find((c) => (resolveImageUrl(c.url) ?? c.url) === selectedCandidateUrl) ?? null
    : null;

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
    const candidateJob = selectedHistoryCandidate?.generationId
      ? (observedGeneration?.id === selectedHistoryCandidate.generationId
        ? observedGeneration
        : pollingGenerations.find((job) => job.id === selectedHistoryCandidate.generationId)) ?? null
      : null;
    const salesProductId = candidateJob?.workspace?.salesProductId ?? null;
    if (!selectedHistoryCandidate?.assetId || !candidateJob || !salesProductId) {
      toast.error('판매상품에 저장된 후보만 몰에 올릴 수 있습니다');
      return;
    }
    try {
      const wingResult = await wingRegisterMutation.mutateAsync({
        contentWorkspaceId: candidateJob.contentWorkspaceId,
        salesProductId,
        assetId: selectedHistoryCandidate.assetId,
      });
      if (!mountedRef.current) return;
      if (representativeImageUploadReached(wingResult)) {
        toast.success(representativeImageUploadedMessage());
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
    // selectedCandidateUrl 은 resolveImageUrl 거친 값 — 후보 자산 id 로 backend 에 보낸다
    const target = selectedHistoryCandidate;
    if (!target?.generationId || !target.assetId) {
      setDeleteDialogOpen(false);
      toast.error('선택한 이미지를 찾을 수 없습니다');
      return;
    }
    const targetGenId = target.generationId;
    const targetUrl = target.url;
    setDeleteDialogOpen(false);
    try {
      const res = await deleteCandidateMutation.mutateAsync({
        jobId: targetGenId,
        assetId: target.assetId,
      });
      if (!mountedRef.current) return;
      // 현재 편집 중인 generation 의 candidate 를 삭제했을 때만 로컬 state 조정
      if (targetGenId === generationId) {
        if (res.generationDeleted) {
          // 현재 gen row 도 cascade 삭제됨. history 에 다른 gen 후보가 남았으면
          // 그 중 가장 최근 것으로 편집기 재진입 (UseCaseSelection 폴백 방지).
          const remaining = historyCandidates.find((c) => c.generationId && c.generationId !== targetGenId);
          setResult([]);
          setGenerationId(null);
          setSelectedCandidateUrl(null);
          if (!remaining?.generationId) {
            toast.success('생성 결과가 삭제되었습니다');
            router.push(returnTo ?? THUMBNAIL_GENERATION_ROOT);
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

  const hasInput = !!contentWorkspaceId || hasInputSlotFilled;

  // NOTE: 예전에는 imageUrl+contentWorkspaceId+mode+editCase 쿼리가 있으면 자동으로 handleGenerate 를 호출했다.
  // 하지만 이 동작이 두 가지 UX 문제를 일으켰다:
  //   1. 모달 → "편집화면으로 가기" 를 누르면 편집 화면에 들어가자마자 바로 생성 mutation 이 돌아서
  //      사용자가 입력·설정을 확인할 틈도 없이 AI 가 돌아감.
  //   2. 생성 중에 새로고침하면 동일 useEffect 가 다시 fire 되어 **재생성** 이 일어남 (중복 과금 + 혼란).
  //
  // 의도된 플로우: 편집 화면은 항상 "편집하기" 버튼(EditorControlPanel → onGenerate) 클릭으로만 시작.
  // 생성 성공 직후 handleGenerate 가 `generationId` 를 URL 에 replace 하므로, 그 이후 새로고침은
  // 기존 initialGeneration 쿼리가 자동으로 candidates 를 복원한다.

  return (
    <div
      className={cn(
        'flex flex-col bg-slate-50',
        embedded ? 'min-h-[720px] rounded-lg border border-slate-200' : 'h-screen -m-6',
      )}
    >
      <EditorPageHeader
        productName={productName}
        mode={mode}
        editCase={editCase}
        backLabel={returnTo ? '상품 화면' : '허브'}
        onBack={() => {
          if (onBack) {
            onBack();
            return;
          }
          router.push(
            returnTo ?? THUMBNAIL_GENERATION_ROOT,
          );
        }}
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
            selectProductValue(slots) ?? slots.find((s) => s.value)?.value ?? imageUrlParam ?? null;
          setSlots(
            buildInitialSlots(nextMode, nextCase, {
              initialProductImage: carryOverImage,
              sceneType,
              ownerContentWorkspaceId: contentWorkspaceId,
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
          contentWorkspaceId={contentWorkspaceId}
          slots={slots}
          onSlotsChange={setSlots}
          fallbackProductImage={fallbackProductImage}
          originalImage={originalPreviewImage}
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
            // bundle 의 경우 ownerContentWorkspaceId 를 박아두면 결과 저장 기준이 "이 상품" 으로 유지.
            const currentProduct = selectProductValue(slots) ?? imageUrlParam ?? null;
            setEditCase(nextCase);
            setSlots(
              buildInitialSlots('edit', nextCase, {
                initialProductImage: currentProduct,
                sceneType,
                ownerContentWorkspaceId: contentWorkspaceId,
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
          originalImage={originalPreviewImage ?? productImage}
          candidates={historyCandidates}
          selectedCandidateUrl={selectedCandidateUrl}
          isGenerating={generateMutation.isPending || isAwaitingGen || forcedAwaiting}
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
          isPending={generateMutation.isPending || isAwaitingGen || forcedAwaiting}
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

function jobResult(job: ThumbnailJobView): Array<{ url: string; filename: string }> {
  return job.candidates.map((candidate) => ({
    url: candidate.url,
    filename: candidate.label ?? candidate.url.split('/').pop()?.split('?')[0] ?? candidate.url,
  }));
}
