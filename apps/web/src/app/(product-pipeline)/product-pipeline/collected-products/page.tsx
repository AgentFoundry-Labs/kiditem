'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Store, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAllGenerationsInProgress,
  useKidsPlayfulGenerationCancel,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  collectedProductDetailHref,
  collectedProductEditorHref,
  REGISTERED_PRODUCTS_ROOT,
} from '../_shared/lib/product-pipeline-routes';
import { ProductPipelineHeader } from '../_shared/components/inbox/ProductPipelineHeader';
import { ProductPipelineStats } from '../_shared/components/inbox/ProductPipelineStats';
import { GenerationProgressBannerStack } from '../_shared/components/workspace/GenerationProgressBanner';
import {
  KIDSNOTE_CATEGORY_PRESET,
  KIDSNOTE_DEFAULT_CATEGORY,
  type KidsnoteCategoryKey,
} from '../_shared/lib/kidsnote-registration-form';
import ProductList from './components/list/ProductList';
import ScrapeUrlInput from './components/list/ScrapeUrlInput';
import SourcingToolbar from './components/list/SourcingToolbar';
import { useProcessingIds } from './hooks/useProcessingIds';
import { useScrapeUrl } from './hooks/useScrapeUrl';
import { useWingRegistrationPreparation } from './hooks/useWingRegistrationPreparation';
import {
  candidatesApi,
  isInProgress,
  productsApi,
  searchSellpiaInventorySkus,
  type QuickProcessTask,
  type SourcingSort,
} from './lib/sourcing-api';
import WingRegistrationConfirmDialog from './components/wing/WingRegistrationConfirmDialog';
import {
  downloadWingExcel,
  generateWingExcelForCandidates,
  isConfirmedWingRegistration,
  submitWingRegistration,
  translateWingError,
  waitForRegisteredListing,
  type WingRegistrationDraft,
  type WingRegistrationOverrides,
  type WingSellpiaSelection,
} from './lib/wing-registration-flow';
import { MallQuickRegisterRows } from './components/MallQuickRegisterRows';
import { useMallQuickRegister } from './hooks/useMallQuickRegister';
import {
  emptyStateCopyForSourceFilter,
  platformForSourceFilter,
  type SourcingSourceFilter,
} from './lib/source-filter';

