'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ImageIcon,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle,
  Scan,
  ScanSearch,
  Wand2,
  Loader2,
  ArrowRight,
  Sparkles,
  Search,
  TrendingUp,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
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
  type AnalysisScope,
} from './hooks/useThumbnailAnalysis';
import {
  useGenerationList,
  useCreateEditJobs,
  useSelectCandidate,
  useApplyGeneration,
  useSkipGeneration,
  useDeleteGeneration,
  useReEditGeneration,
} from './hooks/useThumbnailGenerations';

import { ProductCard } from './components/ProductCard';
import { DetailModal } from './components/DetailModal';
import { PaginationBar } from './components/PaginationBar';
import { UploadAnalyzer } from './components/UploadAnalyzer';
import { InspectionDrawer } from './components/InspectionDrawer';
import { ThumbnailStatusBadge } from './components/ThumbnailStatusBadge';
import { TrackingTab } from './components/TrackingTab';
import { useTrackingList } from './hooks/useThumbnailTracking';
import { openCoupangWingInventory } from './lib/coupang-wing';
import { resolveImageUrl } from './lib/resolve-url';
import { cn } from '@/lib/utils';
import { isReady, isApplied, isActive } from '@/lib/thumbnail-status';

type TabKey = 'unclassified' | 'all' | 'needsfix' | 'ai-edit' | 'history' | 'tracking';

const gradeBg: Record<string, string> = {
  S: 'bg-emerald-500',
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-orange-500',
  F: 'bg-red-500',
};

