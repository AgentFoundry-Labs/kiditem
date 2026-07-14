'use client';

import { Suspense, useState, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ErrorState, EmptyState } from '@/components/ui/EmptyState';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useGenerationList } from '../_shared/hooks/useThumbnailGenerations';
import { useAnalysisList } from './hooks/useThumbnailAnalysis';
import { useTrackingList } from './hooks/useThumbnailTracking';
import { useBatchAnalysis } from './hooks/useBatchAnalysis';
import { useThumbnailActions } from './hooks/useThumbnailActions';
import { useThumbnailDeepLinkSelection } from './hooks/useThumbnailDeepLinkSelection';
import { useThumbnailPageModel } from './hooks/useThumbnailPageModel';
import { InspectionDrawer } from './components/InspectionDrawer';
import { ThumbnailHeader } from './components/ThumbnailHeader';
import { BatchProgressBanner } from './components/BatchProgressBanner';
import { PipelineVisualization, type PipelineTab } from './components/PipelineVisualization';
import { ThumbnailMainTabs, type MainTabKey } from './components/ThumbnailMainTabs';
import { ThumbnailDetailModalHost } from './components/workspace/ThumbnailDetailModalHost';
import { ThumbnailInsightsGrid } from './components/workspace/ThumbnailInsightsGrid';
import { ThumbnailTabWorkspace } from './components/workspace/ThumbnailTabWorkspace';
import { needsThumbnailFix } from '../_shared/lib/thumbnail-classification';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';

type EditFilter = 'pending' | 'generating' | 'ready' | 'applied' | 'failed';

function parseMainTabParam(value: string | null): MainTabKey | null {
  if (
    value === 'unclassified' ||
    value === 'all' ||
    value === 'needsfix' ||
    value === 'ai-edit' ||
    value === 'history'
  ) {
    return value;
  }
  return null;
}

