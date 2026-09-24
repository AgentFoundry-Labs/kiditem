'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REGISTRATION_ALREADY_REGISTERED_CODE, type SalesProductListItem } from '@kiditem/shared/sales-product';
import { FileSpreadsheet, Loader2, RefreshCw, Store, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MallSheetDialog } from '@/components/mall-sheet/MallSheetDialog';
import { Pagination } from '@/components/ui/Pagination';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  collectedProductDetailHref,
  collectedProductEditorHref,
  REGISTERED_PRODUCTS_ROOT,
} from '../_shared/lib/product-pipeline-routes';
import { ProductPipelineHeader } from '../_shared/components/inbox/ProductPipelineHeader';
import { ProductPipelineStats } from '../_shared/components/inbox/ProductPipelineStats';
import {
  KIDSNOTE_CATEGORY_PRESET,
  KIDSNOTE_DEFAULT_CATEGORY,
  type KidsnoteCategoryKey,
} from '../_shared/lib/kidsnote-registration-form';
import ProductList from './components/list/ProductList';
import ScrapeUrlInput from './components/list/ScrapeUrlInput';
import SourcingToolbar from './components/list/SourcingToolbar';
import { useScrapeUrl } from './hooks/useScrapeUrl';
import {
  useStartedGenerationProgress,
  type StartedGeneration,
} from './hooks/useStartedGenerationProgress';
import {
  searchSellpiaInventorySkus,
  salesProductGenerationApi,
  type SalesProductGenerationTask,
} from './lib/sourcing-api';
import { getMallPublishAdapter } from '../../../(channels)/_shared/adapters';
import {
  downloadWingExcel,
  generateWingExcelForSalesProducts,
} from '../../../(channels)/_shared/adapters/coupang-wing/wing-excel-export';
import {
  RegistrationConfirmDialog,
  type RegistrationConfirmation,
} from '../../../(channels)/_shared/RegistrationConfirmDialog';
import { useMallPublishRun } from '../../../(channels)/_shared/use-mall-publish-run';
import { registrationRunNotice } from './lib/registration-run-notice';
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
  const [sourceFilter, setSourceFilter] = useState<SourcingSourceFilter>('all');
  // 고른 카드는 페이지를 넘겨도 남는다. 묶음 작업(몰 대량등록 · 삭제 · AI 작업)은 이 선택에서
  // id 를 얻는다 — 지금 페이지에서 찾으면 다른 페이지에서 고른 상품이 빠진다(S5).
  const [selected, setSelected] = useState<Map<string, SalesProductListItem>>(() => new Map());
  const selectedIds = new Set(selected.keys());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [quickProcessModalOpen, setQuickProcessModalOpen] = useState(false);
  const [quickProcessTargetIds, setQuickProcessTargetIds] = useState<string[]>([]);
  const [quickProcessingIds, setQuickProcessingIds] = useState<Set<string>>(() => new Set());
  const pendingQuickProcessKeys = useRef(new Map<string, string>());
  // 이 화면이 시작한 생성. 진행은 이 목록의 생성 id 로만 본다 — 카드는 묻지 않는다.
  const [startedGenerations, setStartedGenerations] = useState<StartedGeneration[]>([]);
  const startedProgress = useStartedGenerationProgress(startedGenerations);
  const [wingGenerating, setWingGenerating] = useState(false);
  // 확인 창이 필요한 몰(어댑터 `confirmation`)의 확인 창. `null` 이면 닫혀 있다.
  const [confirmMallKey, setConfirmMallKey] = useState<string | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // 등록 실행은 등록 마법사와 같은 실행 훅을 쓴다 — 준비 → 시작 → 어댑터 → 결과(KID-321).
  const publishRun = useMallPublishRun();

  // 몰 대량등록: 고른 카드가 곧 판매상품 초안이라 만들 것 없이 그 id 로 창을 연다.
  const [mallSheetSalesProductIds, setMallSheetSalesProductIds] = useState<string[] | null>(null);

  const scrape = useScrapeUrl();
  const platform = platformForSourceFilter(sourceFilter);

  // 수집상품 한 줄 = 몰에 올라가기 전의 판매상품 한 줄(KID-310 · ADR-0022). 판매가를 정한 뒤에도
  // 몰에 오를 때까지 남아야 등록 · 몰 대량등록을 여기서 한다 — `status` 로 거르지 않는다.
  // 원천 기록(수집상품)은 목록이 읽지 않는다. 폴링하지 않는다 — 진행 중 생성은 이 화면이 시작한
  // 것만 한 줄로 따로 본다.
  const listQuery = { focus: 'preparing' as const, sourcePlatform: platform, page, limit: pageSize };
  const { data: productData, isLoading, isPlaceholderData } = useQuery({
    queryKey: salesProductKeys.list(listQuery),
    queryFn: () => salesProductApi.list(listQuery),
    placeholderData: previousData => previousData,
  });
  const isRefreshing = isPlaceholderData;

  const products = productData?.items ?? [];
  const total = productData?.total ?? 0;

  const quickProcessTargetProducts = quickProcessTargetIds
    .map((id) => selected.get(id) ?? products.find((product) => product.id === id))
    .filter((product): product is SalesProductListItem => Boolean(product))
    .map((product) => ({ id: product.id, name: product.name, thumbnailUrl: product.imageUrl }));
  // 몰별 등록은 어댑터 레지스트리가 그린다. 값은 상품 상세에 저장된 것을 읽는다 —
  // 모달은 값을 묻지 않고 버튼만 세운다.
  const mallRegister = useMallQuickRegister({
    salesProductId: quickProcessTargetIds[0] ?? null,
    enabled: quickProcessModalOpen,
  });
  const displayedProcessingIds = new Set([...startedProgress.runningSalesProductIds, ...quickProcessingIds]);

  const deleteMutation = useMutation({
    mutationFn: async (items: SalesProductListItem[]) => {
      const ids = items.map((item) => item.id);
      const results = await Promise.allSettled(items.map(deleteCollectedDraft));
      const deleted = results
        .filter((result): result is PromiseFulfilledResult<CollectedDraftDeletion> => result.status === 'fulfilled')
        .map((result) => result.value);
      const succeededIds = deleted.map((result) => result.salesProductId);
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [{ id: ids[index]!, reason: result.reason as unknown }]
          : [],
      );
      return {
        deleted,
        succeededIds,
        failedIds: failures.map((failure) => failure.id),
        firstFailure: failures[0]?.reason,
      };
    },
    onMutate: (items) => {
      setDeletingIds((prev) => new Set([...prev, ...items.map((item) => item.id)]));
    },
    onSuccess: ({ deleted, succeededIds, failedIds, firstFailure }) => {
      reportCollectedDraftDeletions(deleted);
      setSelected((prev) => {
        const next = new Map(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      if (failedIds.length > 0) {
        toast.error(
          failedIds.length === 1 && isApiError(firstFailure)
            ? firstFailure.detail
            : `${failedIds.length}개 수집상품 삭제에 실패했습니다.`,
        );
      }
    },
    onError: (err) => toast.error(isApiError(err) ? err.detail : '수집상품 삭제에 실패했습니다.'),
    onSettled: (_data, _err, items) => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        items.forEach((item) => next.delete(item.id));
        return next;
      });
    },
  });

  const quickProcessMutation = useMutation({
    mutationFn: async ({ ids, task }: { ids: string[]; task: SalesProductGenerationTask }) => {
      const uniqueIds = [...new Set(ids)];
      const results = await Promise.allSettled(
        uniqueIds.map((id) => {
          const requestKey = `${task}:${id}`;
          const idempotencyKey = pendingQuickProcessKeys.current.get(requestKey)
            ?? createSecureRandomUuid();
          pendingQuickProcessKeys.current.set(requestKey, idempotencyKey);
          return salesProductGenerationApi.start(id, task, idempotencyKey).then((response) => ({
            salesProductId: id,
            detailPageId: response.detailPageId,
            thumbnailGenerationId: response.thumbnailGenerationId,
            startedAt: Date.now(),
          }));
        }),
      );
      const started = results
        .filter((result): result is PromiseFulfilledResult<StartedGeneration> => result.status === 'fulfilled')
        .map((result) => result.value);
      const succeededIds = started.map((item) => item.salesProductId);
      const failedIds = uniqueIds.filter((id) => !succeededIds.includes(id));
      return { started, succeededIds, failedIds };
    },
    onMutate: ({ ids }) => {
      setQuickProcessingIds((prev) => new Set([...prev, ...ids]));
    },
    onSuccess: ({ started, succeededIds, failedIds }, { task }) => {
      const taskLabel = quickProcessTaskLabel(task);
      if (started.length > 0) {
        const restarted = new Set(succeededIds);
        setStartedGenerations((prev) => [
          ...prev.filter((item) => !restarted.has(item.salesProductId)),
          ...started,
        ]);
        queryClient.invalidateQueries({ queryKey: queryKeys.collectedProducts.startedProgress('detail') });
        queryClient.invalidateQueries({ queryKey: queryKeys.collectedProducts.startedProgress('thumbnail') });
      }
      if (succeededIds.length > 0) {
        succeededIds.forEach((id) => pendingQuickProcessKeys.current.delete(`${task}:${id}`));
        setSelected((prev) => {
          const next = new Map(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
        succeededIds.forEach((id) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.forSalesProduct(id) });
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


  const runWingRegister = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0 || wingGenerating) return false;
    setWingGenerating(true);
    try {
      const { bytes, fileName, productCount } = await generateWingExcelForSalesProducts(ids);
      downloadWingExcel(bytes, fileName);
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

  const errorMessage = (err: unknown, fallback: string): string =>
    isApiError(err) ? err.detail : err instanceof Error ? err.message : fallback;

  const closeConfirmation = () => {
    if (confirmSubmitting) return;
    setConfirmMallKey(null);
    setConfirmError(null);
  };

  // 확인 창의 결정: 폼 채우기는 빠른 등록 훅이, 등록 실행은 등록 마법사와 같은 실행 훅이 맡는다.
  const handleConfirmation = async (confirmation: RegistrationConfirmation) => {
    const mallKey = confirmMallKey;
    const adapter = mallKey ? getMallPublishAdapter(mallKey) : null;
    if (!mallKey || !adapter || confirmSubmitting) return;
    setConfirmError(null);
    setConfirmSubmitting(true);
    const registeringSalesProductId = confirmation.submit ? quickProcessTargetIds[0] ?? null : null;
    try {
      if (!confirmation.submit) {
        await mallRegister.fillConfirmed(mallKey, {
          values: confirmation.values,
          channelAccount: confirmation.channelAccount,
        });
        setConfirmMallKey(null);
        return;
      }
      const item = mallRegister.item;
      if (!item) throw new Error('보낼 상품을 아직 읽지 못했습니다.');
      const [task] = await publishRun.start([{
        id: `${mallKey}#0`,
        mallKey,
        mallName: adapter.mallName,
        channelAccountId: confirmation.channelAccount.id,
        items: [item],
        values: confirmation.values,
        adapterValues: confirmation.adapterValues,
        status: 'pending',
        outcome: null,
        error: null,
      }]);
      if (!task) return;
      // 이미 그 몰 계정에 올라간 상품이라 울타리가 새 등록을 거절했다 — 확인 창을 닫고 그 몰 줄에 적는다(KID-320 S7).
      if (task.errorCode === REGISTRATION_ALREADY_REGISTERED_CODE) {
        mallRegister.recordOutcome({
          mallKey,
          mallName: adapter.mallName,
          status: 'already_registered',
          message: task.error ?? '이미 이 몰 계정에 등록된 상품입니다.',
          manualSteps: [],
        });
        toast.error(`${adapter.mallName}에 이미 등록된 상품이에요`);
        setConfirmMallKey(null);
        return;
      }
      const notice = registrationRunNotice(task);
      const toastOptions = notice.description ? { description: notice.description } : {};
      if (notice.tone === 'success') toast.success(notice.title, toastOptions);
      else if (notice.tone === 'warning') toast.warning(notice.title, toastOptions);
      else toast.error(notice.title, toastOptions);
      if (notice.tone === 'error') {
        setConfirmError(notice.description ?? notice.title);
        return;
      }
      setConfirmMallKey(null);
      setQuickProcessModalOpen(false);
      setQuickProcessTargetIds([]);
      if (notice.registered) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all });
        router.push(REGISTERED_PRODUCTS_ROOT);
      }
    } catch (err) {
      const message = adapter.describeError?.(errorMessage(err, '등록에 실패했습니다.')) ?? errorMessage(err, '등록에 실패했습니다.');
      setConfirmError(message);
      toast.error(message);
    } finally {
      setConfirmSubmitting(false);
      // 등록 실행은 울타리를 열었을 수 있다 — 결과와 무관하게 등록 상태와 목록을 다시 읽는다(KID-320).
      if (registeringSalesProductId) {
        void queryClient.invalidateQueries({ queryKey: salesProductKeys.registrationState(registeringSalesProductId) });
        void queryClient.invalidateQueries({ queryKey: [...salesProductKeys.all, 'list'] });
      }
    }
  };

  const setItemSelected = (id: string, isSelected: boolean) => {
    const item = products.find((product) => product.id === id);
    setSelected((prev) => {
      const next = new Map(prev);
      if (isSelected && item) next.set(id, item);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisibleSelection = (isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      products.forEach((product) => {
        if (isSelected) next.set(product.id, product);
        else next.delete(product.id);
      });
      return next;
    });
  };

  const deleteById = (id: string) => {
    const item = selected.get(id) ?? products.find((product) => product.id === id);
    if (item) deleteMutation.mutate([item]);
  };

  const openQuickProcessModal = (id: string) => {
    setQuickProcessTargetIds(selectedIds.size > 0 ? [...selectedIds] : [id]);
    setQuickProcessModalOpen(true);
  };

  const closeQuickProcessModal = () => {
    if (quickProcessMutation.isPending) return;
    setQuickProcessModalOpen(false);
    setQuickProcessTargetIds([]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <ProductPipelineHeader />

      {(startedProgress.runningDetailCount > 0 || startedProgress.runningThumbnailCount > 0) && (
        <div
          className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--primary-soft)] px-5 py-2 text-sm font-semibold text-[var(--primary)]"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={14} className="animate-spin" />
          {startedGenerationProgressLabel(startedProgress.runningDetailCount, startedProgress.runningThumbnailCount)}
        </div>
      )}

      <ProductPipelineStats
        ariaLabel="수집상품 수"
        totalLabel="판매가 미정"
        totalCount={productData?.summary.draft ?? 0}
        draftLabel="몰 등록 전"
        draftCount={total}
      />

      <SourcingToolbar
        showScrapeInput={scrape.showScrapeInput}
        onToggleScrapeInput={scrape.toggleScrapeInput}
        pageSize={pageSize}
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
            ownerStatus={scrape.ownerStatus}
            scrapeUrl={scrape.scrapeUrl}
            onChange={scrape.setScrapeUrl}
            onKeyDown={scrape.handleKeyDown}
            onSubmit={scrape.handleSubmit}
            onClose={scrape.resetInput}
            isPending={scrape.isPending}
            isCheckingDuplicate={scrape.isCheckingDuplicate}
            duplicate={scrape.duplicate}
            error={scrape.scrapeError}
            errorLink={scrape.scrapeErrorLink}
            success={scrape.scrapeSuccess}
            inputRef={scrape.scrapeInputRef}
          />
        )}

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5">
            <span className="text-sm font-black text-orange-900">
              {selectedIds.size}개 선택됨
            </span>
            {/* 고른 상품으로 할 수 있는 일이 둘이라 한 묶음으로 세운다 — 좁은 화면에서는 줄을 바꾼다. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMallSheetSalesProductIds([...selectedIds])}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 text-sm font-black text-orange-900 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileSpreadsheet size={15} />
                몰 대량등록
              </button>
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
          onDelete={deleteById}
          onDeleteSelected={() => deleteMutation.mutate([...selected.values()])}
          onSelectVisible={toggleVisibleSelection}
          onSelectedChange={setItemSelected}
          onNavigate={(id) => router.push(collectedProductDetailHref(id))}
          onOpenEditor={(id) => router.push(collectedProductEditorHref({ salesProductId: id }))}
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
        onClose={closeQuickProcessModal}
        onConfirm={(task) => quickProcessMutation.mutate({ ids: quickProcessTargetIds, task })}
        onOpenConfirmation={(mallKey) => {
          setConfirmError(null);
          setConfirmMallKey(mallKey);
        }}
        mallRegister={mallRegister}
        mallDetailHref={
          quickProcessTargetIds[0]
            ? collectedProductDetailHref(quickProcessTargetIds[0])
            : null
        }
      />

      {mallSheetSalesProductIds && (
        <MallSheetDialog
          salesProductIds={mallSheetSalesProductIds}
          intro="선택한 수집상품의 판매상품 초안을 몰 양식으로 만듭니다."
          onClose={() => setMallSheetSalesProductIds(null)}
        />
      )}

      <RegistrationConfirmDialog
        adapter={confirmMallKey ? getMallPublishAdapter(confirmMallKey) : null}
        salesProductId={quickProcessTargetIds[0] ?? null}
        isSubmitting={confirmSubmitting}
        submissionError={confirmError}
        onCancel={closeConfirmation}
        onConfirm={(confirmation) => { void handleConfirmation(confirmation); }}
        onSearchSellpia={searchSellpiaInventorySkus}
      />
    </div>
  );
}

/** 몰 대량등록 창 머리 — 고른 수집상품으로 판매상품을 몇 개 만들었고 무엇을 뺐는지. */
function QuickProcessSelectedDialog({
  open,
  targetCount,
  targetProducts,
  isSubmitting,
  onClose,
  onConfirm,
  onOpenConfirmation,
  mallRegister,
  mallDetailHref,
}: {
  open: boolean;
  targetCount: number;
  targetProducts: Array<{ id: string; name: string; thumbnailUrl: string | null }>;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (task: SalesProductGenerationTask) => void;
  /** 확인 창이 필요한 몰을 눌렀다. 화면이 그 몰의 확인 창을 연다. */
  onOpenConfirmation: (mallKey: string) => void;
  mallRegister: ReturnType<typeof useMallQuickRegister>;
  mallDetailHref: string | null;
}) {
  if (!open) return null;
  const previewProducts = targetProducts.slice(0, 6);
  const hiddenCount = Math.max(0, targetCount - previewProducts.length);
  const canSubmit = targetCount > 0 && !isSubmitting;

  return (
    <div role="dialog" aria-modal="true" aria-label="선택 상품 AI 간편 처리" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      {/* 몰 줄이 열여덟이라 내용이 창보다 길다. 창 높이를 넘지 않게 두고 머리만 남긴 채
          본문을 스크롤한다. 폭을 넓혀 몰마다 이유가 두세 줄로 접히지 않게 한다. */}
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <Wand2 size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-900">선택 상품 AI 간편 처리</h2>
              <p className="mt-0.5 text-sm font-semibold text-slate-500">
                이 카드 상품 또는 체크된 상품만 원하는 AI 작업으로 시작합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
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
            {/* 확인 창이 필요한 몰(쿠팡 WING)도 같은 줄로 선다. 다른 것은 누르면 확인 창이 뜬다는 것뿐이다. */}
            <MallQuickRegisterRows
              readiness={mallRegister.readiness}
              registrationAccounts={mallRegister.registrationAccounts}
              results={mallRegister.results}
              runningMallKeys={mallRegister.runningMallKeys}
              isLoading={mallRegister.isLoading}
              disabled={targetCount === 0 || isSubmitting}
              detailHref={mallDetailHref}
              targetCount={targetCount}
              confirmationMallKeys={mallRegister.confirmationMallKeys}
              onRunOne={(mallKey) => {
                if (mallRegister.confirmationMallKeys.includes(mallKey)) onOpenConfirmation(mallKey);
                else void mallRegister.runMalls([mallKey]);
              }}
              onRunSelected={async (mallKeys) => {
                // 폼 몰을 먼저 다 채우고 확인 창을 마지막에 연다. 확인 창이 떠 있는 채로
                // 뒤에서 탭이 열리면 사람이 어느 창을 보는지 알 수 없다.
                const confirmKeys = mallKeys.filter((key) => mallRegister.confirmationMallKeys.includes(key));
                await mallRegister.runMalls(mallKeys.filter((key) => !confirmKeys.includes(key)));
                if (confirmKeys[0]) onOpenConfirmation(confirmKeys[0]);
              }}
            />
          </div>
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

function quickProcessTaskLabel(task: SalesProductGenerationTask): string {
  if (task === 'detail') return '상세페이지 생성';
  if (task === 'thumbnail') return '썸네일 생성';
  return '상세페이지와 썸네일 생성';
}

interface CollectedDraftDeletion {
  salesProductId: string;
}

/**
 * 수집상품 카드 하나를 지운다 — 초안과 그 원본 기록이 한 번에 지워진다(KID-313,
 * `DELETE /api/products/sales-products/:id`). 판매 상품이거나 몰에 올라가 있으면 서버가 409 로
 * 이유를 알려 주고, 그 이유가 그대로 오류로 보인다.
 */
async function deleteCollectedDraft(item: SalesProductListItem): Promise<CollectedDraftDeletion> {
  await salesProductApi.deleteDraft(item.id);
  return { salesProductId: item.id };
}

function reportCollectedDraftDeletions(deleted: readonly CollectedDraftDeletion[]): void {
  if (deleted.length > 0) toast.success(`${deleted.length}개 수집상품을 지웠습니다.`);
}

/** 이 화면이 시작한 AI 작업 진행 한 줄. */
function startedGenerationProgressLabel(detailCount: number, thumbnailCount: number): string {
  const parts = [
    ...(detailCount > 0 ? [`상세페이지 ${detailCount}개`] : []),
    ...(thumbnailCount > 0 ? [`썸네일 ${thumbnailCount}개`] : []),
  ];
  return `AI 작업 진행 중 — ${parts.join(' · ')}`;
}
