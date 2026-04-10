'use client';

import { useState, useRef, useCallback } from 'react';
import { Sparkles, RefreshCw, Zap, Loader2, X, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';

import { useAnalysisList, useAnalyzeBatch } from './hooks/useThumbnailAnalysis';
import type { AnalysisScope } from './hooks/useThumbnailAnalysis';
import { useGenerationList, useCreateGeneration, useSelectCandidate, useApplyGeneration, useSkipGeneration, useCreateEditJobs } from './hooks/useThumbnailGenerations';

import { AnalysisKpiCards } from './components/AnalysisKpiCards';
import { RegenerationPipeline } from './components/RegenerationPipeline';
import { GradeDonutChart } from './components/GradeDonutChart';
import { ProductCard } from './components/ProductCard';
import { DetailModal } from './components/DetailModal';
import { UploadAnalyzer } from './components/UploadAnalyzer';
import { GenerationQueue } from './components/GenerationQueue';
import { GenerationHistory } from './components/GenerationHistory';
import { PaginationBar } from './components/PaginationBar';

type TabKey = 'all' | 'unclassified' | 'upload' | 'queue' | 'history';

export default function ThumbnailsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [unclassifiedPage, setUnclassifiedPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showInfoBanner, setShowInfoBanner] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState<ThumbnailAnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);

  const [aiAnalyzing, setAiAnalyzing] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, ThumbnailAnalysisResult>>({});
  const [batchAi, setBatchAi] = useState<{ running: boolean; total: number; done: number; current: string }>({
    running: false, total: 0, done: 0, current: '',
  });
  const batchCancelRef = useRef(false);

  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchEditing, setBatchEditing] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // ─── Data ──────────────────────────────────────────────────────
  const { data: scanResult, isLoading: loading, refetch } = useAnalysisList();
  const { data: generations = [], refetch: refetchGenerations } = useGenerationList();
  const selectCandidateMutation = useSelectCandidate();
  const applyMutation = useApplyGeneration();
  const skipMutation = useSkipGeneration();
  const createGenerationMutation = useCreateGeneration();
  const createEditJobsMutation = useCreateEditJobs();
  const analyzeBatchMutation = useAnalyzeBatch();

  // ─── Derived ───────────────────────────────────────────────────
  const allResults = scanResult?.allResults ?? [];
  const unclassified = scanResult?.unclassified ?? [];
  const gradeDistribution = scanResult?.gradeDistribution ?? {};
  const complianceDistribution = scanResult?.complianceDistribution ?? {};
  const totalCount = scanResult?.total ?? 0;
  const analyzedCount = scanResult?.analyzed ?? 0;
  const unclassifiedCount = scanResult?.unclassifiedCount ?? unclassified.length;

  const classifiedResults = allResults.filter((r) => r.qualityAnalyzed && r.complianceAnalyzed);
  const avgScore = analyzedCount > 0 ? Math.round(classifiedResults.reduce((s, r) => s + r.overallScore, 0) / Math.max(classifiedResults.length, 1)) : 0;
  const healthGrade = avgScore >= 90 ? 'S' : avgScore >= 75 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'F';
  const goodCount = (gradeDistribution['S'] || 0) + (gradeDistribution['A'] || 0);
  const goodRate = analyzedCount > 0 ? Math.round(goodCount / analyzedCount * 100) : 0;
  const criticalCount = classifiedResults.filter((r) => r.issues.some((i) => i.severity === 'critical')).length;
  const classifiedPct = totalCount > 0 ? Math.round(analyzedCount / totalCount * 100) : 0;

  // 재생성 탭: 분류 완료된 상품 중에서만 필터 (미분류는 분석부터 해야 함)
  const complianceFailProducts = classifiedResults.filter((r) => r.complianceGrade === 'FAIL' || r.complianceGrade === 'WARN');
  const qualityLowProducts = classifiedResults.filter((r) => r.grade === 'F' || r.grade === 'C');
  const allQueueProducts = [...new Map([...complianceFailProducts, ...qualityLowProducts].map((p) => [p.productId, p])).values()];
  const generatedProductIds = new Set(generations.map((g) => g.productId));
  const pendingProducts = allQueueProducts.filter((p) => !generatedProductIds.has(p.productId));
  const activeGenerations = generations.filter((g) => ['pending', 'generating', 'ready'].includes(g.status));
  const completedGenerations = generations.filter((g) => ['applied', 'skipped'].includes(g.status));

  const complianceGrades = new Set(['PASS', 'WARN', 'FAIL']);
  const filtered = gradeFilter === 'all'
    ? classifiedResults
    : gradeFilter === 'critical'
      ? classifiedResults.filter((r) => r.issues.some((i) => i.severity === 'critical'))
      : complianceGrades.has(gradeFilter)
        ? classifiedResults.filter((r) => r.complianceGrade === gradeFilter)
        : classifiedResults.filter((r) => r.grade === gradeFilter);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const unclassifiedWithImage = unclassified.filter((r) => r.imageUrl);
  const unclassifiedNoImage = unclassified.length - unclassifiedWithImage.length;
  const unclassifiedPages = Math.ceil(unclassifiedWithImage.length / pageSize);
  const pagedUnclassified = unclassifiedWithImage.slice((unclassifiedPage - 1) * pageSize, unclassifiedPage * pageSize);

  const activeGenForProduct = selectedProduct
    ? generations.find((g) => g.productId === selectedProduct.productId && ['generating', 'ready'].includes(g.status))
    : undefined;

  // ─── Actions ───────────────────────────────────────────────────
  const runAiAnalysis = async (productId: string, scope: AnalysisScope = 'all') => {
    setAiAnalyzing(productId);
    try {
      const data = await apiClient.post<ThumbnailAnalysisResult>('/api/thumbnail-analysis/analyze', { productId, scope });
      setAiResults((prev) => ({ ...prev, [productId]: data }));
      const label = scope === 'quality' ? '품질 분석' : scope === 'compliance' ? '가이드라인 체크' : '전체 분석';
      if (data.method === 'rule') {
        toast.error(`${data.grade}등급 — ${label} 실패, 룰 기반 fallback 적용 (AI 키 확인 필요)`);
      } else {
        toast.success(`${data.grade}등급 (${data.overallScore}점) — ${label} 완료`);
      }
    } catch {
      toast.error('AI 분석 실패');
    } finally {
      setAiAnalyzing(null);
    }
  };

  const runBatchAiAnalysis = useCallback(async (items: ThumbnailAnalysisResult[], scope: AnalysisScope = 'all') => {
    const targets = items.filter((i) => i.imageUrl && !aiResults[i.productId]);
    if (targets.length === 0) {
      toast.error('분석할 상품이 없습니다 (이미지 없거나 이미 분석됨)');
      return;
    }
    const BATCH_SIZE = 10;
    const productIds = targets.map((t) => t.productId);
    batchCancelRef.current = false;
    setBatchAi({ running: true, total: productIds.length, done: 0, current: '' });
    let completed = 0;
    let fallbackCount = 0;

    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      if (batchCancelRef.current) break;
      const chunk = productIds.slice(i, i + BATCH_SIZE);
      setBatchAi((prev) => ({ ...prev, done: completed, current: `${completed + 1}-${Math.min(completed + BATCH_SIZE, productIds.length)}` }));
      try {
        const results = await analyzeBatchMutation.mutateAsync({ productIds: chunk, scope });
        for (const r of results) {
          setAiResults((prev) => ({ ...prev, [r.productId]: r }));
        }
        completed += chunk.length;
        fallbackCount += results.filter((r) => r.method === 'rule').length;
      } catch { /* batch failure skipped */ }
    }

    const wasCancelled = batchCancelRef.current;
    setBatchAi({ running: false, total: productIds.length, done: wasCancelled ? completed : productIds.length, current: '' });
    const label = scope === 'quality' ? '품질 분석' : scope === 'compliance' ? '가이드라인 체크' : '전체 분석';
    const msg = wasCancelled
      ? `${label} 중단됨 (${completed}/${productIds.length}개 완료)`
      : fallbackCount > 0
        ? `${productIds.length}개 중 ${fallbackCount}개 AI 실패 → 룰 기반 fallback 적용`
        : `${productIds.length}개 상품 ${label} 완료 — DB 저장됨`;
    if (wasCancelled || fallbackCount > 0) toast.error(msg); else toast.success(msg);
    refetch();
  }, [aiResults, refetch, analyzeBatchMutation]);

  const generateSingle = async (productId: string) => {
    setGeneratingIds((prev) => new Set(prev).add(productId));
    try {
      const data = await createGenerationMutation.mutateAsync([productId]);
      const genItem = data.find((d) => d.productId === productId);
      if (genItem) setSelectedGen(genItem);
    } catch { /* ignore */ } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(productId); return next; });
    }
  };

  const generateBatch = async () => {
    const ids = pendingProducts.filter((p) => p.complianceGrade === 'FAIL' || p.grade === 'F').map((p) => p.productId);
    if (!ids.length) return;
    setBatchGenerating(true);
    try {
      await createGenerationMutation.mutateAsync(ids);
    } catch { /* ignore */ } finally {
      setBatchGenerating(false);
    }
  };

  const editSingle = async (productId: string, purpose: 'compliance' | 'quality' = 'compliance') => {
    setEditingProductId(productId);
    try {
      await createEditJobsMutation.mutateAsync({ productIds: [productId], purpose });
      toast.success(purpose === 'quality' ? '품질 개선 시작됨' : '가이드라인 수정 시작됨');
    } catch {
      toast.error(purpose === 'quality' ? '품질 개선 실패' : '가이드라인 수정 실패');
    } finally {
      setEditingProductId(null);
    }
  };

  const editBatch = async (purpose: 'compliance' | 'quality' = 'compliance') => {
    const ids = purpose === 'quality'
      ? pendingProducts.filter((p) => p.grade === 'F' || p.grade === 'C').map((p) => p.productId)
      : pendingProducts.filter((p) => p.complianceGrade === 'FAIL' || p.complianceGrade === 'WARN').map((p) => p.productId);
    if (!ids.length) return;
    setBatchEditing(true);
    try {
      await createEditJobsMutation.mutateAsync({ productIds: ids, purpose });
      toast.success(`${ids.length}개 상품 ${purpose === 'quality' ? '품질 개선' : '가이드라인 수정'} 시작됨`);
    } catch {
      toast.error(`일괄 ${purpose === 'quality' ? '품질 개선' : '가이드라인 수정'} 실패`);
    } finally {
      setBatchEditing(false);
    }
  };

  const openCoupangEdit = (gen: ThumbnailGenerationItem) => {
    const pid = gen.product.coupangProductId;
    if (pid) window.open(`https://wing.coupang.com/vendor-inventory/manage/product/${pid}`, '_blank');
    applyMutation.mutate(gen.id);
    setSelectedGen(null);
    setSelectedProduct(null);
  };

  // ─── Render ────────────────────────────────────────────────────
  if (loading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">썸네일 AI</h1>
            <p className="text-[13px] text-slate-400">{totalCount}개 상품 · Gemini Vision 분석 · Imagen 재생성</p>
          </div>
        </div>
        <button
          onClick={() => { refetch(); refetchGenerations(); }}
          className="p-2.5 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
          title="새로고침"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Info banner */}
      {showInfoBanner && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
          <Info size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
          <div className="flex-1 text-sm text-blue-700">스캔 결과는 룰 기반 사전 분류입니다. Gemini AI 분석을 추가로 실행하면 더 정확한 등급을 얻을 수 있습니다.</div>
          <button onClick={() => setShowInfoBanner(false)} className="flex-shrink-0 p-0.5 rounded hover:bg-blue-100">
            <X size={14} className="text-blue-400" />
          </button>
        </div>
      )}

      {/* Batch AI progress banner */}
      {batchAi.running && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
          <Loader2 size={16} className="flex-shrink-0 mt-0.5 animate-spin text-purple-600" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-purple-600">Gemini Vision AI 분류 중... ({batchAi.done}/{batchAi.total})</div>
            <div className="text-xs mt-1 text-slate-600">
              {batchAi.current && <span>{batchAi.current}... </span>}
              모든 상품을 Gemini Vision으로 분석하고 있습니다.
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-2 bg-purple-100">
              <div className="h-full rounded-full transition-all duration-300 bg-purple-600" style={{ width: `${batchAi.total > 0 ? (batchAi.done / batchAi.total) * 100 : 0}%` }} />
            </div>
          </div>
          <button
            onClick={() => { batchCancelRef.current = true; }}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 bg-purple-100 text-purple-600"
          >
            <X size={12} /> 중단
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <AnalysisKpiCards
        classifiedPct={classifiedPct}
        analyzedCount={analyzedCount}
        unclassifiedCount={unclassifiedCount}
        goodRate={goodRate}
        goodCount={goodCount}
        criticalCount={criticalCount}
        onTabChange={(tab) => setActiveTab(tab as TabKey)}
        onFilterChange={setGradeFilter}
      />

      {/* Pipeline + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <RegenerationPipeline
          pendingProducts={pendingProducts}
          activeGenerations={activeGenerations}
          completedGenerations={completedGenerations}
        />
        <GradeDonutChart
          gradeDistribution={gradeDistribution}
          totalCount={totalCount}
          avgScore={avgScore}
          healthGrade={healthGrade}
          complianceDistribution={complianceDistribution}
          onGradeClick={(g) => { setActiveTab('all'); setGradeFilter(g); setPage(1); }}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {([
          { key: 'all' as TabKey, label: `분류 완료 (${analyzedCount})` },
          { key: 'unclassified' as TabKey, label: `미분류 (${unclassifiedCount})`, dot: unclassifiedCount > 0 },
          { key: 'upload' as TabKey, label: '새 이미지 분류' },
          { key: 'queue' as TabKey, label: `재생성 (${pendingProducts.length + activeGenerations.length})` },
          { key: 'history' as TabKey, label: `이력 (${completedGenerations.length})` },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key !== 'all') setGradeFilter('all'); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border transition-all relative',
              activeTab === tab.key
                ? 'text-white border-purple-600 bg-purple-600'
                : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-500'
            )}
          >
            {tab.label}
            {tab.dot && activeTab !== tab.key && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Tab: 미분류 */}
      {activeTab === 'unclassified' && (
        <div className="space-y-3">
          {unclassifiedWithImage.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50/60 border border-purple-200">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-purple-600" />
                <span className="text-sm font-semibold text-purple-600">
                  이미지 있는 미분류 {unclassifiedWithImage.length}개 — AI 분석 필요
                </span>
                {unclassifiedNoImage > 0 && (
                  <span className="text-xs text-slate-400">
                    (이미지 없음 {unclassifiedNoImage}개)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified, 'all')}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-purple-600"
                >
                  {batchAi.running ? (
                    <><Loader2 size={14} className="animate-spin" /> {batchAi.done}/{batchAi.total}</>
                  ) : (
                    <><Zap size={14} /> 전체 분석</>
                  )}
                </button>
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified, 'quality')}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-blue-600"
                >
                  <Zap size={14} /> 품질만
                </button>
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified, 'compliance')}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-amber-600"
                >
                  <Zap size={14} /> 가이드라인만
                </button>
              </div>
            </div>
          )}

          {batchAi.running && (
            <div className="rounded-xl p-3 bg-purple-50 border border-purple-200">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-purple-600" />
                  <span className="text-xs font-semibold text-purple-600">Gemini Vision 분류 중</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tabular-nums text-purple-600">{batchAi.done} / {batchAi.total}</span>
                  <button
                    onClick={() => { batchCancelRef.current = true; }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors hover:opacity-80 bg-purple-100 text-purple-600"
                  >
                    <X size={10} /> 중단
                  </button>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-purple-100">
                <div className="h-full rounded-full transition-all duration-300 bg-purple-600" style={{ width: `${batchAi.total > 0 ? (batchAi.done / batchAi.total) * 100 : 0}%` }} />
              </div>
              {batchAi.current && <div className="text-[10px] mt-1 truncate text-slate-400">{batchAi.current}...</div>}
            </div>
          )}

          <PaginationBar
            current={unclassifiedPage}
            total={unclassifiedPages}
            count={unclassifiedWithImage.length}
            pageSize={pageSize}
            onChange={setUnclassifiedPage}
            onPageSizeChange={(s) => { setPageSize(s); setUnclassifiedPage(1); }}
          />

          {unclassifiedWithImage.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">모든 상품이 분류 완료되었습니다</div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {pagedUnclassified.map((item) => {
                const aiDone = !!aiResults[item.productId];
                const display = aiResults[item.productId] || item;
                return (
                  <ProductCard
                    key={item.productId}
                    imageUrl={item.imageUrl}
                    name={item.productName}
                    grade={aiDone ? display.grade : undefined}
                    score={aiDone ? display.overallScore : undefined}
                    aiAnalyzed={aiDone}
                    overlay={!aiDone && !item.imageUrl ? 'skipped' : undefined}
                    onClick={() => { setSelectedProduct(item); setSelectedGen(null); }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: 새 이미지 분류 */}
      {activeTab === 'upload' && (
        <UploadAnalyzer
          onAnalyzed={(result) => {
            setAiResults((prev) => ({ ...prev, [result.productId]: result }));
          }}
        />
      )}

      {/* Tab: 재생성 */}
      {activeTab === 'queue' && (
        <GenerationQueue
          pendingProducts={pendingProducts}
          activeGenerations={activeGenerations}
          generatingIds={generatingIds}
          batchGenerating={batchGenerating}
          batchEditing={batchEditing}
          page={queuePage}
          pageSize={pageSize}
          onGenerateSingle={generateSingle}
          onGenerateBatch={generateBatch}
          onEditBatch={editBatch}
          onSelectGen={(gen) => { setSelectedGen(gen); setSelectedProduct(null); }}
          onSelectProduct={(product) => { setSelectedProduct(product); setSelectedGen(null); }}
          onPageChange={setQueuePage}
          onPageSizeChange={(s) => { setPageSize(s); setQueuePage(1); }}
        />
      )}

      {/* Tab: 분류 완료 */}
      {activeTab === 'all' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all', label: `전체 (${classifiedResults.length})` },
              { key: 'critical', label: `긴급 (${criticalCount})`, color: 'text-red-600' },
              ...['S', 'A', 'B', 'C', 'F'].map((g) => ({ key: g, label: `${g} (${gradeDistribution[g] || 0})` })),
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setGradeFilter(tab.key); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all',
                  gradeFilter === tab.key
                    ? 'text-white border-purple-600 bg-purple-600'
                    : cn('bg-white hover:bg-slate-50 border-slate-100 text-slate-500', 'color' in tab ? tab.color : '')
                )}
              >
                {tab.label}
              </button>
            ))}
            <div className="w-px bg-slate-200 self-stretch" />
            {([
              { key: 'PASS', label: `적합 (${complianceDistribution['PASS'] || 0})`, color: 'text-emerald-600' },
              { key: 'WARN', label: `주의 (${complianceDistribution['WARN'] || 0})`, color: 'text-amber-600' },
              { key: 'FAIL', label: `위반 (${complianceDistribution['FAIL'] || 0})`, color: 'text-red-600' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setGradeFilter(tab.key); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all',
                  gradeFilter === tab.key
                    ? 'text-white border-purple-600 bg-purple-600'
                    : cn('bg-white hover:bg-slate-50 border-slate-100', tab.color),
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runBatchAiAnalysis(paged, 'all')}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-purple-600 hover:bg-purple-700"
                >
                  {batchAi.running ? (
                    <><Loader2 size={12} className="animate-spin" /> {batchAi.done}/{batchAi.total}</>
                  ) : (
                    <><Zap size={12} /> 전체 재분석</>
                  )}
                </button>
                {Object.keys(aiResults).length > 0 && (
                  <span className="text-[11px] font-mono text-slate-400">AI 분석 완료: {Object.keys(aiResults).length}개</span>
                )}
              </div>
              <PaginationBar
                current={page}
                total={totalPages}
                count={filtered.length}
                pageSize={pageSize}
                onChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            </div>
          )}

          {batchAi.running && (
            <div className="rounded-xl p-3 bg-purple-50 border border-purple-200">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-purple-600" />
                  <span className="text-xs font-semibold text-purple-600">Gemini Vision 분석 중</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tabular-nums text-purple-600">{batchAi.done} / {batchAi.total}</span>
                  <button
                    onClick={() => { batchCancelRef.current = true; }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors hover:opacity-80 bg-purple-100 text-purple-600"
                  >
                    <X size={10} /> 중단
                  </button>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-purple-100">
                <div className="h-full rounded-full transition-all duration-300 bg-purple-600" style={{ width: `${batchAi.total > 0 ? (batchAi.done / batchAi.total) * 100 : 0}%` }} />
              </div>
              {batchAi.current && <div className="text-[10px] mt-1 truncate text-slate-400">{batchAi.current}...</div>}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">해당 조건의 상품이 없습니다</div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {paged.map((item) => {
                const display = aiResults[item.productId] || item;
                const isAiDone = !!aiResults[item.productId];
                return (
                  <ProductCard
                    key={item.productId}
                    imageUrl={item.imageUrl}
                    name={item.productName}
                    grade={display.grade}
                    score={display.overallScore}
                    issueCount={display.issues.filter((i) => i.severity === 'critical').length}
                    aiAnalyzed={isAiDone}
                    complianceGrade={display.complianceGrade ?? undefined}
                    onClick={() => { setSelectedProduct(item); setSelectedGen(null); }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: 이력 */}
      {activeTab === 'history' && (
        <GenerationHistory
          completedGenerations={completedGenerations}
          page={historyPage}
          pageSize={pageSize}
          onSelectGen={(gen) => { setSelectedGen(gen); setSelectedProduct(null); }}
          onPageChange={setHistoryPage}
          onPageSizeChange={(s) => { setPageSize(s); setHistoryPage(1); }}
        />
      )}

      {/* Detail Modal */}
      {(selectedProduct || selectedGen) && (
        <DetailModal
          product={selectedProduct}
          gen={selectedGen || activeGenForProduct}
          aiResult={selectedProduct ? aiResults[selectedProduct.productId] : undefined}
          isAiAnalyzing={selectedProduct ? aiAnalyzing === selectedProduct.productId : false}
          isGenerating={selectedProduct ? generatingIds.has(selectedProduct.productId) : false}
          isEditing={selectedProduct ? editingProductId === selectedProduct.productId : false}
          generatedProductIds={generatedProductIds}
          onClose={() => { setSelectedProduct(null); setSelectedGen(null); }}
          onAiAnalyze={() => selectedProduct && runAiAnalysis(selectedProduct.productId)}
          onGenerate={() => selectedProduct && generateSingle(selectedProduct.productId)}
          onEdit={() => selectedProduct && editSingle(selectedProduct.productId)}
          onSelectCandidate={(url) => {
            const g = selectedGen || activeGenForProduct;
            if (g) selectCandidateMutation.mutate({ id: g.id, selectedUrl: url });
          }}
          onApply={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) openCoupangEdit(g);
          }}
          onSkip={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) {
              skipMutation.mutate(g.id);
              setSelectedGen(null);
              setSelectedProduct(null);
            }
          }}
        />
      )}
    </div>
  );
}