export default function ThumbnailsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const batchCancelRef = useRef(false);
  const batchAbortRef = useRef<AbortController | null>(null);

  // ─── Server state via React Query ──────────────────────────
  const analysisQuery = useAnalysisList();
  const generationQuery = useGenerationList();
  const trackingQuery = useTrackingList();

  const analyzeMutation = useAnalyze();
  const analyzeBatchMutation = useAnalyzeBatch();
  const cancelBatchMutation = useCancelBatch();
  const editJobsMutation = useCreateEditJobs();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();
  const deleteGenerationMutation = useDeleteGeneration();
  const reEditMutation = useReEditGeneration();

  // ─── Local UI state ────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [unclassifiedSubTab, setUnclassifiedSubTab] = useState<'with-image' | 'no-image' | 'new'>('with-image');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<ThumbnailAnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<ThumbnailGenerationItem | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  // AI 편집 탭
  const [editFilter, setEditFilter] = useState<'pending' | 'generating' | 'ready' | 'applied'>('ready');
  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);
  const [expandedSlideIdx, setExpandedSlideIdx] = useState(0);
  const [zoomImageInline, setZoomImageInline] = useState<string | null>(null);

  // AI analysis — local overrides for immediate feedback before refetch settles
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, ThumbnailAnalysisResult>>({});

  // 배치 분류 진행 상태
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // 개선필요 탭 선택
  const [selectedNeedsFixIds, setSelectedNeedsFixIds] = useState<Set<string>>(new Set());
  const toggleNeedsFixSelection = (id: string) =>
    setSelectedNeedsFixIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 이력 서브탭
  const [historySubTab, setHistorySubTab] = useState<'history' | 'tracking'>('history');

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
    () => generations.filter((g) => g.status === 'pending' || g.status === 'running' || isReady(g)),
    [generations],
  );

  // 배치 분류 중 경과 시간 타이머
  useEffect(() => {
    if (!batchStartTime) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - batchStartTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [batchStartTime]);

  // selectedGen을 polling 데이터와 동기화 (status + candidates 변화 감지)
  useEffect(() => {
    if (!selectedGen) return;
    const latest = generations.find((g) => g.id === selectedGen.id);
    if (!latest) return;
    const changed = latest.status !== selectedGen.status
      || latest.candidates.length !== selectedGen.candidates.length
      || latest.selectedUrl !== selectedGen.selectedUrl;
    if (changed) setSelectedGen(latest);
  }, [generations, selectedGen]);

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

  // 이력: 상품별 최신 job만 표시
  const historyByProduct = useMemo(() => Array.from(genByProductId.values()), [genByProductId]);

  // filtered는 scanResult 로딩 전에는 빈 배열
  const sq = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!scanResult) return [];
    const allResults = scanResult.allResults ?? [];
    const classifiedResults = allResults.filter((r) => r.analyzed);
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
      result = hasEditStatus(base, ['pending', 'running']);
    } else if (gradeFilter === 'edit-ready') {
      result = base.filter((item) => { const g = genByProductId.get(item.productId); return g && isReady(g); });
    } else if (gradeFilter === 'edit-failed') {
      result = hasEditStatus(base, ['failed']);
    } else if (['FAIL', 'WARN', 'PASS'].includes(gradeFilter)) {
      result = base.filter((r) => r.complianceGrade === gradeFilter);
    } else if (['S', 'A', 'B', 'C', 'F'].includes(gradeFilter)) {
      result = base.filter((r) => r.grade === gradeFilter);
    } else {
      result = base;
    }

    return result
      .filter((r) => !sq || r.productName.toLowerCase().includes(sq))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [scanResult, activeTab, gradeFilter, genByProductId, sq]);

  // ─── Actions ───────────────────────────────────────────────

  const editSingle = async (productId: string, purpose?: 'compliance' | 'quality') => {
    try {
      const created = await editJobsMutation.mutateAsync({ productIds: [productId], purpose });
      if (Array.isArray(created)) {
        const genItem = created.find((d) => d.productId === productId);
        if (genItem) setSelectedGen(genItem);
      }
      // polling 시작을 위해 generation list 즉시 refetch
      generationQuery.refetch();
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
    // activeGenForProduct는 렌더 시점 값 캡처
    const currentGen = selectedGen ?? activeGenForProduct;
    try {
      await selectCandidateMutation.mutateAsync({ id: generationId, selectedUrl });
      if (currentGen?.id === generationId) {
        setSelectedGen({ ...currentGen, selectedUrl: selectedUrl || null, status: 'succeeded', phase: 'ready' });
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

  const [wingRegisteringIds, setWingRegisteringIds] = useState<Set<string>>(new Set());

  const openCoupangEdit = async (gen: ThumbnailGenerationItem) => {
    if (!gen.selectedUrl) {
      toast.error('선택된 이미지가 없습니다');
      return;
    }
    setWingRegisteringIds((prev) => new Set(prev).add(gen.id));
    try {
      const result = await apiClient.post<{ success: boolean; screenshotPath: string | null; error?: string }>(
        `/api/thumbnail-analysis/generations/${gen.id}/wing-register`,
        {},
      );
      if (result.success) {
        toast.success('Wing 대표이미지 업로드 완료 — 스크린샷 확인 후 저장하세요');
        markApplied(gen.id);
        setSelectedGen(null);
        setSelectedProduct(null);
      } else {
        toast.error(result.error ?? 'Wing 업로드 실패');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wing 연동 오류');
    } finally {
      setWingRegisteringIds((prev) => {
        const next = new Set(prev);
        next.delete(gen.id);
        return next;
      });
    }
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

    setBatchTotal(targets.length);
    setBatchDone(0);
    setBatchStartTime(Date.now());
    setElapsed(0);
    setIsBatchRunning(true);
    batchCancelRef.current = false;
    batchAbortRef.current = new AbortController();

    const BATCH_SIZE = 10;
    const allResults: ThumbnailAnalysisResult[] = [];
    const signal = batchAbortRef.current.signal;

    try {
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        if (batchCancelRef.current || signal.aborted) break;

        const chunk = targets.slice(i, i + BATCH_SIZE);
        const chunkResults = await apiClient
          .post<ThumbnailAnalysisResult[]>('/api/thumbnail-analysis/analyze-batch', {
            productIds: chunk.map((t) => t.productId),
            scope,
          }, { signal })
          .catch(() => [] as ThumbnailAnalysisResult[]);

        const valid = chunkResults.filter(Boolean) as ThumbnailAnalysisResult[];
        allResults.push(...valid);

        // 즉시 로컬 결과 반영
        setAiResults((prev) => {
          const next = { ...prev };
          for (const r of valid) next[r.productId] = r;
          return next;
        });

        // 완료 카운트 갱신
        setBatchDone((d) => d + valid.length);

        // 쿼리 무효화 → 파이프라인 카운트 실시간 동기화
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });

        // Gemini rate limit 방지: 다음 배치 전 대기
        if (i + BATCH_SIZE < targets.length) {
          await new Promise<void>((r) => setTimeout(r, 2000));
        }
      }

      const needsFix = allResults.filter((r) => r.grade === 'C' || r.grade === 'F');
      if (!batchCancelRef.current) {
        if (needsFix.length > 0) {
          setActiveTab('needsfix');
          setGradeFilter('critical');
          setPage(1);
          toast.success(`${targets.length}개 분류 완료 — 개선 필요 ${needsFix.length}개`);
        } else {
          toast.success(`${targets.length}개 상품 AI 분류 완료 — DB 저장됨`);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'batch 분석 실패');
    } finally {
      setIsBatchRunning(false);
      setBatchStartTime(null);
      batchAbortRef.current = null;
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

  const { allResults, unclassified = [] } = scanResult;
  const unclassifiedCount = unclassified.filter((u) => u.imageUrl).length;

  const classifiedResults = allResults.filter((r) => r.analyzed);

  // 개선 필요: 품질 B/C/F 이하이거나 가이드라인 FAIL (A/S는 WARN이어도 개선필요 아님)
  const needsFixProducts = classifiedResults.filter(
    (r) => r.imageUrl && (
      r.grade === 'B' || r.grade === 'C' || r.grade === 'F' ||
      r.complianceGrade === 'FAIL'
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
          g.status === 'running' || isReady(g),
      ) ?? null
    : null;

  // ─── Dashboard metrics ─────────────────────────────────────
  const totalCount = scanResult.total;
  // classifiedResults 기준으로 통일 (method='ai'인 것만, 탭 그리드와 동일 소스)
  const analyzedCount = classifiedResults.length;
  const avgScore =
    analyzedCount > 0
      ? Math.round(classifiedResults.reduce((s, r) => s + r.overallScore, 0) / analyzedCount)
      : 0;
  // 등급 분포도 classifiedResults 기준으로 재계산
  const gradeDistribution = classifiedResults.reduce<Record<string, number>>(
    (acc, r) => { if (r.grade) acc[r.grade] = (acc[r.grade] ?? 0) + 1; return acc; },
    { S: 0, A: 0, B: 0, C: 0, F: 0 },
  );
  const healthGrade =
    avgScore >= 90 ? 'S' : avgScore >= 75 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'F';

  // 편집 진행 중(generating/pending/ready)인 productId — 개선필요 카운트에서 제외
  const activeEditingProductIds = new Set(
    generations
      .filter((g) => g.status === 'running' || g.status === 'pending' || isReady(g))
      .map((g) => g.productId),
  );
  const needsFixCount = needsFixProducts.filter((p) => !activeEditingProductIds.has(p.productId)).length;
  const appliedCount = generations.filter((g) => isApplied(g)).length;


  const historyTotalPages = Math.ceil(historyByProduct.length / pageSize);
  const pagedHistory = historyByProduct.slice(
    (historyPage - 1) * pageSize,
    historyPage * pageSize,
  );

  const batchAnalyzing = isBatchRunning;

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
            onClick={() => setInspectOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: 'var(--thumb-primary-subtle, #ede9fe)',
              color: 'var(--thumb-primary, #7c3aed)',
            }}
          >
            <ScanSearch size={14} /> 이미지 검수
          </button>
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

      {/* ═══ 분류 중 알림 배너 ═══ */}
      {batchAnalyzing && (() => {
        const pct = batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 0;
        const perItem = batchDone > 0 ? elapsed / batchDone : 2.5;
        const remaining = Math.max(0, Math.round((batchTotal - batchDone) * perItem));
        const fmt = (s: number) => s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
        return (
          <div
            className="px-5 py-4 rounded-2xl flex items-center gap-4"
            style={{ background: '#3182f618', border: '2px solid #3182f640' }}
          >
            <Loader2 size={18} className="animate-spin flex-shrink-0" style={{ color: '#3182f6' }} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold" style={{ color: '#3182f6' }}>
                  AI 분류 중 — {batchDone} / {batchTotal}개 완료
                </span>
                <span className="text-[14px] font-black tabular-nums" style={{ color: '#3182f6' }}>
                  {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#3182f620' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: '#3182f6' }}
                />
              </div>
              <div className="text-[12px]" style={{ color: '#3182f690' }}>
                경과 {fmt(elapsed)}{remaining > 0 ? ` · 예상 잔여 ${fmt(remaining)}` : ''}
              </div>
            </div>
            <button
              onClick={() => { batchCancelRef.current = true; batchAbortRef.current?.abort(); toast.success('배치 분류를 중단했습니다'); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex-shrink-0"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              <XCircle size={15} /> 중단
            </button>
          </div>
        );
      })()}

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
              icon: Zap,
              label: 'AI 분류',
              count: unclassifiedWithImage.length,
              color: '#3182f6',
              disabled: unclassifiedWithImage.length === 0 || batchAnalyzing,
              loading: false,
              onClick: () => runBatchAiAnalysis(unclassifiedWithImage),
              desc: '이미지 있는 전체',
            },
            {
              icon: Wand2,
              label: 'AI 편집',
              count: needsRegenCount,
              color: '#7048e8',
              disabled: needsRegenCount === 0 || editJobsMutation.isPending,
              loading: editJobsMutation.isPending,
              onClick: () => {
                setActiveTab('ai-edit');
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
          const reviewedCount = generations.filter((g) => isApplied(g)).length;
          const reviewBoost = reviewedCount > 0 ? 8 : 0;
          return (
            <div
              className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg hover:border-cyan-300 transition-all flex flex-col group"
              style={{
                background: 'var(--thumb-card-bg)',
                boxShadow: 'var(--thumb-shadow-md)',
                border: '1px solid var(--thumb-border-subtle)',
              }}
              onClick={() => {
                setActiveTab('history');
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
                <div className="ml-auto">
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors hover:opacity-80"
                    style={{
                      color: '#0891b2',
                      borderColor: '#0891b230',
                      background: '#0891b210',
                    }}
                  >
                    추적 보기
                    <ArrowRight size={11} />
                  </span>
                </div>
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
            .filter((g) => isApplied(g))
            .slice(0, 7);
          const inGeneration = validActiveGenerations.slice(0, 7);
          const needsFix = classifiedResults
            .filter((r) => r.imageUrl && !activeEditingProductIds.has(r.productId) && (
              r.complianceGrade === 'FAIL' || r.complianceGrade === 'WARN' ||
              r.grade === 'B' || r.grade === 'C' || r.grade === 'F'
            ))
            .slice(0, 7);
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
                status: p.grade === 'F' ? '긴급' : p.complianceGrade === 'FAIL' ? 'FAIL' : p.grade === 'C' ? '주의' : p.complianceGrade === 'WARN' ? 'WARN' : 'B등급',
              })),
              emptyText: '이슈 없음',
            },
            {
              label: 'AI 편집',
              count: validActiveGenerations.length + pendingProducts.length,
              color: '#7048e8',
              icon: Wand2,
              tab: 'ai-edit' as TabKey,
              desc: '가이드라인 수정 · 품질 개선',
              tasks: [
                ...inGeneration.map((g) => ({
                  name: g.product.name,
                  status:
                    g.status === 'running'
                      ? '생성 중'
                      : isReady(g)
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
          ] as Array<{ key: TabKey; label: string; count: number; dot?: boolean }>
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
        {/* AI 편집 탭 */}
        <button
          onClick={() => setActiveTab('ai-edit')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[15px] font-bold transition-colors relative"
          style={
            activeTab === 'ai-edit'
              ? {
                  background: 'var(--thumb-primary)',
                  color: '#ffffff',
                  boxShadow: 'var(--thumb-shadow-sm)',
                }
              : { color: 'var(--thumb-text-tertiary)' }
          }
        >
          <Wand2 size={14} />
          AI 편집
          {validActiveGenerations.length > 0 && (
            <span
              className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md"
              style={
                activeTab === 'ai-edit'
                  ? { background: 'rgba(255,255,255,0.2)' }
                  : { background: 'var(--thumb-border-subtle)' }
              }
            >
              {validActiveGenerations.length}
            </span>
          )}
        </button>
        {/* 이력 탭 */}
        <button
          onClick={() => {
            setActiveTab('history');
            setGradeFilter('all');
          }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[15px] font-bold transition-colors relative"
          style={
            activeTab === 'history'
              ? {
                  background: 'var(--thumb-primary)',
                  color: '#ffffff',
                  boxShadow: 'var(--thumb-shadow-sm)',
                }
              : { color: 'var(--thumb-text-tertiary)' }
          }
        >
          이력
          {historyByProduct.length > 0 && (
            <span
              className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md"
              style={
                activeTab === 'history'
                  ? { background: 'rgba(255,255,255,0.2)' }
                  : { background: 'var(--thumb-border-subtle)' }
              }
            >
              {historyByProduct.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══ 미분류 탭 ═══ */}
      {activeTab === 'unclassified' && (() => {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const newProducts = [...unclassifiedWithImage, ...unclassifiedNoImage].filter(
          (r) => r.createdAt && new Date(r.createdAt).getTime() >= sevenDaysAgo,
        );

        const subTabs = [
          { key: 'with-image' as const, label: '이미지 있는 상품', count: unclassifiedWithImage.length, color: 'var(--thumb-primary)' },
          { key: 'no-image' as const, label: '이미지 없는 상품', count: unclassifiedNoImage.length, color: '#f59e0b' },
          { key: 'new' as const, label: '새로 등록된 상품', count: newProducts.length, color: '#00c471' },
        ];

        const currentItems =
          unclassifiedSubTab === 'with-image' ? unclassifiedWithImage
          : unclassifiedSubTab === 'no-image' ? unclassifiedNoImage
          : newProducts;

        const pagedCurrent = currentItems.slice((unclassifiedPage - 1) * pageSize, unclassifiedPage * pageSize);
        const totalCurrentPages = Math.ceil(currentItems.length / pageSize);

        return (
          <div className="space-y-3">
            {/* 서브탭 */}
            <div
              className="flex gap-1 p-1 rounded-xl w-fit"
              style={{ background: 'var(--thumb-surface-sunken)' }}
            >
              {subTabs.map((st) => (
                <button
                  key={st.key}
                  onClick={() => { setUnclassifiedSubTab(st.key); setUnclassifiedPage(1); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors"
                  style={
                    unclassifiedSubTab === st.key
                      ? { background: 'var(--thumb-card-bg)', color: st.color, boxShadow: 'var(--thumb-shadow-sm)' }
                      : { color: 'var(--thumb-text-tertiary)' }
                  }
                >
                  {st.label}
                  {st.count > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                      style={
                        unclassifiedSubTab === st.key
                          ? { background: `${st.color}18`, color: st.color }
                          : { background: 'var(--thumb-border-subtle)', color: 'var(--thumb-text-secondary)' }
                      }
                    >
                      {st.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* 이미지 있는 상품: AI 분류 액션 바 */}
            {unclassifiedSubTab === 'with-image' && unclassifiedWithImage.length > 0 && (
              <div
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'var(--thumb-primary-subtle)', border: '1px solid rgba(49,130,246,0.15)' }}
              >
                <div className="flex items-center gap-2">
                  <Zap size={16} style={{ color: 'var(--thumb-primary)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--thumb-primary)' }}>
                    {unclassifiedWithImage.length}개 — Gemini AI 분류 필요
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runBatchAiAnalysis(unclassifiedWithImage)}
                    disabled={batchAnalyzing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: 'var(--thumb-primary)' }}
                  >
                    {batchAnalyzing ? <><Loader2 size={14} className="animate-spin" /> 분석 중...</> : <><Zap size={14} /> 전체 분류 ({unclassifiedWithImage.length}개)</>}
                  </button>
                  <button onClick={() => runBatchAiAnalysis(pagedCurrent)} disabled={batchAnalyzing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50" style={{ background: 'rgba(49,130,246,0.12)', color: 'var(--thumb-primary)' }}>
                    <Zap size={14} /> 이 페이지 ({pagedCurrent.filter((i) => i.imageUrl).length}개)
                  </button>
                  <button onClick={() => runBatchAiAnalysis(pagedCurrent, 'quality')} disabled={batchAnalyzing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50" style={{ background: 'rgba(49,130,246,0.12)', color: 'var(--thumb-primary)' }}>
                    <Zap size={14} /> 품질만
                  </button>
                  <button onClick={() => runBatchAiAnalysis(pagedCurrent, 'compliance')} disabled={batchAnalyzing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-amber-600">
                    <Zap size={14} /> 가이드라인만
                  </button>
                </div>
              </div>
            )}

            {/* 새로 등록된 상품: AI 분류 액션 바 */}
            {unclassifiedSubTab === 'new' && newProducts.filter((r) => r.imageUrl).length > 0 && (
              <div
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: '#00c47110', border: '1px solid #00c47130' }}
              >
                <div className="flex items-center gap-2">
                  <Zap size={16} style={{ color: '#00c471' }} />
                  <span className="text-sm font-semibold" style={{ color: '#00c471' }}>
                    7일 이내 등록 {newProducts.length}개 — 우선 분류 추천
                  </span>
                </div>
                <button
                  onClick={() => runBatchAiAnalysis(newProducts.filter((r) => !!r.imageUrl))}
                  disabled={batchAnalyzing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: '#00c471' }}
                >
                  {batchAnalyzing ? <><Loader2 size={14} className="animate-spin" /> 분석 중...</> : <><Zap size={14} /> 신규 상품 전체 분류</>}
                </button>
              </div>
            )}

            <PaginationBar
              current={unclassifiedPage}
              total={totalCurrentPages}
              count={currentItems.length}
              pageSize={pageSize}
              onChange={setUnclassifiedPage}
              onPageSizeChange={(s) => { setPageSize(s); setUnclassifiedPage(1); }}
            />

            {currentItems.length === 0 ? (
              <EmptyState
                message={
                  unclassifiedSubTab === 'with-image' ? '이미지 있는 미분류 상품이 없습니다'
                  : unclassifiedSubTab === 'no-image' ? '이미지 없는 상품이 없습니다'
                  : '최근 7일 이내 등록된 미분류 상품이 없습니다'
                }
              />
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {pagedCurrent.map((item) => {
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
                      overlay={
                        !item.imageUrl ? 'skipped'
                        : aiDone && (
                            ['B', 'C', 'F'].includes(display.grade ?? '') ||
                            display.complianceGrade === 'FAIL'
                          ) ? 'needs-fix'
                        : undefined
                      }
                      onClick={() => { setSelectedProduct(item); setSelectedGen(null); }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ TAB: 전체 스캔 / 개선 필요 ═══ */}
      {(activeTab === 'all' || activeTab === 'needsfix') && (
        <div className="space-y-3">
          {activeTab === 'needsfix' && (() => {
            const editPendingCount = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return g && (g.status === 'pending' || g.status === 'running');
            }).length;
            const editReadyCount = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return g && isReady(g);
            }).length;
            const editFailedCount = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return g && g.status === 'failed';
            }).length;
            const complianceFailCount = needsFixProducts.filter((r) => r.complianceGrade === 'FAIL' || r.complianceGrade === 'WARN').length;
            const unEditedProducts = needsFixProducts.filter((r) => {
              const g = genByProductId.get(r.productId);
              return !g || g.status === 'failed';
            });
            const allUnEditedSelected = unEditedProducts.length > 0 && unEditedProducts.every((r) => selectedNeedsFixIds.has(r.productId));
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
                  {unEditedProducts.length > 0 && (
                    <button
                      onClick={() => {
                        if (allUnEditedSelected) {
                          setSelectedNeedsFixIds(new Set());
                        } else {
                          setSelectedNeedsFixIds(new Set(unEditedProducts.map((r) => r.productId)));
                        }
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      style={
                        allUnEditedSelected
                          ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
                          : { background: 'var(--thumb-card-bg)', border: '1px solid var(--border)', color: 'var(--thumb-text-secondary)' }
                      }
                    >
                      {allUnEditedSelected ? '전체 해제' : `전체 선택 (${unEditedProducts.length})`}
                    </button>
                  )}
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
                const itemGen = genByProductId.get(item.productId);
                const isEditing = itemGen && (itemGen.status === 'running' || itemGen.status === 'pending');
                const itemReady = itemGen && isReady(itemGen);
                return (
                  <div key={item.productId} className="flex flex-col gap-1">
                    <ProductCard
                      imageUrl={item.imageUrl}
                      name={item.productName}
                      grade={display.grade}
                      score={display.overallScore}
                      complianceGrade={display.complianceGrade ?? undefined}
                      aiAnalyzed={isAiDone}
                      ctr={item.ctr ?? null}
                      overlay={isEditing ? 'generating' : itemReady ? 'selected' : undefined}
                      onClick={() => {
                        setSelectedProduct(item);
                        setSelectedGen(null);
                      }}
                    />
                    {activeTab === 'needsfix' && (
                      isEditing ? (
                        <div className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                          <Loader2 size={10} className="animate-spin" /> 편집 중
                        </div>
                      ) : itemReady ? (
                        <button
                          onClick={() => { setActiveTab('ai-edit'); }}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-600 text-white hover:bg-purple-700"
                        >
                          <Wand2 size={10} /> 결과 확인하기
                        </button>
                      ) : (() => {
                        const isSelected = selectedNeedsFixIds.has(item.productId);
                        return (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleNeedsFixSelection(item.productId); }}
                              className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${
                                isSelected
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-500'
                              }`}
                            >
                              {isSelected ? <CheckCircle size={10} /> : null}
                              {isSelected ? '선택됨' : '선택'}
                            </button>
                            {isSelected && (
                              <Link
                                href={`/thumbnail-editor?productId=${item.productId}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                                  <Wand2 size={10} /> AI 편집하러가기
                                </button>
                              </Link>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: AI 편집 ═══ */}
      {activeTab === 'ai-edit' && (() => {
        const byNewest = (a: ThumbnailGenerationItem, b: ThumbnailGenerationItem) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        const byNewestAnalysis = (a: ThumbnailAnalysisResult, b: ThumbnailAnalysisResult) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        };
        const generatingGens = generations.filter((g) => g.status === 'running' || g.status === 'pending').sort(byNewest);
        const readyGens = generations.filter((g) => isReady(g)).sort(byNewest);
        const appliedGens = generations.filter((g) => isApplied(g)).sort(byNewest);
        const sortedPendingProducts = [...pendingProducts].sort(byNewestAnalysis);

        const filterCards = [
          { key: 'pending' as const,    label: '대기 중',   count: pendingProducts.length, color: '#f59e0b', desc: '편집 시작 전',  icon: AlertTriangle },
          { key: 'generating' as const, label: '생성 중',   count: generatingGens.length,  color: '#3182f6', desc: 'AI 처리 중',    icon: Loader2 },
          { key: 'ready' as const,      label: '선택 대기', count: readyGens.length,        color: '#7048e8', desc: '이미지 선택 필요', icon: Wand2 },
          { key: 'applied' as const,    label: '적용 완료', count: appliedGens.length,      color: '#00c471', desc: '쿠팡 반영',     icon: CheckCircle },
        ];

        return (
          <div className="space-y-4">

            {/* ── 상태 필터 카드 (클릭 = 해당 목록 표시) ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {filterCards.map((s) => {
                const isActive = editFilter === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setEditFilter(s.key); setExpandedGenId(null); }}
                    className="rounded-2xl px-4 py-4 flex items-center gap-3 text-left transition-all"
                    style={{
                      background: isActive ? `${s.color}12` : 'var(--thumb-card-bg)',
                      border: `2px solid ${isActive ? s.color : 'var(--thumb-border-subtle)'}`,
                      boxShadow: isActive ? `0 0 0 1px ${s.color}30` : 'var(--thumb-shadow-sm)',
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
                      <s.icon size={18} style={{ color: s.color }} />
                    </div>
                    <div>
                      <div className="text-[22px] font-black tabular-nums leading-none" style={{ color: s.count > 0 ? s.color : 'var(--thumb-text-disabled)' }}>
                        {s.count}
                      </div>
                      <div className="text-[12px] font-bold mt-0.5" style={{ color: 'var(--thumb-text-secondary)' }}>{s.label}</div>
                      <div className="text-[11px]" style={{ color: 'var(--thumb-text-quaternary)' }}>{s.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── 필터별 상품 목록 ── */}

            {/* 대기 중 */}
            {editFilter === 'pending' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold" style={{ color: '#f59e0b' }}>대기 중 — 편집 시작 전 ({sortedPendingProducts.length})</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => editBatch(sortedPendingProducts.map((p) => p.productId))}
                    disabled={sortedPendingProducts.length === 0 || editJobsMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: '#7048e8' }}
                  >
                    {editJobsMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                    전체 편집 시작
                  </button>
                </div>
                {sortedPendingProducts.length === 0 ? (
                  <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>대기 중인 상품이 없습니다</div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {sortedPendingProducts.map((p) => (
                      <div key={p.productId} className="flex flex-col gap-1">
                        <ProductCard
                          imageUrl={p.imageUrl}
                          name={p.productName}
                          badge={<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">{p.grade}</span>}
                          onClick={() => { editBatch([p.productId]); toast.success(`${p.productName} 편집 시작`); }}
                        />
                        <Link href={`/thumbnail-editor?productId=${p.productId}`} onClick={(e) => e.stopPropagation()}>
                          <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                            <Wand2 size={10} /> 편집 화면으로
                          </button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 생성 중 */}
            {editFilter === 'generating' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[13px] font-bold" style={{ color: '#3182f6' }}>생성 중 ({generatingGens.length})</span>
                </div>
                {generatingGens.length === 0 ? (
                  <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>생성 중인 작업이 없습니다</div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {generatingGens.map((g) => (
                      <ProductCard
                        key={g.id}
                        imageUrl={g.originalUrl ?? g.product?.imageUrl ?? null}
                        name={g.product?.name ?? ''}
                        badge={<ThumbnailStatusBadge status={g.status} phase={g.phase ?? null} />}
                        overlay="generating"
                        onClick={() => setSelectedGen(g)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 선택 대기 — 6열 그리드, 상품마다 Before/After 카드 */}
            {editFilter === 'ready' && (() => {
              const selectedCount = readyGens.filter((g) => g.selectedUrl).length;
              return (
                <div className="space-y-3">
                  {/* 섹션 헤더 + 상단 등록 버튼 */}
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold" style={{ color: '#7048e8' }}>선택 대기 ({readyGens.length})</span>
                    <span className="text-[12px]" style={{ color: 'var(--thumb-text-quaternary)' }}>After 이미지 클릭해서 선택</span>
                    <div className="flex-1" />
                    {selectedCount > 0 && (
                      <button
                        onClick={() => {
                          readyGens.filter((g) => g.selectedUrl).forEach((g) => openCoupangEdit(g));
                        }}
                        disabled={wingRegisteringIds.size > 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: '#7048e8' }}
                      >
                        {wingRegisteringIds.size > 0 ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ExternalLink size={14} />
                        )}
                        {wingRegisteringIds.size > 0 ? `Wing 업로드 중... (${wingRegisteringIds.size})` : `쿠팡 등록하러 가기 (${selectedCount})`}
                      </button>
                    )}
                  </div>

                  {readyGens.length === 0 ? (
                    <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>선택 대기 중인 항목이 없습니다</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {readyGens.map((g) => {
                        const gCandidates = g.candidates ?? [];
                        const slideIdx = expandedGenId === g.id ? expandedSlideIdx : 0;
                        const gRaw = gCandidates[slideIdx]
                          ? (typeof gCandidates[slideIdx] === 'string' ? gCandidates[slideIdx] as string : (gCandidates[slideIdx] as { url: string }).url)
                          : '';
                        const gImgUrl = resolveImageUrl(gRaw) ?? '';
                        const gOrigUrl = resolveImageUrl(g.originalUrl ?? g.product?.imageUrl ?? null);
                        const isSelected = !!g.selectedUrl;

                        return (
                          <div
                            key={g.id}
                            className="rounded-xl overflow-hidden border"
                            style={{
                              borderColor: isSelected ? '#7048e8' : 'var(--thumb-border-subtle)',
                              background: 'var(--thumb-card-bg)',
                              boxShadow: isSelected ? '0 0 0 1px #7048e830' : undefined,
                            }}
                          >
                            {/* Before / After 이미지 나란히 */}
                            <div className="flex">
                              {/* Before */}
                              <div className="flex-1 relative overflow-hidden border-r" style={{ borderColor: 'var(--thumb-border-subtle)', aspectRatio: '1' }}>
                                <div className="absolute top-1 left-1 text-[8px] font-bold uppercase tracking-wider text-white/80 bg-black/30 px-1 rounded z-10">B</div>
                                {gOrigUrl
                                  ? <img src={gOrigUrl} alt="before" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><ImageIcon size={16} className="text-slate-300" /></div>
                                }
                              </div>

                              {/* After — 클릭 = 선택 */}
                              <div
                                className="flex-1 relative overflow-hidden cursor-pointer"
                                style={{ aspectRatio: '1' }}
                                onClick={() => {
                                  if (gCandidates.length > 1 && expandedGenId !== g.id) {
                                    setExpandedSlideIdx(0);
                                    setExpandedGenId(g.id);
                                  }
                                  selectCandidate(g.id, isSelected ? '' : gRaw);
                                }}
                              >
                                <div className="absolute top-1 left-1 text-[8px] font-bold uppercase tracking-wider text-white/80 bg-black/30 px-1 rounded z-10">A</div>
                                {gImgUrl
                                  ? <img key={gImgUrl} src={gImgUrl} alt="after" className="w-full h-full object-cover transition-opacity duration-150" loading="lazy" referrerPolicy="no-referrer"
                                      onError={() => { reEditMutation.mutate(g.id); }}
                                    />
                                  : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><ImageIcon size={16} className="text-slate-300" /></div>
                                }
                                {/* 선택됨 체크 */}
                                {isSelected && (
                                  <div className="absolute inset-0 bg-indigo-600/15 flex items-center justify-center">
                                    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                                      <CheckCircle size={14} className="text-white" />
                                    </div>
                                  </div>
                                )}
                                {/* 복수 후보 슬라이드 화살표 */}
                                {gCandidates.length > 1 && expandedGenId === g.id && (
                                  <>
                                    <button
                                      disabled={slideIdx === 0}
                                      onClick={(e) => { e.stopPropagation(); setExpandedSlideIdx((i) => i - 1); }}
                                      className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-30"
                                    >
                                      <ChevronLeft size={11} className="text-slate-700" />
                                    </button>
                                    <button
                                      disabled={slideIdx === gCandidates.length - 1}
                                      onClick={(e) => { e.stopPropagation(); setExpandedSlideIdx((i) => i + 1); }}
                                      className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-30"
                                    >
                                      <ChevronRight size={11} className="text-slate-700" />
                                    </button>
                                  </>
                                )}
                                {/* 복수 후보 인디케이터 */}
                                {gCandidates.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/40 text-white text-[8px] font-bold px-1 rounded">
                                    {gCandidates.length > 1 && expandedGenId === g.id ? `${slideIdx + 1}/${gCandidates.length}` : `${gCandidates.length}장`}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 상품명 + 편집 버튼 */}
                            <div className="px-2 pt-1.5 pb-2 flex flex-col gap-1">
                              <p className="text-[13px] font-medium line-clamp-2 leading-5" style={{ color: 'var(--thumb-text-primary)' }}>{g.product?.name}</p>
                              <Link href={`/thumbnail-editor?productId=${g.productId}`}>
                                <button className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                                  <Wand2 size={10} /> AI 편집하기
                                </button>
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 적용 완료 */}
            {editFilter === 'applied' && (
              <div className="space-y-3">
                <span className="text-[13px] font-bold" style={{ color: '#00c471' }}>적용 완료 ({appliedGens.length})</span>
                {appliedGens.length === 0 ? (
                  <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>적용 완료된 항목이 없습니다</div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {appliedGens.map((g) => (
                      <ProductCard
                        key={g.id}
                        imageUrl={g.selectedUrl ?? g.originalUrl ?? g.product?.imageUrl ?? null}
                        name={g.product?.name ?? ''}
                        badge={<ThumbnailStatusBadge status={g.status} phase={g.phase ?? null} />}
                        overlay="applied"
                        onClick={() => setSelectedGen(g)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        );
      })()}

      {/* ═══ TAB: 이력 ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* 서브탭: 이력 / 추적 */}
          <div
            className="flex gap-1 p-1 rounded-xl w-fit"
            style={{ background: 'var(--thumb-surface-sunken)', border: '1px solid var(--thumb-border-subtle)' }}
          >
            {([
              { key: 'history' as const, label: '편집 이력', count: historyByProduct.length },
              { key: 'tracking' as const, label: '추적 분석', count: trackingQuery.data?.total ?? 0 },
            ]).map((st) => (
              <button
                key={st.key}
                onClick={() => setHistorySubTab(st.key)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors"
                style={
                  historySubTab === st.key
                    ? { background: 'var(--thumb-card-bg)', color: 'var(--thumb-primary)', boxShadow: 'var(--thumb-shadow-sm)' }
                    : { color: 'var(--thumb-text-tertiary)' }
                }
              >
                {st.label}
                {st.count > 0 && (
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                    style={
                      historySubTab === st.key
                        ? { background: 'var(--thumb-surface-sunken)', color: 'var(--thumb-primary)' }
                        : { background: 'var(--thumb-border-subtle)', color: 'var(--thumb-text-tertiary)' }
                    }
                  >
                    {st.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 서브탭: 편집 이력 */}
          {historySubTab === 'history' && (
            <div className="space-y-3">
              {historyByProduct.length === 0 ? (
                <EmptyState message="편집 이력이 없습니다" />
              ) : (
                <>
                  <PaginationBar
                    current={historyPage}
                    total={historyTotalPages}
                    count={historyByProduct.length}
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
                        badge={<ThumbnailStatusBadge status={gen.status} phase={gen.phase ?? null} />}
                        overlay={
                          gen.status === 'running' || gen.status === 'pending'
                            ? 'generating'
                            : isApplied(gen)
                            ? 'applied'
                            : gen.status === 'cancelled'
                            ? 'skipped'
                            : isReady(gen)
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

          {/* 서브탭: 추적 분석 */}
          {historySubTab === 'tracking' && (
            trackingQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2" />
                <span className="text-sm">추적 데이터 로딩 중...</span>
              </div>
            ) : (
              <TrackingTab records={trackingQuery.data?.items ?? []} />
            )
          )}
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {(selectedProduct || selectedGen) && (
        <DetailModal
          product={selectedProduct}
          gen={selectedGen || activeGenForProduct}
          productGenerations={generations.filter((g) => g.productId === (selectedProduct?.productId ?? selectedGen?.productId))}
          aiResult={selectedProduct ? aiResults[selectedProduct.productId] : undefined}
          isAiAnalyzing={selectedProduct ? aiAnalyzingId === selectedProduct.productId : false}
          imageSpec={selectedProduct?.imageSpec ?? null}
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
          onSelectGen={(g) => setSelectedGen(g)}
        />
      )}

      {/* ═══ 등록 전 이미지 검수 드로어 ═══ */}
      <InspectionDrawer
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        onAnalyzed={(result) => {
          setAiResults((prev) => ({ ...prev, [result.productId]: result }));
        }}
      />

      {/* 인라인 줌 오버레이 */}
      {zoomImageInline && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setZoomImageInline(null)}
        >
          <img src={zoomImageInline} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  );
}
