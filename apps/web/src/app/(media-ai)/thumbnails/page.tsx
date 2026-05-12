'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ErrorState, EmptyState } from '@/components/ui/EmptyState';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isApplied, isReady } from '../_shared/lib/thumbnail-status';
import { useGenerationList } from '../_shared/hooks/useThumbnailGenerations';
import { DetailModal } from '../_shared/components/thumbnails/DetailModal';
import { useAnalysisList } from './hooks/useThumbnailAnalysis';
import { useTrackingList } from './hooks/useThumbnailTracking';
import { useBatchAnalysis } from './hooks/useBatchAnalysis';
import { useThumbnailActions } from './hooks/useThumbnailActions';
import { useCoupangImageSync } from './hooks/useCoupangImageSync';
import { useThumbnailPageModel } from './hooks/useThumbnailPageModel';
import { InspectionDrawer } from './components/InspectionDrawer';
import { ThumbnailHeader } from './components/ThumbnailHeader';
import { BatchProgressBanner } from './components/BatchProgressBanner';
import { UnmatchedReconciliationBanner } from './components/UnmatchedReconciliationBanner';
import { GradeDistributionDonut } from './components/GradeDistributionDonut';
import { AiActionCenter } from './components/AiActionCenter';
import { ComplianceCard } from './components/ComplianceCard';
import { AnalyticsCard } from './components/AnalyticsCard';
import { PipelineVisualization, type PipelineTab } from './components/PipelineVisualization';
import { ThumbnailMainTabs, type MainTabKey } from './components/ThumbnailMainTabs';
import { UnclassifiedTab } from './components/UnclassifiedTab';
import { ScanResultsTab } from './components/ScanResultsTab';
import { AiEditTab } from './components/AiEditTab';
import { HistoryTab } from './components/HistoryTab';
import { needsThumbnailFix } from './lib/thumbnail-classification';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';

export default function ThumbnailsPage() {
  // Next 16 build error: useSearchParams() must live inside a Suspense boundary
  // so the static prerender pass can defer to client. Inner component owns the
  // page logic; this wrapper exists solely for the Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <ThumbnailsPageContent />
    </Suspense>
  );
}

function ThumbnailsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkGenerationId = searchParams.get('generationId');
  const analysisQuery = useAnalysisList();
  const generationQuery = useGenerationList();
  const trackingQuery = useTrackingList();

  const [activeTab, setActiveTab] = useState<MainTabKey>('all');
  const [unclassifiedSubTab, setUnclassifiedSubTab] = useState<'with-image' | 'no-image' | 'new'>('with-image');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<ThumbnailAnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  const [editFilter, setEditFilter] = useState<'pending' | 'generating' | 'ready' | 'applied' | 'failed'>('ready');
  const [selectedNeedsFixIds, setSelectedNeedsFixIds] = useState<Set<string>>(new Set());
  const [historySubTab, setHistorySubTab] = useState<'history' | 'tracking'>('history');

  const [gradeFilter, setGradeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [unclassifiedPage, setUnclassifiedPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const handledDeepLinkRef = useRef<string | null>(null);

  // AI Action Center "AI 편집" 클릭 시 확인 다이얼로그.
  // 이전 동작: 클릭 즉시 N건 일괄 mutation 발화 (LLM 비용 + 큐 점유). KPI 타일이 탭 이동처럼
  // 보여 사용자 mental model 과 어긋남. 명시적 confirm 한 단계로 사고 방지.
  const [editBatchConfirmOpen, setEditBatchConfirmOpen] = useState(false);

  const actions = useThumbnailActions(generationQuery.refetch, {
    onAfterEditStarted: setSelectedGen,
    onAfterClose: () => {
      setSelectedGen(null);
      setSelectedProduct(null);
    },
  });

  const batch = useBatchAnalysis();
  const sync = useCoupangImageSync();
  const syncStatus = sync.status;
  const lastSyncRefreshAt = useRef(0);

  // 매칭 센터 CTA 배너 — 이미지 동기화가 끝났을 때 unmatched > 0 이면 표시.
  // sync.reset() 이 status 를 비워도 사용자가 명시적으로 닫기 전까지 유지.
  const [unmatchedBanner, setUnmatchedBanner] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (!sync.startError) return;
    if (sync.isCancelledError) {
      toast.info('이미지 수집을 중단했습니다');
      return;
    }
    toast.error(
      `이미지 동기화 실패: ${
        sync.startError instanceof Error ? sync.startError.message : '알 수 없는 오류'
      }`,
    );
  }, [sync.startError, sync.isCancelledError]);

  useEffect(() => {
    if (!syncStatus || syncStatus.status === 'running') return;
    if (syncStatus.status === 'failed') {
      toast.error(`이미지 동기화 실패: ${syncStatus.error ?? '알 수 없는 오류'}`);
    } else if (syncStatus.total === 0) {
      toast.info('동기화할 이미지가 없습니다 (모든 상품에 이미지가 이미 있음)');
    } else {
      toast.success(
        `이미지 동기화 완료 — 성공 ${syncStatus.succeeded}건${
          syncStatus.unmatched ? ` / 매칭 필요 ${syncStatus.unmatched}건` : ''
        }${syncStatus.failed ? ` / 실패 ${syncStatus.failed}건` : ''}`,
      );
      analysisQuery.refetch();
      if (syncStatus.unmatched > 0) {
        setUnmatchedBanner({ count: syncStatus.unmatched });
      }
    }
    const t = setTimeout(() => sync.reset(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus?.status, syncStatus?.jobId]);

  useEffect(() => {
    if (!syncStatus || syncStatus.status !== 'running') return;
    if (syncStatus.phase !== 'linking' || syncStatus.processed <= 0) return;

    const now = Date.now();
    if (now - lastSyncRefreshAt.current < 5000) return;
    lastSyncRefreshAt.current = now;
    void analysisQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus?.processed, syncStatus?.phase, syncStatus?.status]);

  const runBatch = async (
    items: ThumbnailAnalysisResult[],
    scope?: Parameters<typeof batch.run>[1],
  ) => {
    await batch.run(items, scope, {
      onResults: actions.mergeAiResults,
      onComplete: (results, targets) => {
        // 개별 "AI 분석" 버튼과 동일 — 탭/필터 변경 없이 토스트만.
        // ⚠ 카운트는 `results.length` (실제 backend 가 돌려준 분석 결과) 기준
        // — `targets.length` 를 쓰면 백엔드가 silent skip 한 케이스에 거짓
        // 성공처럼 보임 (이전 버전 버그). hook 단계에서 partial-failure 토스트
        // 가 별도로 나가므로 여기서는 성공 케이스만 다룬다.
        if (results.length === 0) return;
        const needsFix = results.filter(needsThumbnailFix);
        const head = `${results.length}/${targets.length}개 분석 완료`;
        if (needsFix.length > 0) {
          toast.success(`${head} — 개선 필요 ${needsFix.length}개`);
        } else {
          toast.success(`${head} — DB 저장됨`);
        }
      },
    });
  };

  const scanResult = analysisQuery.data;
  const generations: ThumbnailGenerationItem[] = generationQuery.data ?? [];

  useEffect(() => {
    if (!selectedGen) return;
    const latest = generations.find((g) => g.id === selectedGen.id);
    if (!latest) return;
    const changed =
      latest.status !== selectedGen.status ||
      latest.candidates.length !== selectedGen.candidates.length ||
      latest.selectedUrl !== selectedGen.selectedUrl;
    if (changed) setSelectedGen(latest);
  }, [generations, selectedGen]);

  useEffect(() => {
    if (!deepLinkGenerationId) return;
    if (handledDeepLinkRef.current === deepLinkGenerationId) return;

    const generation = generations.find((g) => g.id === deepLinkGenerationId);
    if (!generation) return;

    handledDeepLinkRef.current = deepLinkGenerationId;
    setSelectedProduct(null);
    setSelectedGen(generation);
    if (isApplied(generation)) {
      setActiveTab('history');
      setHistorySubTab('history');
    } else if (generation.status === 'failed' || generation.status === 'cancelled') {
      setActiveTab('ai-edit');
      setEditFilter('failed');
    } else if (generation.status === 'pending' || generation.status === 'running') {
      setActiveTab('ai-edit');
      setEditFilter('generating');
    } else {
      setActiveTab('ai-edit');
      setEditFilter('ready');
    }
  }, [deepLinkGenerationId, generations]);

  const closeDetailModal = () => {
    setSelectedProduct(null);
    setSelectedGen(null);
    if (!deepLinkGenerationId) return;

    const next = new URLSearchParams(searchParams.toString());
    next.delete('generationId');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    handledDeepLinkRef.current = null;
  };

  const pageModel = useThumbnailPageModel({
    scanResult,
    generations,
    activeTab,
    gradeFilter,
    searchQuery,
    page,
    pageSize,
    historyPage,
    selectedProduct,
  });

  if (analysisQuery.isLoading) return <PageSkeleton variant="cards" />;
  if (analysisQuery.isError) {
    return (
      <ErrorState
        message={analysisQuery.error instanceof Error ? analysisQuery.error.message : '스캔 실패'}
        onRetry={() => analysisQuery.refetch()}
      />
    );
  }
  if (!scanResult) return <EmptyState message="스캔 결과 없음" />;
  const {
    generatedProductIds,
    genByProductId,
    historyByProduct,
    unclassifiedCount,
    classifiedResults,
    needsFixProducts,
    pendingProducts,
    validActiveGenerations,
    aiEditCount,
    filtered,
    totalPages,
    paged,
    unclassifiedWithImage,
    unclassifiedNoImage,
    activeGenForProduct,
    totalCount,
    analyzedCount,
    avgScore,
    gradeDistribution,
    healthGrade,
    needsFixCount,
    appliedCount,
    reviewedCount,
    historyTotalPages,
    pagedHistory,
    unclassifiedSample,
    recentClassified,
    needsFixSample,
    inGeneration,
    recentApplied,
    failCount,
    warnCount,
    passCount,
  } = pageModel;

  const toggleNeedsFix = (id: string) =>
    setSelectedNeedsFixIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSelectGrade = (grade: string) => {
    setActiveTab('all');
    setGradeFilter(grade);
    setPage(1);
  };

  const handlePipelineSelect = (tab: PipelineTab, grade?: string) => {
    setActiveTab(tab);
    if (grade) setGradeFilter(grade);
    else if (tab === 'all') setGradeFilter('all');
  };

  const handleMainTabChange: React.ComponentProps<typeof ThumbnailMainTabs>['onChangeTab'] = (
    tab,
    opts,
  ) => {
    setActiveTab(tab);
    if (opts?.setNeedsFixFilter) {
      setGradeFilter('critical');
      setPage(1);
    } else if (opts?.resetFilter) {
      setGradeFilter('all');
    }
  };

  return (
    <div className="thumb-theme space-y-4 animate-in pb-24">
      <ThumbnailHeader
        totalCount={totalCount}
        avgScore={avgScore}
        healthGrade={healthGrade}
        searchQuery={searchQuery}
        onSearch={(q) => {
          setSearchQuery(q);
          setPage(1);
          setUnclassifiedPage(1);
        }}
        onInspect={() => setInspectOpen(true)}
        onRefresh={() => {
          analysisQuery.refetch();
          generationQuery.refetch();
        }}
        onSyncImages={() => sync.start()}
        onCancelSyncImages={sync.cancel}
        syncRunning={sync.isRunning}
        syncCanCancel={!!sync.extensionRunId}
        syncCancelling={sync.extensionStatus?.status === 'cancelled'}
        syncPhase={sync.extensionStatus?.status === 'running' ? 'scraping' : syncStatus?.phase ?? null}
        syncProgress={
          sync.extensionStatus?.status === 'running'
            ? {
                processed: sync.extensionStatus.currentPage ?? 0,
                total: sync.extensionStatus.totalPages ?? 0,
              }
            : syncStatus
              ? { processed: syncStatus.processed, total: syncStatus.total }
              : null
        }
      />

      {batch.isBatchRunning && (
        <BatchProgressBanner
          done={batch.batchDone}
          total={batch.batchTotal}
          elapsed={batch.elapsed}
          onCancel={batch.cancel}
        />
      )}

      {unmatchedBanner && (
        <UnmatchedReconciliationBanner
          unmatchedCount={unmatchedBanner.count}
          onDismiss={() => setUnmatchedBanner(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <GradeDistributionDonut
          analyzedCount={analyzedCount}
          avgScore={avgScore}
          healthGrade={healthGrade}
          gradeDistribution={gradeDistribution}
          onSelectGrade={handleSelectGrade}
        />
        <AiActionCenter
          unclassifiedWithImageCount={unclassifiedWithImage.length}
          needsRegenCount={pendingProducts.length}
          noImageCount={unclassifiedNoImage.length}
          batchAnalyzing={batch.isBatchRunning}
          editJobsPending={actions.editJobsPending}
          onClassify={() => runBatch(unclassifiedWithImage)}
          onEdit={() => {
            // AI 편집 = N건 일괄 LLM 호출. 확인 다이얼로그로 사고 방지.
            if (pendingProducts.length === 0) {
              // 대기 0건이면 그냥 탭 이동만
              setActiveTab('ai-edit');
              setEditFilter('generating');
              return;
            }
            setEditBatchConfirmOpen(true);
          }}
          onShowNoImage={() => {
            setActiveTab('unclassified');
            setUnclassifiedSubTab('no-image');
            setUnclassifiedPage(1);
          }}
        />
        <ComplianceCard
          failCount={failCount}
          warnCount={warnCount}
          passCount={passCount}
          onClick={() => {
            setActiveTab('needsfix');
            setPage(1);
          }}
        />
        <AnalyticsCard
          appliedCount={appliedCount}
          reviewedCount={reviewedCount}
          onClick={() => setActiveTab('history')}
        />
      </div>

      <PipelineVisualization
        unclassifiedCount={unclassifiedCount}
        analyzedCount={analyzedCount}
        needsFixCount={needsFixCount}
        appliedCount={appliedCount}
        validActiveGenerationCount={validActiveGenerations.length}
        unclassifiedSample={unclassifiedSample}
        recentClassified={recentClassified}
        needsFixSample={needsFixSample}
        inGeneration={inGeneration}
        recentApplied={recentApplied}
        activeTab={activeTab as PipelineTab}
        onSelectStep={handlePipelineSelect}
      />

      <ThumbnailMainTabs
        activeTab={activeTab}
        unclassifiedCount={unclassifiedCount}
        analyzedCount={analyzedCount}
        needsFixCount={needsFixCount}
        aiEditCount={aiEditCount}
        historyCount={historyByProduct.length}
        onChangeTab={handleMainTabChange}
      />

      {/* 탭 본문 높이 고정 — 탭 전환 시 페이지 shrink/jump 방지.
          min-h 로 가장 긴 탭(AiEdit, History)의 평균 높이 기준 여유 있게 잡는다. */}
      <div className="min-h-[1100px]">
        {activeTab === 'unclassified' && (
          <UnclassifiedTab
            unclassifiedWithImage={unclassifiedWithImage}
            unclassifiedNoImage={unclassifiedNoImage}
            subTab={unclassifiedSubTab}
            onChangeSubTab={(s) => {
              setUnclassifiedSubTab(s);
              setUnclassifiedPage(1);
            }}
            page={unclassifiedPage}
            pageSize={pageSize}
            onChangePage={setUnclassifiedPage}
            onChangePageSize={(s) => {
              setPageSize(s);
              setUnclassifiedPage(1);
            }}
            batchAnalyzing={batch.isBatchRunning}
            aiResults={actions.aiResults}
            onRunBatch={(items, scope) => runBatch(items, scope)}
            onSelectProduct={(p) => {
              setSelectedProduct(p);
              setSelectedGen(null);
            }}
          />
        )}

        {(activeTab === 'all' || activeTab === 'needsfix') && (
          <ScanResultsTab
            mode={activeTab}
            classifiedResults={classifiedResults}
            needsFixProducts={needsFixProducts}
            needsFixCount={needsFixCount}
            filtered={filtered}
            paged={paged}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            gradeFilter={gradeFilter}
            gradeDistribution={gradeDistribution}
            genByProductId={genByProductId}
            selectedNeedsFixIds={selectedNeedsFixIds}
            onToggleNeedsFix={toggleNeedsFix}
            onSelectAllUnEdited={(ids) => setSelectedNeedsFixIds(new Set(ids ?? []))}
            aiResults={actions.aiResults}
            batchAnalyzing={batch.isBatchRunning}
            onChangePage={setPage}
            onChangePageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            onChangeGradeFilter={(f) => {
              setGradeFilter(f);
              setPage(1);
            }}
            onSelectProduct={(p) => {
              setSelectedProduct(p);
              setSelectedGen(null);
            }}
            onShowAiEditTab={() => setActiveTab('ai-edit')}
            onRunBatchPaged={() => runBatch(paged)}
          />
        )}

        {activeTab === 'ai-edit' && (
          <AiEditTab
            generations={generations}
            pendingProducts={pendingProducts}
            editFilter={editFilter}
            onChangeFilter={setEditFilter}
            editJobsPending={actions.editJobsPending}
            wingRegisteringIds={actions.wingRegisteringIds}
            onSelectGen={setSelectedGen}
            onEditSingle={(productId, variantKey) => {
              actions.editSingle(productId, 'compliance', variantKey);
              // 단일 편집 트리거 후 곧장 생성 중 탭으로 이동 — 폴링으로 진행 추적.
              setEditFilter('generating');
            }}
            onEditBatch={actions.editBatch}
            onSelectCandidate={actions.selectCandidate}
            onOpenCoupangEdit={actions.openCoupangEdit}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            subTab={historySubTab}
            onChangeSubTab={setHistorySubTab}
            historyByProduct={historyByProduct}
            pagedHistory={pagedHistory}
            page={historyPage}
            totalPages={historyTotalPages}
            pageSize={pageSize}
            onChangePage={setHistoryPage}
            onChangePageSize={(s) => {
              setPageSize(s);
              setHistoryPage(1);
            }}
            onSelectGen={(g) => {
              setSelectedGen(g);
              setSelectedProduct(null);
            }}
            trackingLoading={trackingQuery.isLoading}
            trackingItems={trackingQuery.data?.items ?? []}
            trackingTotal={trackingQuery.data?.total ?? 0}
          />
        )}
      </div>

      {(selectedProduct || selectedGen) && (() => {
        // 모달은 selectedProduct (분석 카드 클릭) 또는 selectedGen (편집/이력 카드 클릭)
        // 둘 중 하나로 열린다. AI 분석 결과 / 진행 상태는 productId 기준이므로
        // 어느 경로로 열었든 같은 productId 로 조회해야 모달 안에서 재분석 시
        // 결과가 즉시 반영되고 spinner 도 보인다.
        const modalProductId = selectedProduct?.productId ?? selectedGen?.productId ?? null;
        return (
        <DetailModal
          product={selectedProduct}
          gen={selectedGen || activeGenForProduct}
          hideEdit={activeTab === 'unclassified'}
          productGenerations={generations.filter(
            (g) => g.productId === modalProductId,
          )}
          aiResult={modalProductId ? actions.aiResults[modalProductId] : undefined}
          isAiAnalyzing={modalProductId ? actions.aiAnalyzingId === modalProductId : false}
          imageSpec={selectedProduct?.imageSpec ?? null}
          generatedProductIds={generatedProductIds}
          onClose={closeDetailModal}
          onAiAnalyze={() => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) actions.runAiAnalysis(pid);
          }}
          onEditCompliance={(variantKey) => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) {
              actions.editSingle(pid, 'compliance', variantKey);
              // picker 클릭 시 모달 닫고 AI 편집 탭으로 자동 전환 — 사용자가 진행 상태 즉시 볼 수 있게.
              setSelectedProduct(null);
              setSelectedGen(null);
              setActiveTab('ai-edit');
            }
          }}
          onEditQuality={(variantKey) => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) {
              actions.editSingle(pid, 'quality', variantKey);
              setSelectedProduct(null);
              setSelectedGen(null);
              setActiveTab('ai-edit');
            }
          }}
          onSelectCandidate={(url) => {
            const g = selectedGen || activeGenForProduct;
            if (g) actions.selectCandidate(g.id, url);
          }}
          onApply={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) actions.openCoupangEdit(g);
          }}
          onSkip={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) actions.skipGeneration(g.id);
          }}
          onDelete={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) actions.deleteGeneration(g.id);
          }}
          onSelectGen={(g) => setSelectedGen(g)}
        />
        );
      })()}

      <InspectionDrawer
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        onAnalyzed={(result) => {
          actions.mergeAiResults([result]);
        }}
      />

      <ConfirmDialog
        open={editBatchConfirmOpen}
        onOpenChange={setEditBatchConfirmOpen}
        title={`${pendingProducts.length}개 상품을 AI 로 일괄 편집할까요?`}
        description={
          <>
            대기 중인 상품 전체에 대해 AI 썸네일 생성을 실행합니다. 작업 진행은
            <span className="font-semibold"> AI 편집 탭 → 생성중 </span>
            에서 확인할 수 있어요. (비용 / 큐 점유 발생)
          </>
        }
        confirmText="일괄 편집 시작"
        cancelText="취소"
        onConfirm={() => {
          const pendingIds = pendingProducts.map((p) => p.productId);
          if (pendingIds.length > 0) {
            actions.editBatch(pendingIds);
          }
          setActiveTab('ai-edit');
          setEditFilter('generating');
          setEditBatchConfirmOpen(false);
        }}
      />
    </div>
  );
}