export default function SourcingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<SourcingSort>('newest');
  const [sourceFilter, setSourceFilter] = useState<SourcingSourceFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [quickProcessModalOpen, setQuickProcessModalOpen] = useState(false);
  const [quickProcessTargetIds, setQuickProcessTargetIds] = useState<string[]>([]);
  const [quickProcessingIds, setQuickProcessingIds] = useState<Set<string>>(() => new Set());
  const [wingGenerating, setWingGenerating] = useState(false);
  // 등록 확인 모달의 초안. `null` 이면 모달이 닫혀 있다. 초안이 있다는 것은
  // 카테고리 추론과 상세설명 렌더가 이미 성공했다는 뜻이다.
  const [wingDraft, setWingDraft] = useState<WingRegistrationDraft | null>(null);
  const [wingSubmitting, setWingSubmitting] = useState(false);
  const [wingSubmissionError, setWingSubmissionError] = useState<string | null>(null);
  const wingPreparation = useWingRegistrationPreparation({
    onReady: (draft) => {
      setWingSubmissionError(null);
      setWingDraft(draft);
    },
    onError: (message) => toast.error(message),
  });

  const scrape = useScrapeUrl();
  const platform = platformForSourceFilter(sourceFilter);

  const { data: productData, isLoading, isPlaceholderData } = useQuery({
    queryKey: queryKeys.sourcing.list({
      page: String(page),
      limit: String(pageSize),
      sort,
      source: sourceFilter,
    }),
    queryFn: () => productsApi.list({ page, limit: pageSize, sort, platform }),
    placeholderData: previousData => previousData,
    // 후보 inbox 는 sourced 상태가 작업 대상이다. 진행 중 AI 생성은 별도 배너 쿼리가 맡는다.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((p) => isInProgress(p.status)) ? 10000 : false;
    },
  });
  const isRefreshing = isPlaceholderData;

  const products = productData?.items ?? [];
  const total = productData?.total ?? 0;

  const { processingIds } = useProcessingIds(products);
  const quickProcessTargetIdSet = new Set(quickProcessTargetIds);
  const quickProcessTargetProducts = products.filter((product) => quickProcessTargetIdSet.has(product.id));
  // 몰별 등록은 어댑터 레지스트리가 그린다. 값은 상품 상세에 저장된 것을 읽는다 —
  // 모달은 값을 묻지 않고 버튼만 세운다.
  const mallRegister = useMallQuickRegister({
    candidateId: quickProcessTargetIds[0] ?? null,
    enabled: quickProcessModalOpen,
  });
  const displayedProcessingIds = new Set([...processingIds, ...quickProcessingIds]);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => candidatesApi.delete(id).then(() => id)),
      );
      const succeededIds = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [{ id: ids[index]!, reason: result.reason as unknown }]
          : [],
      );
      return {
        succeededIds,
        failedIds: failures.map((failure) => failure.id),
        firstFailure: failures[0]?.reason,
      };
    },
    onMutate: (ids) => {
      setDeletingIds((prev) => new Set([...prev, ...ids]));
    },
    onSuccess: ({ succeededIds, failedIds, firstFailure }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      succeededIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.productContent.sourcingLinks(id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations({ sourceCandidateId: id }) });
      });
      if (failedIds.length > 0) {
        toast.error(
          failedIds.length === 1 && isApiError(firstFailure)
            ? firstFailure.detail
            : `${failedIds.length}개 소싱 후보 삭제에 실패했습니다.`,
        );
      }
    },
    onError: (err) => toast.error(isApiError(err) ? err.detail : '소싱 후보 삭제에 실패했습니다.'),
    onSettled: (_data, _err, ids) => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    },
  });

  const quickProcessMutation = useMutation({
    mutationFn: async ({ ids, task }: { ids: string[]; task: QuickProcessTask }) => {
      const uniqueIds = [...new Set(ids)];
      const results = await Promise.allSettled(
        uniqueIds.map((id) => candidatesApi.quickProcess(id, task).then(() => id)),
      );
      const succeededIds = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failedIds = uniqueIds.filter((id) => !succeededIds.includes(id));
      return { succeededIds, failedIds };
    },
    onMutate: ({ ids }) => {
      setQuickProcessingIds((prev) => new Set([...prev, ...ids]));
    },
    onSuccess: ({ succeededIds, failedIds }, { task }) => {
      const taskLabel = quickProcessTaskLabel(task);
      if (succeededIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
        succeededIds.forEach((id) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.productContent.sourcingLinks(id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations({ sourceCandidateId: id }) });
        });
        toast.success(`${succeededIds.length}개 상품의 ${taskLabel} 작업을 시작했습니다.`);
      }
      if (failedIds.length > 0) {
        toast.error(`${failedIds.length}개 상품의 ${taskLabel} 작업 시작에 실패했습니다.`);
      }
      setQuickProcessModalOpen(false);
      setQuickProcessTargetIds([]);
    },
    onError: (err) => toast.error(isApiError(err) ? err.detail : 'AI 간편 처리 시작에 실패했습니다.'),
    onSettled: (_data, _err, { ids }) => {
      setQuickProcessingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    },
  });

  const sourcedCount = products.filter((p) => p.status === 'sourced').length;

  const runWingRegister = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0 || wingGenerating) return false;
    setWingGenerating(true);
    try {
      const { bytes, productCount } = await generateWingExcelForCandidates(ids);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      downloadWingExcel(bytes, `쿠팡WING_일괄등록_${stamp}.xlsx`);
      toast.success(`${productCount}개 상품의 쿠팡 WING 일괄등록 엑셀을 만들었어요`, {
        description: '저장된 WING 카테고리 사용 · 상세페이지는 포함되지 않으므로 WING에서 추가하세요.',
      });
      return true;
    } catch (err) {
      toast.error(
        isApiError(err)
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'WING 엑셀 생성에 실패했습니다.',
      );
      return false;
    } finally {
      setWingGenerating(false);
    }
  };

  const wingErrorMessage = (err: unknown, fallback: string): string =>
    translateWingError(isApiError(err) ? err.detail : err instanceof Error ? err.message : fallback);

  // 모달(단일 작업) = 엑셀이 아니라 WING 상품등록 페이지를 열어 직접 채우는 방식.
  //
  // 확장으로 넘기기 전에 등록 확인 모달을 한 번 거친다. 노출상품명·옵션·가격·재고는
  // WING 폼이 열린 뒤에는 고치기 어려우므로 여기서 확정받는다.
  const handleModalWingRegister = () => {
    const ids = [...quickProcessTargetIds];
    if (ids.length === 0 || wingGenerating || wingPreparation.isPreparing) return;
    setWingSubmissionError(null);
    wingPreparation.start(ids[0]);
  };

  // 사용자가 고친 값(`overrides`)을 그대로 넘긴다. 초안의 원본 payload 를 보내면
  // 모달이 장식이 된다 — `submitWingRegistration` 이 override 를 반영해 전송한다.
  const handleWingConfirm = async (
    overrides: WingRegistrationOverrides,
    autoSubmit: boolean,
    channelAccountId: string,
    sellpiaSelection: WingSellpiaSelection,
  ) => {
    if (!wingDraft || wingSubmitting) return;
    const candidateId = wingDraft.candidateId;
    setWingSubmissionError(null);
    setWingSubmitting(true);
    try {
      const result = await submitWingRegistration(
        wingDraft,
        overrides,
        autoSubmit,
        channelAccountId,
        sellpiaSelection,
      );
      const executionId = result.submission.executionId;
      if (!executionId) throw new Error('WING 등록 실행 ID를 확인하지 못했습니다.');

      // 신규 등록은 확장이 확인한 WING 계정 증거로 확정한다. 준비 단계에서 이미
      // 동기화된 리스팅을 찾았다면 서버가 frozen한 내부 리스팅으로 확정한다.
      if (isConfirmedWingRegistration(result.submission)) {
        const externalListingId = result.submission.externalListingId;
        try {
          await completeExternalWingRegistration({
            candidateId,
            executionId,
            externalListingId,
            evidence: result.submission.evidence,
          });
        } catch (err) {
          await candidatesApi.markExternalWingRegistrationUnresolved(
            candidateId,
            executionId,
            { reason: 'completion_failed', message: wingErrorMessage(err, '알 수 없는 오류') },
          ).catch(() => undefined);
          toast.warning('쿠팡 등록은 됐지만 등록상품 목록 반영에 실패했어요', {
            description: `등록상품ID ${externalListingId} — 쿠팡 WING에서 등록 상태를 확인해 주세요. (${wingErrorMessage(err, '알 수 없는 오류')})`,
          });
        }
      } else if (result.submission.attempted) {
        toast.warning('상품등록 결과를 확인하지 못했어요', {
          description:
            result.submission.error
            ?? '열린 WING 탭에서 등록 여부를 직접 확인해 주세요.',
        });
      } else {
        toast.success('쿠팡 WING 상품등록 페이지를 열고 자동 입력을 시작했어요', {
          description:
            quickProcessTargetIds.length > 1
              ? '단일 직접 등록은 1개씩 진행됩니다 (첫 상품). 열린 WING 탭에서 확인 후 등록하세요.'
              : '확인한 값으로 자동 입력됩니다. 열린 WING 탭에서 최종 확인 후 등록하세요.',
        });
      }
      setWingDraft(null);
      setWingSubmissionError(null);
      setQuickProcessModalOpen(false);
      setQuickProcessTargetIds([]);
    } catch (err) {
      const message = wingErrorMessage(err, '쿠팡 WING 직접 등록에 실패했습니다.');
      setWingSubmissionError(message);
      toast.error(message);
    } finally {
      setWingSubmitting(false);
    }
  };

  const completeExternalWingRegistration = async ({
    candidateId,
    executionId,
    externalListingId,
    evidence,
  }: {
    candidateId: string;
    executionId: string;
    externalListingId: string;
    evidence?: Record<string, unknown>;
  }) => {
    await candidatesApi.confirmExternalRegistration(candidateId, {
      executionId,
      externalListingId,
      evidence,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
    const listed = await waitForRegisteredListing(externalListingId);
    if (listed) {
      toast.success('쿠팡에 등록하고 등록상품 목록에 올렸어요', {
        description: `등록상품ID ${externalListingId} — 등록상품 화면으로 이동합니다.`,
      });
      router.push(REGISTERED_PRODUCTS_ROOT);
    } else {
      toast.warning('등록은 됐지만 등록상품 목록에서 아직 확인되지 않아요', {
        description: `등록상품ID ${externalListingId} — 등록상품 화면에서 새로고침해 주세요.`,
      });
    }
    setWingDraft(null);
    setQuickProcessModalOpen(false);
    setQuickProcessTargetIds([]);
  };

  const setItemSelected = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisibleSelection = (selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      products.forEach((product) => {
        if (selected) next.add(product.id);
        else next.delete(product.id);
      });
      return next;
    });
  };

  const openQuickProcessModal = (id: string) => {
    setQuickProcessTargetIds(selectedIds.size > 0 ? [...selectedIds] : [id]);
    setQuickProcessModalOpen(true);
  };

  const closeQuickProcessModal = () => {
    if (quickProcessMutation.isPending) return;
    wingPreparation.cancel();
    setQuickProcessModalOpen(false);
    setQuickProcessTargetIds([]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <ProductPipelineHeader />

      {/* productId 없이 호출 — Trend/KIDITEM 전체에서 진행 중인 첫 entry 반환 */}
      <GenerationInProgressBannerSlot products={products} />

      <ProductPipelineStats
        draftLabel="등록 대기"
        totalLabel="전체 후보"
        draftCount={sourcedCount}
        totalCount={total}
      />

      <SourcingToolbar
        showScrapeInput={scrape.showScrapeInput}
        onToggleScrapeInput={scrape.toggleScrapeInput}
        sort={sort}
        pageSize={pageSize}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        sourceFilter={sourceFilter}
        onSourceFilterChange={(nextFilter) => {
          setSourceFilter(nextFilter);
          setPage(1);
        }}
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {scrape.showScrapeInput && (
          <ScrapeUrlInput
            scrapeUrl={scrape.scrapeUrl}
            onChange={scrape.setScrapeUrl}
            onKeyDown={scrape.handleKeyDown}
            onSubmit={scrape.handleSubmit}
            onClose={scrape.resetInput}
            isPending={scrape.isPending}
            isCheckingDuplicate={scrape.isCheckingDuplicate}
            duplicate={scrape.duplicate}
            error={scrape.scrapeError}
            success={scrape.scrapeSuccess}
            inputRef={scrape.scrapeInputRef}
          />
        )}

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5">
            <span className="text-sm font-black text-orange-900">
              {selectedIds.size}개 선택됨
            </span>
            <button
              type="button"
              onClick={() => runWingRegister([...selectedIds])}
              disabled={wingGenerating}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {wingGenerating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Store size={15} />
              )}
              쿠팡 WING 엑셀 (상세 제외)
            </button>
          </div>
        )}

        {isRefreshing && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm" aria-live="polite">
            <RefreshCw size={14} className="animate-spin text-emerald-600" />
            수집 상품 목록을 갱신 중입니다.
          </div>
        )}
        <div aria-busy={isRefreshing}>
        <ProductList
          isLoading={isLoading && !productData}
          products={products}
          processingIds={displayedProcessingIds}
          deletingIds={deletingIds}
          selectedIds={selectedIds}
          isDeletingSelected={deleteMutation.isPending}
          emptyState={emptyStateCopyForSourceFilter(sourceFilter)}
          onDelete={(id) => deleteMutation.mutate([id])}
          onDeleteSelected={() => deleteMutation.mutate([...selectedIds])}
          onSelectVisible={toggleVisibleSelection}
          onSelectedChange={setItemSelected}
          onNavigate={(id) => router.push(collectedProductDetailHref(id))}
          onOpenEditor={(id) => router.push(collectedProductEditorHref({ candidateId: id }))}
          onOpenQuickProcess={openQuickProcessModal}
          isQuickProcessingSelected={quickProcessMutation.isPending}
        />
        </div>

        <div className="mt-4">
          <Pagination page={page} limit={pageSize} total={total} onPageChange={setPage} />
        </div>
      </div>

      <QuickProcessSelectedDialog
        open={quickProcessModalOpen}
        targetCount={quickProcessTargetIds.length}
        targetProducts={quickProcessTargetProducts}
        isSubmitting={quickProcessMutation.isPending}
        wingRegistering={wingGenerating || wingPreparation.isPreparing}
        wingRegisteringMessage={wingPreparation.message}
        onClose={closeQuickProcessModal}
        onConfirm={(task) => quickProcessMutation.mutate({ ids: quickProcessTargetIds, task })}
        onWingRegister={handleModalWingRegister}
        mallRegister={mallRegister}
        mallDetailHref={
          quickProcessTargetIds[0]
            ? collectedProductDetailHref(quickProcessTargetIds[0])
            : null
        }
      />

      <WingRegistrationConfirmDialog
        draft={wingDraft}
        isSubmitting={wingSubmitting}
        submissionError={wingSubmissionError}
        onCancel={() => {
          if (wingSubmitting) return;
          setWingDraft(null);
          setWingSubmissionError(null);
        }}
        onConfirm={handleWingConfirm}
        onSearchSellpia={searchSellpiaInventorySkus}
      />
    </div>
  );
}

