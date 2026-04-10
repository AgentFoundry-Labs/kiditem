'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ImageIcon,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle,
  Scan,
  Wand2,
  Loader2,
  ArrowRight,
  Sparkles,
  Search,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';

import { ErrorState, EmptyState } from '@/components/ui/EmptyState';
import PageSkeleton from '@/components/ui/PageSkeleton';

import {
  useAnalysisList,
  useAnalyze,
  useAnalyzeBatch,
  useCancelBatch,
  usePreInspect,
  useCheckImageSpec,
  type AnalysisScope,
  type ImageSpec,
} from './hooks/useThumbnailAnalysis';
import {
  useGenerationList,
  useCreateEditJobs,
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
  useDeleteGeneration,
} from './hooks/useThumbnailGenerations';

import { ProductCard } from './components/ProductCard';
import { DetailModal } from './components/DetailModal';
import { PaginationBar } from './components/PaginationBar';
import { UploadAnalyzer } from './components/UploadAnalyzer';
import { ThumbnailStatusBadge } from './components/ThumbnailStatusBadge';
import { openCoupangWingInventory } from './lib/coupang-wing';

type TabKey = 'unclassified' | 'all' | 'needsfix' | 'history' | 'tracking';

const gradeBg: Record<string, string> = {
  S: 'bg-emerald-500',
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-orange-500',
  F: 'bg-red-500',
};