function parseEditFilterParam(value: string | null): EditFilter | null {
  if (
    value === 'pending' ||
    value === 'generating' ||
    value === 'ready' ||
    value === 'applied' ||
    value === 'failed'
  ) {
    return value;
  }
  return null;
}

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
  const searchParams = useSearchParams();
  const analysisQuery = useAnalysisList();
  const generationQuery = useGenerationList();
  const trackingQuery = useTrackingList();

  const [activeTab, setActiveTab] = useState<MainTabKey>(
    () => parseMainTabParam(searchParams.get('tab')) ?? 'all',
  );
  const [unclassifiedSubTab, setUnclassifiedSubTab] = useState<'with-image' | 'no-image' | 'new'>('with-image');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<ThumbnailAnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  const [editFilter, setEditFilter] = useState<EditFilter>(
    () => parseEditFilterParam(searchParams.get('editFilter')) ?? 'ready',
  );
  const [selectedNeedsFixIds, setSelectedNeedsFixIds] = useState<Set<string>>(new Set());
  const [historySubTab, setHistorySubTab] = useState<'history' | 'tracking'>('history');

  const [gradeFilter, setGradeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [unclassifiedPage, setUnclassifiedPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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
  const { closeDetailModal } = useThumbnailDeepLinkSelection({
    generations,
    selectedGen,
    setSelectedProduct,
    setSelectedGen,
    setActiveTab,
    setHistorySubTab,
    setEditFilter,
  });

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

  const handleMainTabChange: ComponentProps<typeof ThumbnailMainTabs>['onChangeTab'] = (
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
      />

      {batch.isBatchRunning && (
        <BatchProgressBanner
          done={batch.batchDone}
          total={batch.batchTotal}
          elapsed={batch.elapsed}
          onCancel={batch.cancel}
        />
      )}

      <ThumbnailInsightsGrid
        analyzedCount={analyzedCount}
        avgScore={avgScore}
        healthGrade={healthGrade}
        gradeDistribution={gradeDistribution}
        unclassifiedWithImageCount={unclassifiedWithImage.length}
        needsRegenCount={pendingProducts.length}
        noImageCount={unclassifiedNoImage.length}
        batchAnalyzing={batch.isBatchRunning}
        editJobsPending={actions.editJobsPending}
        failCount={failCount}
        warnCount={warnCount}
        passCount={passCount}
        appliedCount={appliedCount}
        reviewedCount={reviewedCount}
        onSelectGrade={handleSelectGrade}
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
        onShowCompliance={() => {
          setActiveTab('needsfix');
          setPage(1);
        }}
        onShowHistory={() => setActiveTab('history')}
      />

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

      <ThumbnailTabWorkspace
        activeTab={activeTab}
        tabs={{
          activeTab,
          unclassifiedCount,
          analyzedCount,
          needsFixCount,
          aiEditCount,
          historyCount: historyByProduct.length,
          onChangeTab: handleMainTabChange,
        }}
        unclassified={{
          unclassifiedWithImage,
          unclassifiedNoImage,
          subTab: unclassifiedSubTab,
          onChangeSubTab: (s) => {
            setUnclassifiedSubTab(s);
            setUnclassifiedPage(1);
          },
          page: unclassifiedPage,
          pageSize,
          onChangePage: setUnclassifiedPage,
          onChangePageSize: (s) => {
            setPageSize(s);
            setUnclassifiedPage(1);
          },
          batchAnalyzing: batch.isBatchRunning,
          aiResults: actions.aiResults,
          onRunBatch: (items, scope) => runBatch(items, scope),
          onSelectProduct: (p) => {
            setSelectedProduct(p);
            setSelectedGen(null);
          },
        }}
        scanResults={{
          classifiedResults,
          needsFixProducts,
          needsFixCount,
          filtered,
          paged,
          page,
          totalPages,
          pageSize,
          gradeFilter,
          gradeDistribution,
          genByProductId,
          selectedNeedsFixIds,
          onToggleNeedsFix: toggleNeedsFix,
          onSelectAllUnEdited: (ids) => setSelectedNeedsFixIds(new Set(ids ?? [])),
          aiResults: actions.aiResults,
          batchAnalyzing: batch.isBatchRunning,
          onChangePage: setPage,
          onChangePageSize: (s) => {
            setPageSize(s);
            setPage(1);
          },
          onChangeGradeFilter: (f) => {
            setGradeFilter(f);
            setPage(1);
          },
          onSelectProduct: (p) => {
            setSelectedProduct(p);
            setSelectedGen(null);
          },
          onShowAiEditTab: () => setActiveTab('ai-edit'),
          onRunBatchPaged: () => runBatch(paged),
        }}
        aiEdit={{
          generations,
          pendingProducts,
          editFilter,
          onChangeFilter: setEditFilter,
          editJobsPending: actions.editJobsPending,
          wingRegisteringIds: actions.wingRegisteringIds,
          onSelectGen: setSelectedGen,
          onEditSingle: (productId, variantKey) => {
            actions.editSingle(productId, 'compliance', variantKey);
            // 단일 편집 트리거 후 곧장 생성 중 탭으로 이동 — 폴링으로 진행 추적.
            setEditFilter('generating');
          },
          onEditBatch: actions.editBatch,
          onSelectCandidate: actions.selectCandidate,
          onOpenCoupangEdit: actions.openCoupangEdit,
        }}
        history={{
          subTab: historySubTab,
          onChangeSubTab: setHistorySubTab,
          historyByProduct,
          pagedHistory,
          page: historyPage,
          totalPages: historyTotalPages,
          pageSize,
          onChangePage: setHistoryPage,
          onChangePageSize: (s) => {
            setPageSize(s);
            setHistoryPage(1);
          },
          onSelectGen: (g) => {
            setSelectedGen(g);
            setSelectedProduct(null);
          },
          trackingLoading: trackingQuery.isLoading,
          trackingItems: trackingQuery.data?.items ?? [],
          trackingTotal: trackingQuery.data?.total ?? 0,
        }}
      />

      <ThumbnailDetailModalHost
        activeTab={activeTab}
        selectedProduct={selectedProduct}
        selectedGen={selectedGen}
        activeGenForProduct={activeGenForProduct}
        generations={generations}
        generatedProductIds={generatedProductIds}
        actions={actions}
        onClose={closeDetailModal}
        onSelectProduct={setSelectedProduct}
        onSelectGen={setSelectedGen}
        onChangeTab={setActiveTab}
      />

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