function QuickProcessSelectedDialog({
  open,
  targetCount,
  targetProducts,
  isSubmitting,
  wingRegistering,
  wingRegisteringMessage,
  onClose,
  onConfirm,
  onWingRegister,
  mallRegister,
  mallDetailHref,
}: {
  open: boolean;
  targetCount: number;
  targetProducts: Array<{ id: string; name: string; thumbnailUrl: string | null }>;
  isSubmitting: boolean;
  wingRegistering: boolean;
  wingRegisteringMessage: string | null;
  onClose: () => void;
  onConfirm: (task: QuickProcessTask) => void;
  onWingRegister: () => void;
  mallRegister: ReturnType<typeof useMallQuickRegister>;
  mallDetailHref: string | null;
}) {
  if (!open) return null;
  const previewProducts = targetProducts.slice(0, 6);
  const hiddenCount = Math.max(0, targetCount - previewProducts.length);
  const canSubmit = targetCount > 0 && !isSubmitting;

  return (
    <div role="dialog" aria-modal="true" aria-label="선택 상품 AI 간편 처리" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <Wand2 size={18} />
            </div>
            <h2 className="mt-3 text-base font-black text-slate-900">선택 상품 AI 간편 처리</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              이 카드 상품 또는 체크된 상품만 원하는 AI 작업으로 시작합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {targetCount > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-black text-slate-700">처리할 상품</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-violet-700 ring-1 ring-violet-100">
                {targetCount}개
              </span>
            </div>
            <div className="grid gap-2">
              {previewProducts.map((product) => (
                <div key={product.id} className="flex min-w-0 items-center gap-2 rounded-md bg-white p-2 ring-1 ring-slate-100">
                  {product.thumbnailUrl ? (
                    <img src={product.thumbnailUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded bg-slate-100" />
                  )}
                  <p className="truncate text-sm font-bold text-slate-800">{product.name}</p>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="px-1 text-xs font-bold text-slate-500">외 {hiddenCount}개 상품</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-sm font-bold text-slate-700">선택된 상품이 없습니다.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              카드의 AI 작업 선택 버튼을 다시 눌러 주세요.
            </p>
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
          <QuickProcessTaskButton
            title="상세페이지 생성"
            description="KIDITEM DESIGN 상세페이지"
            disabled={!canSubmit}
            isSubmitting={isSubmitting}
            onClick={() => onConfirm('detail')}
          />
          <QuickProcessTaskButton
            title="썸네일 생성"
            description="대표 이미지 기준 썸네일"
            disabled={!canSubmit}
            isSubmitting={isSubmitting}
            onClick={() => onConfirm('thumbnail')}
          />
          <QuickProcessTaskButton
            title="둘 다 실행"
            description="상세페이지 + 썸네일"
            disabled={!canSubmit}
            isSubmitting={isSubmitting}
            onClick={() => onConfirm('all')}
          />
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          {/* 쿠팡 WING 도 같은 줄로 선다. 예전에는 혼자 주황색 큰 버튼이었는데
              실제로 다른 것은 마지막 확인 한 단계뿐이라, 그 사실만 줄 안에 적고
              생김새는 나머지 몰과 같게 뒀다. */}
          <MallQuickRegisterRows
            readiness={mallRegister.readiness}
            results={mallRegister.results}
            runningMallKey={mallRegister.runningMallKey}
            isLoading={mallRegister.isLoading}
            disabled={targetCount === 0 || isSubmitting}
            detailHref={mallDetailHref}
            targetCount={targetCount}
            wing={{
              row: mallRegister.wingReadiness,
              busy: wingRegistering,
              busyLabel: wingRegisteringMessage ?? '등록 준비 중',
              result: null,
            }}
            onRunOne={(mallKey) => {
              if (mallKey === mallRegister.wingReadiness.mallKey) onWingRegister();
              else void mallRegister.runMalls([mallKey]);
            }}
            onRunSelected={async (mallKeys) => {
              // 폼 몰을 먼저 다 채우고 쿠팡을 마지막에 연다. 확인 창이 떠 있는 채로
              // 뒤에서 탭이 열리면 사람이 어느 창을 보는지 알 수 없다.
              const wingKey = mallRegister.wingReadiness.mallKey;
              await mallRegister.runMalls(mallKeys.filter((key) => key !== wingKey));
              if (mallKeys.includes(wingKey)) onWingRegister();
            }}
          />
        </div>

      </div>
    </div>
  );
}

function QuickProcessTaskButton({
  title,
  description,
  disabled,
  isSubmitting,
  onClick,
}: {
  title: string;
  description: string;
  disabled: boolean;
  isSubmitting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-24 flex-col items-start justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 text-left transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-black text-violet-800">
        {isSubmitting && <Loader2 size={13} className="animate-spin" />}
        {title}
      </span>
      <span className="mt-1 text-xs font-semibold text-slate-500">{description}</span>
    </button>
  );
}

function quickProcessTaskLabel(task: QuickProcessTask): string {
  if (task === 'detail') return '상세페이지 생성';
  if (task === 'thumbnail') return '썸네일 생성';
  return '상세페이지와 썸네일 생성';
}

/**
 * 리스트 페이지 상단 진행 배너 슬롯.
 *
 * `useAllGenerationsInProgress(null)` 는 productId 필터 없이 Trend+KIDITEM 전체 list polling
 * → 진행 중인 모든 entry 반환 → 다건이면 stacked 배너로 모두 표시.
 */
function GenerationInProgressBannerSlot({
  products,
}: {
  products: Array<{ id: string; name: string }>;
}) {
  const inProgressEntries = useAllGenerationsInProgress(null);
  const cancelGeneration = useKidsPlayfulGenerationCancel();
  if (inProgressEntries.length === 0) return null;

  const entries = inProgressEntries.map((e) => {
    const product = e.productId ? products.find((p) => p.id === e.productId) : null;
    return {
      id: e.id,
      templateId: e.templateId,
      status: e.imageProcessingStatus,
      productName: product?.name ?? e.productName ?? '',
      rawInput: e.rawInput,
    };
  });

  return (
    <GenerationProgressBannerStack
      entries={entries}
      onCancel={async (entry) => {
        await cancelGeneration.mutateAsync(entry.id);
      }}
    />
  );
}