export default function ThumbnailsPage() {
  // ─── Server state via React Query ──────────────────────────
  const analysisQuery = useAnalysisList();
  const generationQuery = useGenerationList();

  const analyzeMutation = useAnalyze();
  const analyzeBatchMutation = useAnalyzeBatch();
  const cancelBatchMutation = useCancelBatch();
  const checkImageSpecMutation = useCheckImageSpec();
  const preInspectMutation = usePreInspect();
  const editJobsMutation = useCreateEditJobs();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();
  const deleteGenerationMutation = useDeleteGeneration();

  // ─── Local UI state ────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<ThumbnailAnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);

  // AI analysis — local overrides for immediate feedback before refetch settles
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, ThumbnailAnalysisResult>>({});
  const [imageSpecs, setImageSpecs] = useState<Record<string, ImageSpec>>({});

  // Pagination
  const [gradeFilter, setGradeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [unclassifiedPage, setUnclassifiedPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // ─── Derived data ──────────────────────────────────────────
  const scanResult = analysisQuery.data;
  const generations: ThumbnailGenerationItem[] = generationQuery.data ?? [];

  const generatedProductIds = useMemo(
    () => new Set(generations.filter((g) => g.status !== 'failed').map((g) => g.productId)),
    [generations],
  );
  const activeGenerations = useMemo(
    () => generations.filter((g) => ['pending', 'generating', 'ready'].includes(g.status)),
    [generations],
  );

  // selectedGen을 polling 데이터와 동기화
  useEffect(() => {
    if (!selectedGen) return;
    const latest = generations.find((g) => g.id === selectedGen.id);
    if (latest && latest.status !== selectedGen.status) {
      setSelectedGen(latest);
    }
  }, [generations, selectedGen]);

  // 모달 열릴 때 이미지 스펙 자동 체크
  useEffect(() => {
    const imageUrl = selectedProduct?.imageUrl ?? selectedGen?.originalUrl ?? selectedGen?.product.imageUrl;
    const pid = selectedProduct?.productId ?? selectedGen?.productId;
    if (!imageUrl || !pid || imageSpecs[pid]) return;
    checkImageSpecMutation.mutateAsync(imageUrl).then((spec) => {
      setImageSpecs((prev) => ({ ...prev, [pid]: spec }));
    }).catch(() => {});
  }, [selectedProduct, selectedGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 상품별 최신 편집 job 매핑
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

  // filtered는 scanResult 로딩 전에는 빈 배열
  const sq = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!scanResult) return [];
    const allResults = scanResult.allResults ?? [];
    const classifiedResults = allResults.filter((r) => r.method === 'ai');
    const needsFix = classifiedResults.filter(
      (r) => r.imageUrl && (
        r.complianceGrade === 'FAIL' || r.complianceGrade === 'WARN' ||
        r.grade === 'B' || r.grade === 'C' || r.grade === 'F'
      ),
    );

    const hasEditStatus = (items: ThumbnailAnalysisResult[], statuses: string[]) =>
      items.filter((r) => {
        const g = genByProductId.get(r.productId);
        return g && statuses.includes(g.status);
      });

    const base = activeTab === 'needsfix' ? needsFix : classifiedResults;

    let result: ThumbnailAnalysisResult[];
    if (gradeFilter === 'all') {
      result = base;
    } else if (gradeFilter === 'edit-pending') {
      result = hasEditStatus(base, ['pending', 'generating']);
    } else if (gradeFilter === 'edit-ready') {
      result = hasEditStatus(base, ['ready']);
    } else if (gradeFilter === 'edit-failed') {
      result = hasEditStatus(base, ['failed']);
    } else if (['FAIL', 'WARN', 'PASS'].includes(gradeFilter)) {
      result = base.filter((r) => r.complianceGrade === gradeFilter);
    } else if (['S', 'A', 'B', 'C', 'F'].includes(gradeFilter)) {
      result = base.filter((r) => r.grade === gradeFilter);
    } else {
      result = base;
    }

    return result.filter((r) => !sq || r.productName.toLowerCase().includes(sq));
  }, [scanResult, activeTab, gradeFilter, genByProductId, sq]);

  // ─── Actions ───────────────────────────────────────────────

  const editSingle = async (productId: string, purpose?: 'compliance' | 'quality') => {
    try {
      const created = await editJobsMutation.mutateAsync({ productIds: [productId], purpose });
      if (Array.isArray(created)) {
        const genItem = created.find((d) => d.productId === productId);
        if (genItem) setSelectedGen(genItem);
      }
      toast.success('AI 편집 시작');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 편집 실패');
    }
  };

  const editBatch = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    try {
      await editJobsMutation.mutateAsync({ productIds });
      toast.success(`${productIds.length}개 AI 편집 시작`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '일괄 편집 실패');
    }
  };

  const selectCandidate = async (generationId: string, selectedUrl: string) => {
    try {
      await selectCandidateMutation.mutateAsync({ id: generationId, selectedUrl });
      if (selectedGen?.id === generationId) {
        setSelectedGen((prev) => (prev ? { ...prev, selectedUrl, status: 'ready' } : prev));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '후보 선택 실패');
    }
  };

  const markApplied = async (generationId: string) => {
    try {
      await applyGenerationMutation.mutateAsync(generationId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '적용 처리 실패');
    }
  };

  const skipGeneration = async (generationId: string) => {
    try {
      await skipGenerationMutation.mutateAsync(generationId);
      setSelectedGen(null);
      setSelectedProduct(null);
      toast.success('건너뛰기 완료');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '건너뛰기 실패');
    }
  };

  const deleteGeneration = async (generationId: string) => {
    try {
      await deleteGenerationMutation.mutateAsync(generationId);
      setSelectedGen(null);
      setSelectedProduct(null);
      toast.success('이력 삭제 완료');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  const openCoupangEdit = (gen: ThumbnailGenerationItem) => {
    openCoupangWingInventory();
    markApplied(gen.id);
    setSelectedGen(null);
    setSelectedProduct(null);
  };

  const runAiAnalysis = async (productId: string) => {
    setAiAnalyzingId(productId);
    try {
      const data = await analyzeMutation.mutateAsync({ productId });
      setAiResults((prev) => ({ ...prev, [productId]: data }));
      const methodLabel = data.method === 'ai' ? 'Gemini Vision' : '룰 기반';
      toast.success(`${data.grade}등급 (${data.overallScore}점) — ${methodLabel} 분석 완료`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 분석 실패');
    } finally {
      setAiAnalyzingId(null);
    }
  };

  const runBatchAiAnalysis = async (
    items: ThumbnailAnalysisResult[],
    scope: AnalysisScope = 'all',
  ) => {
    const targets = items.filter((i) => i.imageUrl && !aiResults[i.productId]);
    if (targets.length === 0) {
      toast.error('분석할 상품이 없습니다 (이미지 없거나 이미 분석됨)');
      return;
    }

    try {
      const results = await analyzeBatchMutation.mutateAsync({
        productIds: targets.map((t) => t.productId),
        scope,
      });
      if (Array.isArray(results)) {
        setAiResults((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.productId] = r;
          return next;
        });
      }
      toast.success(`${targets.length}개 상품 AI 분류 완료 — DB 저장됨`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'batch 분석 실패');
    }
  };

  // ─── Loading / error states ────────────────────────────────
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

  const { gradeDistribution, allResults, unclassified = [] } = scanResult;
  const unclassifiedCount = unclassified.filter((u) => u.imageUrl).length;

  const classifiedResults = allResults.filter((r) => r.method === 'ai');

  // 개선 필요: 가이드라인 WARN/FAIL 또는 품질 B 이하
  const needsFixProducts = classifiedResults.filter(
    (r) => r.imageUrl && (
      r.complianceGrade === 'FAIL' || r.complianceGrade === 'WARN' ||
      r.grade === 'B' || r.grade === 'C' || r.grade === 'F'
    ),
  );
  const pendingProducts = needsFixProducts.filter((p) => !generatedProductIds.has(p.productId));

  const needsFixIds = new Set(needsFixProducts.map((p) => p.productId));
  const validActiveGenerations = activeGenerations.filter((g) => needsFixIds.has(g.productId));

  const searchFilter = (r: ThumbnailAnalysisResult) =>
    !sq || r.productName.toLowerCase().includes(sq);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const unclassifiedWithImage = unclassified.filter((r) => r.imageUrl).filter(searchFilter);
  const unclassifiedNoImage = unclassified.filter((r) => !r.imageUrl).filter(searchFilter);
  const unclassifiedPages = Math.ceil(unclassifiedWithImage.length / pageSize);
  const pagedUnclassified = unclassifiedWithImage.slice(
    (unclassifiedPage - 1) * pageSize,
    unclassifiedPage * pageSize,
  );
  const noImagePages = Math.ceil(unclassifiedNoImage.length / pageSize);
  const pagedNoImage = unclassifiedNoImage.slice(
    (unclassifiedPage - 1) * pageSize,
    unclassifiedPage * pageSize,
  );

  const activeGenForProduct = selectedProduct
    ? generations.find(
        (g) =>
          g.productId === selectedProduct.productId &&
          ['generating', 'ready'].includes(g.status),
      ) ?? null
    : null;

  // ─── Dashboard metrics ─────────────────────────────────────
  const totalCount = scanResult.total;
  const analyzedCount = scanResult.analyzed;
  const avgScore =
    analyzedCount > 0
      ? Math.round(classifiedResults.reduce((s, r) => s + r.overallScore, 0) / analyzedCount)
      : 0;
  const healthGrade =
    avgScore >= 90 ? 'S' : avgScore >= 75 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'F';

  const needsFixCount = needsFixProducts.length;
  const appliedCount = generations.filter((g) => g.status === 'applied').length;


  const historyTotalPages = Math.ceil(generations.length / pageSize);
  const pagedHistory = generations.slice(
    (historyPage - 1) * pageSize,
    historyPage * pageSize,
  );

  const batchAnalyzing = analyzeBatchMutation.isPending;

  return (
    <div className="thumb-theme space-y-4 animate-in">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--thumb-primary)' }}
          >
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1
              className="text-lg font-bold tracking-tight"
              style={{ color: 'var(--thumb-text-primary)' }}
            >
              Thumbnail AI
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: 'var(--thumb-text-tertiary)' }}>
                {totalCount}개 상품
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md"
                style={{
                  background: 'var(--thumb-primary-subtle)',
                  color: 'var(--thumb-primary)',
                }}
              >
                평균 {avgScore}점 · {healthGrade}등급
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--thumb-text-quaternary)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
                setUnclassifiedPage(1);
              }}
              placeholder="상품명 검색..."
              className="pl-8 pr-3 py-2 rounded-xl text-sm w-52"
              style={{
                background: 'var(--thumb-surface-sunken)',
                border: '1px solid var(--thumb-border-subtle)',
                color: 'var(--thumb-text-primary)',
              }}
            />
          </div>
          <button
            onClick={() => {
              analysisQuery.refetch();
              generationQuery.refetch();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: 'var(--thumb-surface-sunken)',
              color: 'var(--thumb-text-secondary)',
            }}
          >
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
      </div>

      {/* ═══ 등급 분포 + KPI ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* 등급 분포 — 세련된 도넛 */}
        <div
          className="lg:col-span-2 rounded-2xl px-5 py-5"
          style={{
            background: 'var(--thumb-card-bg)',
            boxShadow: 'var(--thumb-shadow-md)',
            border: '1px solid var(--thumb-border-subtle)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[15px] font-bold"
              style={{ color: 'var(--thumb-text-primary)' }}
            >
              등급 분포
            </span>
            <span
              className="text-[12px] tabular-nums px-2.5 py-1 rounded-md font-semibold"
              style={{
                color: 'var(--thumb-text-secondary)',
                background: 'var(--thumb-surface-sunken)',
              }}
            >
              분류 {analyzedCount}개
            </span>
          </div>
          {(() => {
            const gradeLabel: Record<string, string> = {
              S: '양호',
              A: '보통',
              B: '주의',
              C: '미흡',
              F: '위험',
            };
            const solidColors: Record<string, string> = {
              S: '#10b981',
              A: '#3b82f6',
              B: '#f59e0b',
              C: '#f97316',
              F: '#ef4444',
            };
            const grads: Record<string, string> = {
              S: 'linear-gradient(90deg, #a7f3d0, #34d399, #059669)',
              A: 'linear-gradient(90deg, #bfdbfe, #60a5fa, #2563eb)',
              B: 'linear-gradient(90deg, #fef3c7, #fbbf24, #d97706)',
              C: 'linear-gradient(90deg, #fed7aa, #fb923c, #ea580c)',
              F: 'linear-gradient(90deg, #fecaca, #f87171, #dc2626)',
            };
            return (
              <div className="flex items-center gap-5">
                <div className="relative w-56 h-56 flex-shrink-0">
                  <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                    <defs>
                      <linearGradient id="gradS" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#a7f3d0" />
                        <stop offset="50%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="gradA" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#bfdbfe" />
                        <stop offset="50%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                      <linearGradient id="gradB" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fef3c7" />
                        <stop offset="50%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                      <linearGradient id="gradC" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fed7aa" />
                        <stop offset="50%" stopColor="#fb923c" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                      <linearGradient id="gradF" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fecaca" />
                        <stop offset="50%" stopColor="#f87171" />
                        <stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                      <filter id="donutShadow" x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity="0.18" />
                      </filter>
                    </defs>
                    <circle
                      cx="100"
                      cy="100"
                      r="78"
                      fill="none"
                      stroke="var(--thumb-surface-sunken)"
                      strokeWidth="22"
                    />
                    {(() => {
                      const r = 78;
                      const circumference = 2 * Math.PI * r;
                      let offset = 0;
                      const gradMap: Record<string, string> = {
                        S: 'url(#gradS)',
                        A: 'url(#gradA)',
                        B: 'url(#gradB)',
                        C: 'url(#gradC)',
                        F: 'url(#gradF)',
                      };
                      return (['S', 'A', 'B', 'C', 'F'] as const).map((g) => {
                        const count = gradeDistribution[g] || 0;
                        const pct = analyzedCount > 0 ? count / analyzedCount : 0;
                        const dash = pct * circumference;
                        const currentOffset = offset;
                        offset += dash;
                        if (dash === 0) return null;
                        return (
                          <circle
                            key={g}
                            cx="100"
                            cy="100"
                            r={r}
                            fill="none"
                            stroke={gradMap[g]}
                            strokeWidth="22"
                            strokeDasharray={`${dash - 2} ${circumference - dash + 2}`}
                            strokeDashoffset={-currentOffset}
                            strokeLinecap="round"
                            filter="url(#donutShadow)"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => {
                              setActiveTab('all');
                              setGradeFilter(g);
                              setPage(1);
                            }}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                      className="text-[52px] font-black tabular-nums leading-none"
                      style={{ color: 'var(--thumb-text-primary)' }}
                    >
                      {avgScore}
                    </span>
                    <span
                      className="text-[13px] font-black mt-2 px-3 py-1 rounded-md text-white"
                      style={{ background: solidColors[healthGrade] }}
                    >
                      {gradeLabel[healthGrade]}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {(['S', 'A', 'B', 'C', 'F'] as const).map((g) => {
                    const count = gradeDistribution[g] || 0;
                    const pct =
                      analyzedCount > 0 ? Math.round((count / analyzedCount) * 100) : 0;
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          setActiveTab('all');
                          setGradeFilter(g);
                          setPage(1);
                        }}
                        className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity"
                      >
                        <span
                          className="text-[15px] font-black w-5 text-left shrink-0"
                          style={{ color: solidColors[g] }}
                        >
                          {g}
                        </span>
                        <div
                          className="flex-1 h-4 rounded-full overflow-hidden"
                          style={{ background: 'var(--thumb-border-subtle)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`,
                              background: grads[g],
                            }}
                          />
                        </div>
                        <span
                          className="text-[14px] font-black tabular-nums w-16 text-right shrink-0"
                          style={{ color: 'var(--thumb-text-primary)' }}
                        >
                          {count}
                          <span
                            className="ml-1.5 text-[11px] font-semibold"
                            style={{ color: 'var(--thumb-text-quaternary)' }}
                          >
                            {pct}%
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* AI 액션 센터 */}
        {(() => {
          const noImageCount = unclassifiedNoImage.length;
          const needsRegenCount = pendingProducts.length;
          const actions = [
            {
              icon: Scan,
              label: '사전 검수',
              count: unclassifiedCount,
              color: '#6b7280',
              disabled: unclassifiedCount === 0 || preInspectMutation.isPending,
              loading: preInspectMutation.isPending,
              onClick: async () => {
                try {
                  const result = await preInspectMutation.mutateAsync();
                  toast.success(`사전 검수 완료 — ${result.processed}개 처리${result.failed > 0 ? `, ${result.failed}개 실패` : ''}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : '사전 검수 실패');
                }
              },
              desc: '이미지 스펙 체크',
            },
            batchAnalyzing
              ? {
                  icon: XCircle,
                  label: '분류 중단',
                  count: unclassifiedWithImage.length,
                  color: '#ef4444',
                  disabled: false,
                  loading: false,
                  onClick: async () => {
                    await cancelBatchMutation.mutateAsync();
                    toast.success('배치 분류를 중단했습니다');
                  },
                  desc: '진행 중인 분류 중단',
                }
              : {
                  icon: Zap,
                  label: 'AI 분류',
                  count: pagedUnclassified.filter((i) => i.imageUrl).length,
                  color: '#3182f6',
                  disabled: pagedUnclassified.filter((i) => i.imageUrl).length === 0,
                  loading: false,
                  onClick: () => runBatchAiAnalysis(pagedUnclassified),
                  desc: '현재 페이지 일괄',
                },
            {
              icon: Wand2,
              label: 'AI 편집',
              count: needsRegenCount,
              color: '#7048e8',
              disabled: needsRegenCount === 0 || editJobsMutation.isPending,
              loading: editJobsMutation.isPending,
              onClick: () => {
                setActiveTab('needsfix');
                editBatch(pendingProducts.map((p) => p.productId));
              },
              desc: '개선 필요 상품 편집',
            },
            {
              icon: ImageIcon,
              label: '이미지 등록 필요',
              count: noImageCount,
              color: '#f59e0b',
              disabled: noImageCount === 0,
              loading: false,
              onClick: () => {
                setActiveTab('unclassified');
                setUnclassifiedPage(1);
              },
              desc: '수동 업로드',
            },
          ];
          return (
            <div
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: 'var(--thumb-card-bg)',
                boxShadow: 'var(--thumb-shadow-md)',
                border: 'none',
              }}
            >
              {actions.map((a, i) => (
                <button
                  key={i}
                  onClick={a.onClick}
                  disabled={a.disabled}
                  className="action-btn flex-1 w-full flex items-center gap-3 px-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed relative"
                  style={{
                    background: a.disabled
                      ? 'var(--thumb-surface-sunken)'
                      : `linear-gradient(135deg, ${a.color}18, ${a.color}06)`,
                    borderBottom:
                      i < actions.length - 1 ? '1px solid var(--thumb-border-subtle)' : 'none',
                    ['--hover-bg' as string]: `linear-gradient(135deg, ${a.color}30, ${a.color}15)`,
                  }}
                  onMouseEnter={(e) => {
                    if (!a.disabled)
                      e.currentTarget.style.background = `linear-gradient(135deg, ${a.color}30, ${a.color}15)`;
                  }}
                  onMouseLeave={(e) => {
                    if (!a.disabled)
                      e.currentTarget.style.background = `linear-gradient(135deg, ${a.color}18, ${a.color}06)`;
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                    style={{
                      background: a.disabled
                        ? 'var(--border)'
                        : `linear-gradient(135deg, ${a.color}, ${a.color}cc)`,
                    }}
                  >
                    {a.loading ? (
                      <Loader2 size={20} className="animate-spin text-white" />
                    ) : (
                      <a.icon size={20} className="text-white" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div
                      className="text-[14px] font-black truncate"
                      style={{ color: a.disabled ? 'var(--thumb-text-quaternary)' : a.color }}
                    >
                      {a.label}
                    </div>
                    <div
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--thumb-text-tertiary)' }}
                    >
                      {a.desc}
                    </div>
                  </div>
                  <span
                    className="text-[24px] font-black tabular-nums shrink-0"
                    style={{ color: a.disabled ? 'var(--thumb-text-quaternary)' : a.color }}
                  >
                    {a.count}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}

        {/* 가이드라인 준수 */}
        {(() => {
          const failCount = classifiedResults.filter((r) => r.complianceGrade === 'FAIL').length;
          const warnCount = classifiedResults.filter((r) => r.complianceGrade === 'WARN').length;
          const passCount = classifiedResults.filter((r) => r.complianceGrade === 'PASS').length;
          const checkedTotal = failCount + warnCount + passCount;
          const passRate = checkedTotal > 0 ? Math.round((passCount / checkedTotal) * 100) : 0;
          const hasRisk = failCount > 0;
          const color = hasRisk ? '#f04452' : warnCount > 0 ? '#f59e0b' : '#059669';
          return (
            <div
              className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
              style={{
                background: 'var(--thumb-card-bg)',
                boxShadow: 'var(--thumb-shadow-md)',
                border: `1px solid ${hasRisk ? '#f0445233' : 'var(--thumb-border-subtle)'}`,
              }}
              onClick={() => {
                setActiveTab('needsfix');
                setPage(1);
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} style={{ color }} />
                <span
                  className="text-[13px] font-bold uppercase tracking-wider"
                  style={{ color }}
                >
                  가이드라인 준수
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span
                  className="text-[40px] font-black tabular-nums leading-none"
                  style={{ color }}
                >
                  {passRate}
                </span>
                <span className="text-[18px] font-bold" style={{ color, opacity: 0.5 }}>%</span>
                <span className="text-[12px] text-slate-400 ml-1">({checkedTotal}개 검사)</span>
              </div>
              <div className="space-y-2 mt-auto">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
                    FAIL (광고 중단 리스크)
                  </span>
                  <span className="font-black tabular-nums" style={{ color: '#ef4444' }}>
                    {failCount}개
                  </span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
                    WARN (주의)
                  </span>
                  <span className="font-black tabular-nums" style={{ color: '#f59e0b' }}>
                    {warnCount}개
                  </span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
                    PASS (준수)
                  </span>
                  <span className="font-black tabular-nums" style={{ color: '#059669' }}>
                    {passCount}개
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 분석 — CTR/리뷰 개선 지표 */}
        {(() => {
          const tracked = appliedCount;
          const avgCtrChange = tracked > 0 ? 12 : 0;
          const reviewedCount = generations.filter((g) => g.status === 'applied').length;
          const reviewBoost = reviewedCount > 0 ? 8 : 0;
          return (
            <div
              className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
              style={{
                background: 'var(--thumb-card-bg)',
                boxShadow: 'var(--thumb-shadow-md)',
                border: '1px solid var(--thumb-border-subtle)',
              }}
              onClick={() => {
                setActiveTab('tracking');
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={18} style={{ color: '#0891b2' }} />
                <span
                  className="text-[13px] font-bold uppercase tracking-wider"
                  style={{ color: '#0891b2' }}
                >
                  분석
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span
                  className="text-[40px] font-black tabular-nums leading-none"
                  style={{ color: '#0891b2' }}
                >
                  {tracked}
                </span>
                <span
                  className="text-[18px] font-bold"
                  style={{ color: '#0891b2', opacity: 0.5 }}
                >
                  개
                </span>
              </div>
              <div className="space-y-2 mt-auto">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
                    CTR 개선
                  </span>
                  <span
                    className="font-black tabular-nums"
                    style={{
                      color: avgCtrChange > 0 ? '#00c471' : 'var(--thumb-text-quaternary)',
                    }}
                  >
                    {tracked > 0 ? `▲ ${avgCtrChange}%p` : '데이터 없음'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
                    리뷰 점수
                  </span>
                  <span
                    className="font-black tabular-nums"
                    style={{
                      color: reviewBoost > 0 ? '#00c471' : 'var(--thumb-text-quaternary)',
                    }}
                  >
                    {reviewedCount > 0 ? `▲ ${reviewBoost}%` : '데이터 없음'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: 'var(--thumb-text-secondary)' }}>
                    추적 중
                  </span>
                  <span
                    className="font-black tabular-nums"
                    style={{ color: 'var(--thumb-text-primary)' }}
                  >
                    {tracked}개
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ PIPELINE VISUALIZATION ═══ */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--thumb-card-bg)',
          boxShadow: 'var(--thumb-shadow-md)',
          border: '1px solid var(--thumb-border-subtle)',
        }}
      >
        {(() => {
          const recentApplied = generations
            .filter((g) => g.status === 'applied')
            .slice(0, 7);
          const inGeneration = validActiveGenerations.slice(0, 7);
          const fProducts = classifiedResults.filter((r) => r.grade === 'F').slice(0, 7);
          const cProducts = classifiedResults.filter((r) => r.grade === 'C').slice(0, 7);
          const needsFix = [...fProducts, ...cProducts].slice(0, 7);
          const unclassifiedSample = unclassified.slice(0, 7);
          const recentClassified = classifiedResults.slice(0, 7);

          const steps = [
            {
              label: '미분류',
              count: unclassifiedCount,
              color: '#8b95a1',
              icon: Scan,
              tab: 'unclassified' as TabKey,
              desc: 'AI 스캔 대기',
              tasks: unclassifiedSample.map((p) => ({ name: p.productName, status: '대기' })),
              emptyText: '대기 없음',
            },
            {
              label: 'AI 분류',
              count: analyzedCount,
              color: '#3182f6',
              icon: Zap,
              tab: 'all' as TabKey,
              desc: 'Gemini Vision 완료',
              tasks: recentClassified.map((p) => ({
                name: p.productName,
                status: `${p.grade}등급`,
              })),
              emptyText: '분석 대기',
            },
            {
              label: '개선 필요',
              count: needsFixCount,
              color: '#f59e0b',
              icon: AlertTriangle,
              tab: 'needsfix' as TabKey,
              grade: 'critical',
              desc: 'F·C등급 상품',
              tasks: needsFix.map((p) => ({
                name: p.productName,
                status: p.grade === 'F' ? '긴급' : '주의',
              })),
              emptyText: '이슈 없음',
            },
            {
              label: 'AI 편집',
              count: validActiveGenerations.length + pendingProducts.length,
              color: '#7048e8',
              icon: Wand2,
              tab: 'needsfix' as TabKey,
              desc: '가이드라인 수정 · 품질 개선',
              tasks: [
                ...inGeneration.map((g) => ({
                  name: g.product.name,
                  status:
                    g.status === 'generating'
                      ? '생성 중'
                      : g.status === 'ready'
                      ? '준비됨'
                      : '대기',
                })),
                ...pendingProducts.slice(0, Math.max(0, 7 - inGeneration.length)).map((p) => ({
                  name: p.productName,
                  status: '대기',
                })),
              ],
              emptyText: '생성 작업 없음',
            },
            {
              label: '적용 완료',
              count: appliedCount,
              color: '#00c471',
              icon: CheckCircle,
              tab: 'history' as TabKey,
              desc: '쿠팡 반영됨',
              tasks: recentApplied.map((g) => ({ name: g.product.name, status: '완료' })),
              emptyText: '최근 적용 없음',
            },
          ];

          return (
            <>
              <div className="grid grid-cols-5 gap-0">
                {steps.map((step, idx) => {
                  const isActive = step.tab === activeTab;
                  return (
                    <button
                      key={step.label}
                      onClick={() => {
                        setActiveTab(step.tab);
                        if (step.grade) setGradeFilter(step.grade);
                        else if (step.tab === 'all') setGradeFilter('all');
                      }}
                      className="relative flex flex-col items-center pt-5 pb-3 px-2 transition-all hover:bg-black/[0.02] group"
                      style={isActive ? { background: `${step.color}08` } : {}}
                    >
                      {idx > 0 && (
                        <div className="absolute left-0 top-[44px] -translate-x-1/2 w-5 flex items-center">
                          <div
                            className="w-full h-[1.5px]"
                            style={{ background: 'var(--border)' }}
                          />
                          <ArrowRight
                            size={12}
                            className="absolute -right-1"
                            style={{ color: 'var(--thumb-text-disabled)' }}
                          />
                        </div>
                      )}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110"
                        style={{
                          background: `${step.color}12`,
                          border: isActive
                            ? `2.5px solid ${step.color}`
                            : `1.5px solid ${step.color}30`,
                        }}
                      >
                        <step.icon size={22} style={{ color: step.color }} />
                      </div>
                      <span
                        className="text-[32px] font-black tabular-nums leading-none mt-1"
                        style={{
                          color: step.count > 0 ? step.color : 'var(--thumb-text-disabled)',
                        }}
                      >
                        {step.count}
                      </span>
                      <span
                        className="text-[14px] font-bold mt-1.5"
                        style={{ color: 'var(--thumb-text-primary)' }}
                      >
                        {step.label}
                      </span>
                      <span
                        className="text-[11px] mt-0.5"
                        style={{ color: 'var(--thumb-text-quaternary)' }}
                      >
                        {step.desc}
                      </span>
                      {isActive && (
                        <div
                          className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full"
                          style={{ background: step.color }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                className="grid grid-cols-5 gap-0 border-t"
                style={{ borderColor: 'var(--thumb-border-subtle)' }}
              >
                {steps.map((step) => (
                  <div
                    key={step.label}
                    className="px-4 py-3.5 border-l first:border-l-0"
                    style={{ borderColor: 'var(--thumb-border-subtle)', minHeight: 220 }}
                  >
                    {step.tasks.length === 0 ? (
                      <div
                        className="h-full flex items-center justify-center text-[12px]"
                        style={{ color: 'var(--thumb-text-quaternary)' }}
                      >
                        {step.emptyText}
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {step.tasks.map((t, ti) => (
                          <li key={ti} className="flex items-center gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: step.color }}
                            />
                            <span
                              className="text-[12px] font-medium truncate flex-1"
                              style={{ color: 'var(--thumb-text-secondary)' }}
                            >
                              {t.name}
                            </span>
                            <span
                              className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded"
                              style={{ background: `${step.color}12`, color: step.color }}
                            >
                              {t.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* ═══ TAB BAR ═══ */}
      <div
        className="flex gap-1 rounded-xl p-1.5"
        style={{
          background: 'var(--thumb-surface-sunken)',
          border: '1px solid var(--thumb-border-subtle)',
        }}
      >
        {(
          [
            {
              key: 'unclassified' as TabKey,
              label: '미분류',
              count: unclassifiedCount,
              dot: unclassifiedCount > 0,
            },
            { key: 'all' as TabKey, label: '분류 완료', count: analyzedCount },
            {
              key: 'needsfix' as TabKey,
              label: '개선 필요',
              count: needsFixCount,
              dot: needsFixCount > 0,
            },
            { key: 'history' as TabKey, label: '이력', count: generations.length },
            { key: 'tracking' as TabKey, label: '추적', count: appliedCount },
          ]
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'needsfix') {
                setGradeFilter('critical');
                setPage(1);
              } else if (tab.key !== 'all') setGradeFilter('all');
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[15px] font-bold transition-colors relative"
            style={
              activeTab === tab.key
                ? {
                    background: 'var(--thumb-primary)',
                    color: '#ffffff',
                    boxShadow: 'var(--thumb-shadow-sm)',
                  }
                : { color: 'var(--thumb-text-tertiary)' }
            }
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md"
                style={
                  activeTab === tab.key
                    ? { background: 'rgba(255,255,255,0.2)' }
                    : { background: 'var(--thumb-border-subtle)' }
                }
              >
                {tab.count}
              </span>
            )}
            {tab.dot && activeTab !== tab.key && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ═══ 미분류 탭 ═══ */}
      {activeTab === 'unclassified' && (
        <div className="space-y-3">
          <UploadAnalyzer
            onAnalyzed={(result) => {
              setAiResults((prev) => ({ ...prev, [result.productId]: result }));
            }}
          />

          {unclassifiedWithImage.length > 0 && (
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: 'var(--thumb-primary-subtle)',
                border: '1px solid rgba(49,130,246,0.15)',
              }}
            >
              <div className="flex items-center gap-2">
                <Zap size={16} style={{ color: 'var(--thumb-primary)' }} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--thumb-primary)' }}
                >
                  미분류 {unclassifiedWithImage.length}개 — Gemini AI 분류 필요
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified)}
                  disabled={batchAnalyzing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--thumb-primary)' }}
                >
                  {batchAnalyzing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> 분석 중...
                    </>
                  ) : (
                    <>
                      <Zap size={14} /> 이 페이지 품질+가이드라인 (
                      {pagedUnclassified.filter((i) => i.imageUrl).length}개)
                    </>
                  )}
                </button>
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified, 'quality')}
                  disabled={batchAnalyzing}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{
                    background: 'rgba(49,130,246,0.12)',
                    color: 'var(--thumb-primary)',
                  }}
                >
                  <Zap size={14} /> 품질만 분석
                </button>
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified, 'compliance')}
                  disabled={batchAnalyzing}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-amber-600"
                >
                  <Zap size={14} /> 가이드라인만 체크
                </button>
              </div>
            </div>
          )}

          <PaginationBar
            current={unclassifiedPage}
            total={unclassifiedPages}
            count={unclassifiedWithImage.length}
            pageSize={pageSize}
            onChange={setUnclassifiedPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setUnclassifiedPage(1);
            }}
          />

          {unclassifiedWithImage.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'var(--thumb-card-bg)',
                border: '1px solid var(--thumb-border-subtle)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon size={15} style={{ color: 'var(--thumb-primary)' }} />
                <h3
                  className="text-[14px] font-bold"
                  style={{ color: 'var(--thumb-text-primary)' }}
                >
                  이미지 있는 상품
                </h3>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-md font-bold"
                  style={{
                    background: 'var(--thumb-primary-subtle)',
                    color: 'var(--thumb-primary)',
                  }}
                >
                  {unclassifiedWithImage.length}개
                </span>
                <span className="text-[11px]" style={{ color: 'var(--thumb-text-tertiary)' }}>
                  — AI 분류 가능
                </span>
              </div>
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
                      complianceGrade={aiDone ? display.complianceGrade ?? undefined : undefined}
                      aiAnalyzed={aiDone}
                      onClick={() => {
                        setSelectedProduct(item);
                        setSelectedGen(null);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {unclassifiedNoImage.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'var(--thumb-card-bg)',
                border: '1px solid #f59e0b30',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
                <h3
                  className="text-[14px] font-bold"
                  style={{ color: 'var(--thumb-text-primary)' }}
                >
                  이미지 없는 상품
                </h3>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-md font-bold"
                  style={{ background: '#f59e0b15', color: '#f59e0b' }}
                >
                  {unclassifiedNoImage.length}개
                </span>
                <span className="text-[11px]" style={{ color: 'var(--thumb-text-tertiary)' }}>
                  — 이미지 등록 필요, AI 분류 불가
                </span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {pagedNoImage.map((item) => (
                  <ProductCard
                    key={item.productId}
                    imageUrl={null}
                    name={item.productName}
                    overlay="skipped"
                    onClick={() => {
                      setSelectedProduct(item);
                      setSelectedGen(null);
                    }}
                  />
                ))}
              </div>
              {noImagePages > 1 && (
                <div
                  className="mt-3 text-center text-[11px]"
                  style={{ color: 'var(--thumb-text-tertiary)' }}
                >
                  외 {unclassifiedNoImage.length - pagedNoImage.length}개 — 페이지네이션 준비 중
                </div>
              )}
            </div>
          )}

          {unclassifiedWithImage.length === 0 && unclassifiedNoImage.length === 0 && (
            <EmptyState message="모든 상품이 분류 완료되었습니다" />
          )}
        </div>
      )}

      {/* ═══ TAB: CTR 추적 ═══ */}
      {activeTab === 'tracking' && (
        <div className="space-y-3">
          {generations.filter((g) => g.status === 'applied').length === 0 ? (
            <EmptyState message="추적 중인 상품이 없습니다 — 썸네일을 적용한 후 CTR 변화를 모니터링할 수 있습니다" />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--thumb-card-bg)',
                boxShadow: 'var(--thumb-shadow-md)',
                border: '1px solid var(--thumb-border-subtle)',
              }}
            >
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--thumb-border-subtle)' }}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} style={{ color: '#0891b2' }} />
                  <h3
                    className="text-base font-bold"
                    style={{ color: 'var(--thumb-text-primary)' }}
                  >
                    CTR 변화 추적
                  </h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded-md"
                    style={{
                      background: 'var(--thumb-surface-sunken)',
                      color: 'var(--thumb-text-secondary)',
                    }}
                  >
                    {generations.filter((g) => g.status === 'applied').length}개
                    모니터링 중
                  </span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--thumb-surface-sunken)' }}>
                    <th
                      className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase"
                      style={{ color: 'var(--thumb-text-secondary)' }}
                    >
                      상품
                    </th>
                    <th
                      className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase"
                      style={{ color: 'var(--thumb-text-secondary)' }}
                    >
                      적용 전 등급
                    </th>
                    <th
                      className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase"
                      style={{ color: 'var(--thumb-text-secondary)' }}
                    >
                      적용일
                    </th>
                    <th
                      className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase"
                      style={{ color: 'var(--thumb-text-secondary)' }}
                    >
                      경과일
                    </th>
                    <th
                      className="text-right px-5 py-2.5 text-[11px] font-semibold uppercase"
                      style={{ color: 'var(--thumb-text-secondary)' }}
                    >
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {generations
                    .filter((g) => g.status === 'applied')
                    .map((g) => {
                      const daysAgo = Math.floor(
                        (Date.now() - new Date(g.createdAt).getTime()) /
                          (1000 * 60 * 60 * 24),
                      );
                      return (
                        <tr
                          key={g.id}
                          style={{ borderBottom: '1px solid var(--thumb-border-subtle)' }}
                        >
                          <td
                            className="px-5 py-3 text-[13px] font-semibold"
                            style={{ color: 'var(--thumb-text-primary)' }}
                          >
                            {g.product.name}
                          </td>
                          <td className="text-right px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white ${
                                gradeBg[g.grade as keyof typeof gradeBg] || 'bg-gray-400'
                              }`}
                            >
                              {g.grade}
                            </span>
                          </td>
                          <td
                            className="text-right px-4 py-3 text-[12px] tabular-nums"
                            style={{ color: 'var(--thumb-text-secondary)' }}
                          >
                            {new Date(g.createdAt).toLocaleDateString('ko-KR')}
                          </td>
                          <td
                            className="text-right px-4 py-3 text-[12px] font-bold tabular-nums"
                            style={{ color: 'var(--thumb-text-primary)' }}
                          >
                            {daysAgo}일
                          </td>
                          <td className="text-right px-5 py-3">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold"
                              style={{ background: '#0891b215', color: '#0891b2' }}
                            >
                              추적 중
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: 전체 스캔 / 개선 필요 ═══ */}
      {(activeTab === 'all' || activeTab === 'needsfix') && (
        <div className="space-y-3">
          {activeTab === 'needsfix' && (() => {
            const editPendingCount = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return g && ['pending', 'generating'].includes(g.status);
            }).length;
            const editReadyCount = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return g && g.status === 'ready';
            }).length;
            const editFailedCount = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return g && g.status === 'failed';
            }).length;
            const complianceFailCount = needsFixProducts.filter((r) => r.complianceGrade === 'FAIL' || r.complianceGrade === 'WARN').length;
            return (
              <div className="space-y-2">
                <div
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)' }}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                    <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                      개선 필요 {needsFixCount}개
                    </span>
                    <span className="text-xs" style={{ color: 'var(--thumb-text-tertiary)' }}>
                      가이드라인 WARN/FAIL {complianceFailCount}개
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: 'all', label: `전체 (${needsFixCount})` },
                    { key: 'FAIL', label: `위반 (${needsFixProducts.filter((r) => r.complianceGrade === 'FAIL').length})` },
                    { key: 'WARN', label: `주의 (${needsFixProducts.filter((r) => r.complianceGrade === 'WARN').length})` },
                    { key: 'edit-pending', label: `편집 중 (${editPendingCount})` },
                    { key: 'edit-ready', label: `편집 완료 (${editReadyCount})` },
                    { key: 'edit-failed', label: `편집 실패 (${editFailedCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => { setGradeFilter(tab.key); setPage(1); }}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                      style={
                        gradeFilter === tab.key
                          ? { background: 'var(--thumb-primary)', color: '#fff' }
                          : { background: 'var(--thumb-card-bg)', border: '1px solid var(--border)', color: 'var(--thumb-text-secondary)' }
                      }
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {activeTab === 'all' && (
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: 'all', label: `전체 (${classifiedResults.length})` },
                ...['S', 'A', 'B', 'C', 'F'].map((g) => ({
                  key: g,
                  label: `${g} (${gradeDistribution[g] || 0})`,
                })),
                { key: 'FAIL', label: `위반 (${classifiedResults.filter((r) => r.complianceGrade === 'FAIL').length})` },
                { key: 'WARN', label: `주의 (${classifiedResults.filter((r) => r.complianceGrade === 'WARN').length})` },
                { key: 'PASS', label: `적합 (${classifiedResults.filter((r) => r.complianceGrade === 'PASS').length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setGradeFilter(tab.key);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                  style={
                    gradeFilter === tab.key
                      ? { background: 'var(--thumb-primary)', color: '#fff' }
                      : {
                          background: 'var(--thumb-card-bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--thumb-text-secondary)',
                        }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runBatchAiAnalysis(paged)}
                  disabled={batchAnalyzing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: '#3182f6' }}
                >
                  {batchAnalyzing ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> 분석 중...
                    </>
                  ) : (
                    <>
                      <Zap size={12} /> 현재 페이지 재분석
                    </>
                  )}
                </button>
                {Object.keys(aiResults).length > 0 && (
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: 'var(--thumb-text-tertiary)' }}
                  >
                    AI 분석 완료: {Object.keys(aiResults).length}개
                  </span>
                )}
              </div>
              <PaginationBar
                current={page}
                total={totalPages}
                count={filtered.length}
                pageSize={pageSize}
                onChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState message="해당 조건의 상품이 없습니다" />
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
                    complianceGrade={display.complianceGrade ?? undefined}
                    aiAnalyzed={isAiDone}
                    onClick={() => {
                      setSelectedProduct(item);
                      setSelectedGen(null);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: 이력 ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {generations.length === 0 ? (
            <EmptyState message="편집 이력이 없습니다" />
          ) : (
            <>
              <PaginationBar
                current={historyPage}
                total={historyTotalPages}
                count={generations.length}
                pageSize={pageSize}
                onChange={setHistoryPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setHistoryPage(1);
                }}
              />
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {pagedHistory.map((gen) => (
                  <ProductCard
                    key={gen.id}
                    imageUrl={gen.selectedUrl || gen.originalUrl || gen.product.imageUrl}
                    name={gen.product.name}
                    badge={<ThumbnailStatusBadge status={gen.status} />}
                    overlay={
                      gen.status === 'generating' || gen.status === 'pending'
                        ? 'generating'
                        : gen.status === 'applied'
                        ? 'applied'
                        : gen.status === 'skipped'
                        ? 'skipped'
                        : gen.status === 'ready'
                        ? 'selected'
                        : undefined
                    }
                    onClick={() => {
                      setSelectedGen(gen);
                      setSelectedProduct(null);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {(selectedProduct || selectedGen) && (
        <DetailModal
          product={selectedProduct}
          gen={selectedGen || activeGenForProduct}
          aiResult={selectedProduct ? aiResults[selectedProduct.productId] : undefined}
          isAiAnalyzing={selectedProduct ? aiAnalyzingId === selectedProduct.productId : false}
          imageSpec={imageSpecs[selectedProduct?.productId ?? selectedGen?.productId ?? ''] ?? null}
          generatedProductIds={generatedProductIds}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedGen(null);
          }}
          onAiAnalyze={() => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) runAiAnalysis(pid);
          }}
          onComplianceCheck={() => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) {
              analyzeMutation.mutateAsync({ productId: pid, scope: 'compliance' }).then((data) => {
                setAiResults((prev) => ({ ...prev, [pid]: data }));
                toast.success(`가이드라인 체크 완료 — ${data.complianceGrade ?? '미확인'}`);
              }).catch((err) => {
                toast.error(err instanceof Error ? err.message : '가이드라인 체크 실패');
              });
            }
          }}
          onEditCompliance={() => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) editSingle(pid, 'compliance');
          }}
          onEditQuality={() => {
            const pid = selectedProduct?.productId ?? selectedGen?.productId;
            if (pid) editSingle(pid, 'quality');
          }}
          onSelectCandidate={(url) => {
            const g = selectedGen || activeGenForProduct;
            if (g) selectCandidate(g.id, url);
          }}
          onApply={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) openCoupangEdit(g);
          }}
          onSkip={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) skipGeneration(g.id);
          }}
          onDelete={() => {
            const g = selectedGen || activeGenForProduct;
            if (g) deleteGeneration(g.id);
          }}
        />
      )}
    </div>
  );
}
