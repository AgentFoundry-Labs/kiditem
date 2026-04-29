'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { ErrorState, EmptyState } from '@/components/ui/EmptyState';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isApplied, isReady } from '@/lib/thumbnail-status';
import { pickDisplayableImageUrl } from '@/lib/resolve-url';

import { useAnalysisList } from './hooks/useThumbnailAnalysis';
import { useGenerationList } from './hooks/useThumbnailGenerations';
import { useTrackingList } from './hooks/useThumbnailTracking';
import { useBatchAnalysis } from './hooks/useBatchAnalysis';
import { useThumbnailActions } from './hooks/useThumbnailActions';

import { DetailModal } from './components/DetailModal';
import { InspectionDrawer } from './components/InspectionDrawer';
import { ThumbnailHeader } from './components/ThumbnailHeader';
import { BatchProgressBanner } from './components/BatchProgressBanner';
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
import { getEffectiveComplianceGrade, needsThumbnailFix } from './lib/thumbnail-classification';

export default function ThumbnailsPage() {
  const analysisQuery = useAnalysisList();
  const generationQuery = useGenerationList();
  const trackingQuery = useTrackingList();

  const [activeTab, setActiveTab] = useState<MainTabKey>('all');
  const [unclassifiedSubTab, setUnclassifiedSubTab] = useState<'with-image' | 'no-image' | 'new'>('with-image');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<ThumbnailAnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  const [editFilter, setEditFilter] = useState<'pending' | 'generating' | 'ready' | 'applied'>('ready');
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
        const needsFix = results.filter(needsThumbnailFix);
        if (needsFix.length > 0) {
          toast.success(`${targets.length}개 재분석 완료 — 개선 필요 ${needsFix.length}개`);
        } else {
          toast.success(`${targets.length}개 재분석 완료 — DB 저장됨`);
        }
      },
    });
  };

  const scanResult = analysisQuery.data;
  const generations: ThumbnailGenerationItem[] = generationQuery.data ?? [];

  const generatedProductIds = useMemo(
    () => new Set(generations.filter((g) => g.status !== 'failed').map((g) => g.productId)),
    [generations],
  );
  const activeGenerations = useMemo(
    () => generations.filter((g) => g.status === 'pending' || g.status === 'running' || isReady(g)),
    [generations],
  );

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

  const genByProductId = useMemo(() => {
    const map = new Map<string, ThumbnailGenerationItem>();
    for (const g of generations) {
      const existing = map.get(g.productId);
      if (!existing || new Date(g.createdAt) > new Date(existing.createdAt)) {
        map.set(g.productId, g);
      }
    }
    return map;
  }, [generations]);

  // 이력 탭은 실제 적용 완료된 것만 리스트 (status='succeeded' + phase='applied').
  // 표시 가능한 http 이미지 URL 이 하나도 없는 generation 은 제외 (data:URL 또는 null 뿐) —
  // ProductCard 가 http prefix 만 렌더하므로 어차피 placeholder 로 떨어짐.
  // 이런 건들은 master 쪽 `classifiedNoImage` 경로로 미분류 "이미지 필요" 서브탭에 자동 격리.
  const historyByProduct = useMemo(
    () =>
      Array.from(genByProductId.values()).filter((g) => {
        if (!isApplied(g)) return false;
        return !!pickDisplayableImageUrl(g.selectedUrl, g.originalUrl, g.product?.imageUrl);
      }),
    [genByProductId],
  );

  const sq = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!scanResult) return [];
    const allResults = scanResult.allResults ?? [];
    // 이미지 없는 분석 건은 "분류 완료" 뷰에서 제외 — 미분류 탭의 "이미지 필요" 서브탭으로 라우팅됨.
    const classified = allResults.filter((r) => r.analyzed && !!r.imageUrl);
    const needsFix = classified.filter(needsThumbnailFix);
    // "전체" 탭은 위반/품질미달 제외 — 위반 카드가 grade=A 분류 안에 섞여 보이지 않도록.
    // "개선 필요" 탭이 needsFix 전담. 두 탭 disjoint 합 = classified.
    const cleanResults = classified.filter((r) => !needsThumbnailFix(r));

    const hasEditStatus = (items: ThumbnailAnalysisResult[], statuses: string[]) =>
      items.filter((r) => {
        const g = genByProductId.get(r.productId);
        return g && statuses.includes(g.status);
      });

    // 'all' 탭의 '위반' 필터는 예외 — base 를 needsFix 로 스위칭해서 위반 카드를 노출.
    // 평소엔 cleanResults 만 보이지만 사용자가 명시적으로 "위반" 클릭하면 위반만 모아 보여준다.
    const isAllTabFailFilter = activeTab === 'all' && gradeFilter === 'FAIL';
    const base =
      activeTab === 'needsfix' || isAllTabFailFilter ? needsFix : cleanResults;

    let result: ThumbnailAnalysisResult[];
    if (gradeFilter === 'all') result = base;
    else if (gradeFilter === 'edit-pending') result = hasEditStatus(base, ['pending', 'running']);
    else if (gradeFilter === 'edit-ready')
      result = base.filter((item) => {
        const g = genByProductId.get(item.productId);
        return g && isReady(g);
      });
    else if (gradeFilter === 'edit-failed') result = hasEditStatus(base, ['failed']);
    else if (gradeFilter === 'FAIL')
      // base 가 이미 needsFix (위반+품질미달). 그 안에서 위반 evidence 있는 것만.
      result = base.filter((r) => getEffectiveComplianceGrade(r) === 'FAIL');
    else if (['WARN', 'PASS'].includes(gradeFilter))
      result = base.filter((r) => getEffectiveComplianceGrade(r) === gradeFilter);
    else if (['S', 'A', 'B', 'C', 'F'].includes(gradeFilter))
      result = base.filter((r) => r.grade === gradeFilter);
    else result = base;

    // 개선 필요 탭의 기본 뷰에서는 "이미 편집 파이프라인에 올라간" 상품 전부 제외.
    // 이들은 AI 편집 탭에서 독립적으로 추적되므로 중복 노출 금지. (pending/running/ready/applied/failed 전부)
    // `edit-*` 명시적 sub-filter 선택 시에는 AI 편집 파이프라인을 직접 보려는 의도이므로 예외.
    const isBasicNeedsFixView =
      activeTab === 'needsfix' && !gradeFilter.startsWith('edit-');
    if (isBasicNeedsFixView) {
      result = result.filter((r) => !genByProductId.has(r.productId));
    }

    return result
      .filter((r) => !sq || r.productName.toLowerCase().includes(sq))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [scanResult, activeTab, gradeFilter, genByProductId, sq]);

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

  const { allResults, unclassified = [] } = scanResult;
  // 분류 완료이지만 이미지가 없는 상품은 미분류로 되돌린다
  const classifiedNoImage = allResults.filter((r) => r.analyzed && !r.imageUrl);
  const unclassifiedCount = unclassified.filter((u) => u.imageUrl).length;
  const classifiedResults = allResults.filter((r) => r.analyzed && r.imageUrl);

  const needsFixProducts = classifiedResults.filter(needsThumbnailFix);
  // "대기 중" = 아직 편집 파이프라인에 안 올라간 상품. failed 는 'editFilter=failed' 트랙으로
  // 별도 추적되니까 여기서 제외 — needsFixCount(파이프라인 노드)와 동일 기준으로 정합.
  const pendingProducts = needsFixProducts.filter((p) => !genByProductId.has(p.productId));

  const needsFixIds = new Set(needsFixProducts.map((p) => p.productId));
  const validActiveGenerations = activeGenerations.filter((g) => needsFixIds.has(g.productId));

  const searchFilter = (r: ThumbnailAnalysisResult) =>
    !sq || r.productName.toLowerCase().includes(sq);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const unclassifiedWithImage = unclassified.filter((r) => r.imageUrl).filter(searchFilter);
  const unclassifiedNoImage = [
    ...unclassified.filter((r) => !r.imageUrl),
    ...classifiedNoImage,
  ].filter(searchFilter);

  const activeGenForProduct = selectedProduct
    ? generations.find(
        (g) => g.productId === selectedProduct.productId && (g.status === 'running' || isReady(g)),
      ) ?? null
    : null;

  const totalCount = scanResult.total;
  const analyzedCount = classifiedResults.length;
  const avgScore =
    analyzedCount > 0
      ? Math.round(classifiedResults.reduce((s, r) => s + r.overallScore, 0) / analyzedCount)
      : 0;
  const gradeDistribution = classifiedResults.reduce<Record<string, number>>(
    (acc, r) => {
      if (r.grade) acc[r.grade] = (acc[r.grade] ?? 0) + 1;
      return acc;
    },
    { S: 0, A: 0, B: 0, C: 0, F: 0 },
  );
  const healthGrade =
    avgScore >= 90 ? 'S' : avgScore >= 75 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'F';

  // 개선 필요 카운트: 편집 파이프라인에 있는 모든 상품 제외 (failed 포함).
  const needsFixCount = needsFixProducts.filter((p) => !genByProductId.has(p.productId)).length;
  // 적용완료 카운트도 이미지 orphan 제외 — historyByProduct 와 동일 기준.
  const appliedCount = historyByProduct.length;
  const reviewedCount = appliedCount;

  const historyTotalPages = Math.ceil(historyByProduct.length / pageSize);
  const pagedHistory = historyByProduct.slice(
    (historyPage - 1) * pageSize,
    historyPage * pageSize,
  );

  const unclassifiedSample = unclassified.slice(0, 7);
  const recentClassified = classifiedResults.slice(0, 7);
  const needsFixSample = classifiedResults
    .filter(
      (r) =>
        !genByProductId.has(r.productId) &&
        needsThumbnailFix(r),
    )
    .slice(0, 7);
  const inGeneration = validActiveGenerations.slice(0, 7);
  // 적용완료 파이프라인 컬럼도 이력 탭과 동일 기준 — 표시 가능한 http 이미지가 있어야 등장.
  const recentApplied = generations
    .filter(
      (g) =>
        isApplied(g) &&
        !!pickDisplayableImageUrl(g.selectedUrl, g.originalUrl, g.product?.imageUrl),
    )
    .slice(0, 7);

  const failCount = classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'FAIL').length;
  const warnCount = classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'WARN').length;
  const passCount = classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'PASS').length;

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
      />

      {batch.isBatchRunning && (
        <BatchProgressBanner
          done={batch.batchDone}
          total={batch.batchTotal}
          elapsed={batch.elapsed}
          onCancel={batch.cancel}
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
        validActiveGenerationsCount={validActiveGenerations.length}
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

      {(selectedProduct || selectedGen) && (
        <DetailModal
          product={selectedProduct}
          gen={selectedGen || activeGenForProduct}
          hideEdit={activeTab === 'unclassified'}
          productGenerations={generations.filter(
            (g) => g.productId === (selectedProduct?.productId ?? selectedGen?.productId),
          )}
          aiResult={selectedProduct ? actions.aiResults[selectedProduct.productId] : undefined}
          isAiAnalyzing={selectedProduct ? actions.aiAnalyzingId === selectedProduct.productId : false}
          imageSpec={selectedProduct?.imageSpec ?? null}
          generatedProductIds={generatedProductIds}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedGen(null);
          }}
          onAiAnalyze={() => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) actions.runAiAnalysis(pid);
          }}
          onEditCompliance={(variantKey) => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) actions.editSingle(pid, 'compliance', variantKey);
          }}
          onEditQuality={(variantKey) => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) actions.editSingle(pid, 'quality', variantKey);
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
      )}

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
