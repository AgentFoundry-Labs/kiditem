"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ImageIcon,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Scan,
  Lightbulb,
  Wand2,
  ExternalLink,
  Check,
  SkipForward,
  Clock,
  Loader2,
  ArrowRight,
  Sparkles,
  Copy,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Target,
  Search,
} from "lucide-react";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { apiClient } from "@/lib/api-client";

// ─── kiditem API adapter — maps coupang_seller URLs to kiditem NestJS endpoints ────
async function thumbFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const bodyStr = typeof init?.body === "string" ? init.body : null;
  const body = bodyStr ? JSON.parse(bodyStr) : {};

  const ok = (data: unknown) =>
    new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  const fail = (status: number, err: string) =>
    new Response(JSON.stringify({ error: err }), { status, headers: { "Content-Type": "application/json" } });

  try {
    // GET /api/thumbnails/analyze → kiditem GET /api/thumbnail-analysis
    if (url === "/api/thumbnails/analyze" && method === "GET") {
      const data = await apiClient.get<{ total: number; analyzed: number; unclassifiedCount: number; gradeDistribution: Record<string, number>; allResults: Array<Record<string, unknown>>; unclassified: Array<Record<string, unknown>> }>("/api/thumbnail-analysis");
      // kiditem items have `method: "ai"|"rule"|"none"` + `analyzed:boolean`; coupang expects `analysisMethod: "ai"|"rule"`
      const mapItem = (i: Record<string, unknown>) => ({
        ...i,
        analysisMethod: i.method === "ai" ? "ai" : i.method === "rule" ? "rule" : (i.analyzed ? "rule" : "rule"),
      });
      return ok({
        total: data.total,
        analyzed: data.analyzed,
        unclassifiedCount: data.unclassifiedCount,
        gradeDistribution: data.gradeDistribution,
        allResults: data.allResults.map(mapItem),
        unclassified: data.unclassified.map(mapItem),
      });
    }

    // POST /api/thumbnails/analyze → kiditem POST /api/thumbnail-analysis/analyze
    if (url === "/api/thumbnails/analyze" && method === "POST") {
      const data = await apiClient.post<Record<string, unknown>>("/api/thumbnail-analysis/analyze", body);
      return ok({ ...data, analysisMethod: data.method === "ai" ? "ai" : "rule" });
    }

    // GET /api/thumbnails/generate → kiditem GET /api/thumbnail-analysis/generations (returns {items, ...})
    if (url === "/api/thumbnails/generate" && method === "GET") {
      const data = await apiClient.get<{ items: unknown[] } | unknown[]>("/api/thumbnail-analysis/generations?limit=200");
      const items = Array.isArray(data) ? data : data.items;
      return ok(items);
    }

    // POST /api/thumbnails/generate → kiditem POST /api/thumbnail-analysis/generations
    if (url === "/api/thumbnails/generate" && method === "POST") {
      const data = await apiClient.post<unknown[]>("/api/thumbnail-analysis/generations", body);
      return ok(data);
    }

    // PUT /api/thumbnails/generate → kiditem action endpoints by generationId
    if (url === "/api/thumbnails/generate" && method === "PUT") {
      const { generationId, action, selectedUrl } = body as { generationId: string; action: string; selectedUrl?: string };
      if (action === "select") {
        const data = await apiClient.put<unknown>(`/api/thumbnail-analysis/generations/${generationId}/select`, { selectedUrl });
        return ok(data);
      }
      if (action === "apply") {
        const data = await apiClient.put<unknown>(`/api/thumbnail-analysis/generations/${generationId}/apply`, {});
        return ok(data);
      }
      if (action === "skip") {
        const data = await apiClient.put<unknown>(`/api/thumbnail-analysis/generations/${generationId}/skip`, {});
        return ok(data);
      }
      return fail(400, `unknown action: ${action}`);
    }

    // GET /api/thumbnails/batch-analyze → kiditem has no background batch; report no active batch
    if (url === "/api/thumbnails/batch-analyze" && method === "GET") {
      return ok({ batch: null });
    }

    // POST /api/thumbnails/batch-analyze → kiditem POST /api/thumbnail-analysis/analyze-batch (synchronous)
    if (url === "/api/thumbnails/batch-analyze" && method === "POST") {
      const productIds = (body as { productIds: string[] }).productIds ?? [];
      await apiClient.post<unknown>("/api/thumbnail-analysis/analyze-batch", { productIds });
      return ok({ batch: { total: productIds.length, done: productIds.length, status: "completed" } });
    }

    // DELETE /api/thumbnails/batch-analyze → kiditem has no cancellable batch
    if (url === "/api/thumbnails/batch-analyze" && method === "DELETE") {
      return ok({ ok: true });
    }

    return fail(404, `Unmapped URL: ${method} ${url}`);
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "요청 실패");
  }
}

// ─── Types ───────────────────────────────────────────────────────

interface ThumbnailIssue {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

interface AnalysisScores {
  guideline: number;
  heroShot: number;
  composition: number;
  branding: number;
  mobile: number;
}

interface AnalysisResult {
  productId: string;
  productName: string;
  imageUrl: string;
  overallScore: number;
  grade: "S" | "A" | "B" | "C" | "F";
  scores?: AnalysisScores;
  issues: ThumbnailIssue[];
  suggestions: string[];
  analysisMethod: "ai" | "rule";
}

interface ScanResult {
  total: number;
  analyzed: number;
  unclassifiedCount: number;
  gradeDistribution: Record<string, number>;
  allResults: AnalysisResult[];
  unclassified: AnalysisResult[];
}

interface GenerationItem {
  id: string;
  productId: string;
  originalUrl: string | null;
  candidates: string[];
  selectedUrl: string | null;
  status: "pending" | "generating" | "ready" | "applied" | "skipped";
  grade: string;
  score: number;
  createdAt: string;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    coupangId: string | null;
    vendorItemId: string | null;
    category: string | null;
    sellPrice: number;
    abcGrade: string;
  };
}

type TabKey = "unclassified" | "all" | "needsfix" | "queue" | "history" | "tracking";

// ─── Main Page ───────────────────────────────────────────────────

export default function ThumbnailsPage() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal for detail / generation
  const [selectedProduct, setSelectedProduct] = useState<AnalysisResult | null>(null);
  const [selectedGen, setSelectedGen] = useState<GenerationItem | null>(null);

  // AI analysis
  const [aiAnalyzing, setAiAnalyzing] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AnalysisResult>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [batchAi, setBatchAi] = useState<{ running: boolean; total: number; done: number; current: string }>({ running: false, total: 0, done: 0, current: "" });
  const batchPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Generation
  const [generations, setGenerations] = useState<GenerationItem[]>([]);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Pagination
  const [gradeFilter, setGradeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [unclassifiedPage, setUnclassifiedPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // ─── Data Fetching ──────────────────────────────────────────

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await thumbFetch("/api/thumbnails/analyze");
      if (!r.ok) throw new Error("분석 실패");
      const data = await r.json();
      setScanResult(data);
      return data as ScanResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 조용한 refresh — loading state 토글 없이 데이터만 업데이트 (polling용)
  const silentRescan = useCallback(async () => {
    try {
      const r = await thumbFetch("/api/thumbnails/analyze");
      if (!r.ok) return;
      const data = await r.json();
      setScanResult(data);
    } catch {
      // 무시
    }
  }, []);

  const fetchGenerations = useCallback(() => {
   thumbFetch("/api/thumbnails/generate")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGenerations(data);
      })
      .catch(() => {});
  }, []);

  // 페이지 로드 시 스캔만 실행 (자동 AI 분류 하지 않음 — 유저가 명시적으로 요청해야 함)
  useEffect(() => {
    runScan();
    fetchGenerations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived Data ───────────────────────────────────────────
  // 주의: F/C grade products는 classifiedResults 기반으로 계산되므로 아래 unwrap 후 정의됨
  const generatedProductIds = new Set(generations.map((g) => g.productId));
  const activeGenerations = generations.filter((g) => ["pending", "generating", "ready"].includes(g.status));
  const completedGenerations = generations.filter((g) => ["applied", "skipped"].includes(g.status));

  // ─── Actions ────────────────────────────────────────────────

  const generateSingle = async (productId: string) => {
    setGeneratingIds((prev) => new Set(prev).add(productId));
    try {
      const r = await thumbFetch("/api/thumbnails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [productId] }),
      });
      const data = await r.json();
      if (Array.isArray(data)) {
        setGenerations((prev) => {
          const existingIds = new Set(prev.map((g) => g.id));
          const newItems = data.filter((d: GenerationItem) => !existingIds.has(d.id));
          return [...newItems, ...prev];
        });
        // 생성 완료 시 모달 업데이트
        const genItem = data.find((d: GenerationItem) => d.productId === productId);
        if (genItem) setSelectedGen(genItem);
      }
    } catch {
      // ignore
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const generateBatch = async () => {
    // F·C 등급(개선 필요) 모두 재생성
    const ids = pendingProducts.map((p) => p.productId);
    if (!ids.length) return;
    setBatchGenerating(true);
    try {
      const r = await thumbFetch("/api/thumbnails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
      });
      const data = await r.json();
      if (Array.isArray(data)) {
        setGenerations((prev) => {
          const existingIds = new Set(prev.map((g) => g.id));
          const newItems = data.filter((d: GenerationItem) => !existingIds.has(d.id));
          return [...newItems, ...prev];
        });
      }
    } catch {
      // ignore
    } finally {
      setBatchGenerating(false);
    }
  };

  const selectCandidate = async (generationId: string, selectedUrl: string) => {
    try {
      await thumbFetch("/api/thumbnails/generate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, action: "select", selectedUrl }),
      });
      setGenerations((prev) =>
        prev.map((g) => (g.id === generationId ? { ...g, selectedUrl, status: "ready" as const } : g))
      );
      if (selectedGen?.id === generationId) {
        setSelectedGen((prev) => prev ? { ...prev, selectedUrl, status: "ready" } : prev);
      }
    } catch {
      // ignore
    }
  };

  const markApplied = async (generationId: string) => {
    try {
      await thumbFetch("/api/thumbnails/generate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, action: "apply" }),
      });
      setGenerations((prev) =>
        prev.map((g) => (g.id === generationId ? { ...g, status: "applied" as const } : g))
      );
    } catch {
      // ignore
    }
  };

  const skipGeneration = async (generationId: string) => {
    try {
      await thumbFetch("/api/thumbnails/generate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, action: "skip" }),
      });
      setGenerations((prev) =>
        prev.map((g) => (g.id === generationId ? { ...g, status: "skipped" as const } : g))
      );
      setSelectedGen(null);
      setSelectedProduct(null);
    } catch {
      // ignore
    }
  };

  const openCoupangEdit = (gen: GenerationItem) => {
    window.open(
      "https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1",
      "_blank"
    );
    markApplied(gen.id);
    setSelectedGen(null);
    setSelectedProduct(null);
  };

  const runAiAnalysis = async (productId: string) => {
    setAiAnalyzing(productId);
    try {
      const r = await thumbFetch("/api/thumbnails/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await r.json();
      setAiResults((prev) => ({ ...prev, [productId]: data }));
      const method = data.analysisMethod === "ai" ? "Gemini Vision" : "룰 기반";
      setToast({ message: `${data.grade}등급 (${data.overallScore}점) — ${method} 분석 완료`, type: "success" });
      setTimeout(() => setToast(null), 4000);
    } catch {
      setToast({ message: "AI 분석 실패", type: "error" });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setAiAnalyzing(null);
    }
  };

  // batch progress polling — 백그라운드 batch 진행 상황 추적
  const startBatchPolling = useCallback(() => {
    if (batchPollingRef.current) return;
    let tickCount = 0;
    batchPollingRef.current = setInterval(async () => {
      try {
        const r = await thumbFetch("/api/thumbnails/batch-analyze");
        const data = await r.json();
        const batch = data.batch;
        if (!batch) {
          setBatchAi({ running: false, total: 0, done: 0, current: "" });
          if (batchPollingRef.current) { clearInterval(batchPollingRef.current); batchPollingRef.current = null; }
          return;
        }
        setBatchAi({
          running: batch.status === "running",
          total: batch.total,
          done: batch.done,
          current: batch.current || "",
        });
        // 완료/중단되면 polling 중지 + DB 새로고침 (silent)
        if (batch.status !== "running") {
          if (batchPollingRef.current) { clearInterval(batchPollingRef.current); batchPollingRef.current = null; }
          const msg = batch.status === "cancelled"
            ? `AI 분류 중단됨 (${batch.done}/${batch.total}개 완료)`
            : batch.status === "error"
              ? `AI 분류 오류 — ${batch.error || "알 수 없음"}`
              : `${batch.total}개 상품 AI 분류 완료 — DB 저장됨`;
          setToast({ message: msg, type: batch.status === "completed" ? "success" : "error" });
          setTimeout(() => setToast(null), 4000);
          silentRescan();
        } else {
          // 진행 중일 때는 5번에 한 번만 scanResult 새로고침 (10초마다, silent)
          tickCount++;
          if (tickCount % 5 === 0) silentRescan();
        }
      } catch {
        // polling 에러는 스킵
      }
    }, 2000);
  }, [silentRescan]);

  // 페이지 로드 시 진행 중인 batch가 있으면 polling 재개
  useEffect(() => {
   thumbFetch("/api/thumbnails/batch-analyze")
      .then((r) => r.json())
      .then((data) => {
        if (data.batch && data.batch.status === "running") {
          setBatchAi({
            running: true,
            total: data.batch.total,
            done: data.batch.done,
            current: data.batch.current || "",
          });
          startBatchPolling();
        }
      })
      .catch(() => {});
    return () => {
      if (batchPollingRef.current) { clearInterval(batchPollingRef.current); batchPollingRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 백그라운드 batch 시작
  const runBatchAiAnalysis = async (items: AnalysisResult[]) => {
    // 이미지 있고 아직 AI 분석 안 한 것만
    const targets = items.filter((i) => i.imageUrl && !aiResults[i.productId]);
    if (targets.length === 0) {
      setToast({ message: "분석할 상품이 없습니다 (이미지 없거나 이미 분석됨)", type: "error" });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    try {
      const r = await thumbFetch("/api/thumbnails/batch-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: targets.map(t => t.productId) }),
      });
      const data = await r.json();
      if (!r.ok) {
        setToast({ message: data.error || "batch 시작 실패", type: "error" });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      setBatchAi({ running: true, total: data.batch.total, done: 0, current: "" });
      setToast({ message: `${targets.length}개 백그라운드 분류 시작 — 새로고침해도 계속 진행됩니다`, type: "success" });
      setTimeout(() => setToast(null), 4000);
      startBatchPolling();
    } catch (err) {
      setToast({ message: `batch 시작 오류: ${err instanceof Error ? err.message : "알 수 없음"}`, type: "error" });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // batch 중단
  const cancelBatch = useCallback(async () => {
    try {
      await thumbFetch("/api/thumbnails/batch-analyze", { method: "DELETE" });
    } catch {
      // 무시
    }
  }, []);

  // ─── Render ─────────────────────────────────────────────────

  if (loading) return <PageSkeleton variant="cards" />;
  if (error) return <ErrorState message={error} onRetry={runScan} />;
  if (!scanResult) return <EmptyState message="스캔 결과 없음" />;

  const { gradeDistribution, allResults, unclassified = [] } = scanResult;
  const fCount = gradeDistribution["F"] || 0;
  // 미분류 카운트는 "이미지 있는 것" 기준 (실제 AI 분류 가능한 상품)
  const unclassifiedCount = unclassified.filter(u => u.imageUrl).length;

  // 분류된 상품만 (AI 분석 완료)
  const classifiedResults = allResults.filter((r) => r.analysisMethod === "ai");

  // 개선 필요한 상품 (분류된 것 중 F·C등급, 이미지 있는 것만) — 재생성 대상
  const fGradeProducts = classifiedResults.filter((r) => r.grade === "F" && r.imageUrl);
  const cGradeProducts = classifiedResults.filter((r) => r.grade === "C" && r.imageUrl);
  const queueProducts = [...fGradeProducts, ...cGradeProducts];
  const pendingProducts = queueProducts.filter((p) => !generatedProductIds.has(p.productId));

  // 유효한 진행 중 generation: 현재 F·C 등급인 것만 (stale data 제외)
  const needsFixIds = new Set(queueProducts.map(p => p.productId));
  const validActiveGenerations = activeGenerations.filter(g => needsFixIds.has(g.productId));

  // 검색 필터
  const sq = searchQuery.trim().toLowerCase();
  const searchFilter = (r: AnalysisResult) => !sq || r.productName.toLowerCase().includes(sq);

  // All tab filter (분류된 것만)
  // 개선 필요 탭은 항상 F·C 등급만
  const filtered = (
    activeTab === "needsfix"
      ? classifiedResults.filter((r) => r.grade === "F" || r.grade === "C")
      : gradeFilter === "all"
        ? classifiedResults
        : gradeFilter === "critical"
          ? classifiedResults.filter((r) => r.issues.some((i) => i.severity === "critical"))
          : classifiedResults.filter((r) => r.grade === gradeFilter)
  ).filter(searchFilter);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 미분류 탭 페이지네이션
  const unclassifiedWithImage = unclassified.filter((r) => r.imageUrl).filter(searchFilter);
  const unclassifiedNoImage = unclassified.filter((r) => !r.imageUrl).filter(searchFilter);
  const unclassifiedPages = Math.ceil(unclassifiedWithImage.length / pageSize);
  const pagedUnclassified = unclassifiedWithImage.slice((unclassifiedPage - 1) * pageSize, unclassifiedPage * pageSize);
  const noImagePages = Math.ceil(unclassifiedNoImage.length / pageSize);
  const pagedNoImage = unclassifiedNoImage.slice((unclassifiedPage - 1) * pageSize, unclassifiedPage * pageSize);

  // 현재 선택한 상품의 generation 데이터 찾기
  const activeGenForProduct = selectedProduct
    ? generations.find((g) => g.productId === selectedProduct.productId && ["generating", "ready"].includes(g.status))
    : null;

  // ─── Dashboard Metrics ──────────────────────────────────────
  const totalCount = scanResult.total;
  const analyzedCount = scanResult.analyzed;
  const avgScore = analyzedCount > 0 ? Math.round(classifiedResults.reduce((s, r) => s + r.overallScore, 0) / analyzedCount) : 0;
  const healthGrade = avgScore >= 90 ? "S" : avgScore >= 75 ? "A" : avgScore >= 60 ? "B" : avgScore >= 40 ? "C" : "F";
  const goodCount = (gradeDistribution["S"] || 0) + (gradeDistribution["A"] || 0);
  const goodRate = analyzedCount > 0 ? Math.round(goodCount / analyzedCount * 100) : 0;
  const criticalCount = classifiedResults.filter((r) => r.issues.some((i) => i.severity === "critical")).length;
  const classifiedPct = totalCount > 0 ? Math.round(analyzedCount / totalCount * 100) : 0;

  // Pipeline metrics
  const cCount = gradeDistribution["C"] || 0;
  const needsFixCount = fCount + cCount;
  const readyGenCount = validActiveGenerations.filter(g => g.status === "ready").length;
  const appliedCount = completedGenerations.filter(g => g.status === "applied").length;

  // Queue tab pagination
  const allQueueItems = [...validActiveGenerations.map(g => ({ type: "gen" as const, gen: g })), ...pendingProducts.map(p => ({ type: "pending" as const, product: p }))];
  const queueTotalPages = Math.ceil(allQueueItems.length / pageSize);
  const pagedQueue = allQueueItems.slice((queuePage - 1) * pageSize, queuePage * pageSize);

  // History pagination
  const historyTotalPages = Math.ceil(completedGenerations.length / pageSize);
  const pagedHistory = completedGenerations.slice((historyPage - 1) * pageSize, historyPage * pageSize);

  return (
    <div className="space-y-4 animate-in">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Thumbnail AI</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{totalCount}개 상품</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}>평균 {avgScore}점 · {healthGrade}등급</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 검색 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); setUnclassifiedPage(1); }}
              placeholder="상품명 검색..."
              className="pl-8 pr-3 py-2 rounded-xl text-sm w-52"
              style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
          <button
            onClick={() => { runScan(); fetchGenerations(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
          >
            <RefreshCw size={14} /> 재스캔
          </button>
        </div>
      </div>

      {/* ═══ AI 분류 진행 배너 ═══ */}
      {batchAi.running && (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--primary-subtle)", border: "1px solid rgba(49,130,246,0.15)" }}>
          <Loader2 size={16} className="flex-shrink-0 animate-spin" style={{ color: "var(--primary)" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: "var(--primary)" }}>AI 분류 중 ({batchAi.done}/{batchAi.total})</span>
              {batchAi.current && <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{batchAi.current}</span>}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: "rgba(49,130,246,0.1)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${batchAi.total > 0 ? (batchAi.done / batchAi.total) * 100 : 0}%`, background: "var(--primary)" }} />
            </div>
          </div>
          <button onClick={cancelBatch} className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium" style={{ background: "rgba(49,130,246,0.12)", color: "var(--primary)" }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg animate-in" style={{ background: toast.type === "success" ? "var(--success)" : "var(--danger)", color: "#fff" }}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span className="text-sm font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 rounded hover:bg-white/20"><X size={12} /></button>
        </div>
      )}

      {/* ═══ 등급 분포 + KPI ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* 등급 분포 — 세련된 도넛 */}
        <div className="lg:col-span-2 rounded-2xl px-5 py-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>등급 분포</span>
            <span className="text-[12px] tabular-nums px-2.5 py-1 rounded-md font-semibold" style={{ color: "var(--text-secondary)", background: "var(--surface-sunken)" }}>분류 {analyzedCount}개</span>
          </div>
          {(() => {
            // 한글 등급 라벨 (5단계)
            const gradeLabel: Record<string, string> = { S: "양호", A: "보통", B: "주의", C: "미흡", F: "위험" };
            // 솔리드 색상 (badge용)
            const solidColors: Record<string, string> = { S: "#10b981", A: "#3b82f6", B: "#f59e0b", C: "#f97316", F: "#ef4444" };
            // 그라데이션 (progress bar용)
            const grads: Record<string, string> = {
              S: "linear-gradient(90deg, #a7f3d0, #34d399, #059669)",
              A: "linear-gradient(90deg, #bfdbfe, #60a5fa, #2563eb)",
              B: "linear-gradient(90deg, #fef3c7, #fbbf24, #d97706)",
              C: "linear-gradient(90deg, #fed7aa, #fb923c, #ea580c)",
              F: "linear-gradient(90deg, #fecaca, #f87171, #dc2626)",
            };
            return (
              <div className="flex items-center gap-5">
                {/* 도넛 — 더 키움 */}
                <div className="relative w-56 h-56 flex-shrink-0">
                  <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                    <defs>
                      <linearGradient id="gradS" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#a7f3d0" /><stop offset="50%" stopColor="#34d399" /><stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="gradA" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#bfdbfe" /><stop offset="50%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                      <linearGradient id="gradB" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fef3c7" /><stop offset="50%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                      <linearGradient id="gradC" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fed7aa" /><stop offset="50%" stopColor="#fb923c" /><stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                      <linearGradient id="gradF" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fecaca" /><stop offset="50%" stopColor="#f87171" /><stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                      <filter id="donutShadow" x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity="0.18" />
                      </filter>
                    </defs>
                    <circle cx="100" cy="100" r="78" fill="none" stroke="var(--surface-sunken)" strokeWidth="22" />
                    {(() => {
                      const r = 78; const circumference = 2 * Math.PI * r; let offset = 0;
                      const gradMap: Record<string, string> = { S: "url(#gradS)", A: "url(#gradA)", B: "url(#gradB)", C: "url(#gradC)", F: "url(#gradF)" };
                      return (["S", "A", "B", "C", "F"] as const).map((g) => {
                        const count = gradeDistribution[g] || 0;
                        const pct = analyzedCount > 0 ? count / analyzedCount : 0;
                        const dash = pct * circumference; const currentOffset = offset;
                        offset += dash;
                        if (dash === 0) return null;
                        return (
                          <circle key={g} cx="100" cy="100" r={r} fill="none" stroke={gradMap[g]} strokeWidth="22"
                            strokeDasharray={`${dash - 2} ${circumference - dash + 2}`} strokeDashoffset={-currentOffset}
                            strokeLinecap="round"
                            filter="url(#donutShadow)"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => { setActiveTab("all"); setGradeFilter(g); setPage(1); }}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[52px] font-black tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>{avgScore}</span>
                    <span className="text-[13px] font-black mt-2 px-3 py-1 rounded-md text-white" style={{ background: solidColors[healthGrade] }}>{gradeLabel[healthGrade]}</span>
                  </div>
                </div>
                {/* 등급 리스트 — 굵은 progress bar */}
                <div className="flex-1 space-y-3">
                  {(["S", "A", "B", "C", "F"] as const).map((g) => {
                    const count = gradeDistribution[g] || 0;
                    const pct = analyzedCount > 0 ? Math.round((count / analyzedCount) * 100) : 0;
                    return (
                      <button key={g} onClick={() => { setActiveTab("all"); setGradeFilter(g); setPage(1); }} className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <span className="text-[15px] font-black w-5 text-left shrink-0" style={{ color: solidColors[g] }}>{g}</span>
                        <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`, background: grads[g] }} />
                        </div>
                        <span className="text-[14px] font-black tabular-nums w-16 text-right shrink-0" style={{ color: "var(--text-primary)" }}>{count}<span className="ml-1.5 text-[11px] font-semibold" style={{ color: "var(--text-quaternary)" }}>{pct}%</span></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* KPI 3개 */}
        {/* AI 액션 센터 — 바로 실행 가능한 작업 버튼 */}
        {(() => {
          const noImageCount = unclassifiedNoImage.length;
          // 개선 필요 = F·C 등급 (분류된 것 중)
          const needsRegenCount = pendingProducts.length;
          const actions = [
            {
              icon: Zap,
              label: "AI 분류",
              count: unclassifiedWithImage.length,
              color: "#3182f6",
              disabled: unclassifiedWithImage.length === 0 || batchAi.running,
              loading: batchAi.running,
              onClick: () => runBatchAiAnalysis(unclassifiedWithImage),
              desc: "Gemini Vision 일괄",
            },
            {
              icon: Wand2,
              label: "AI 재생성",
              count: needsRegenCount,
              color: "#7048e8",
              disabled: needsRegenCount === 0 || batchGenerating,
              loading: batchGenerating,
              onClick: () => { setActiveTab("queue"); generateBatch(); },
              desc: "개선 필요 상품 재생성",
            },
            {
              icon: ImageIcon,
              label: "이미지 등록 필요",
              count: noImageCount,
              color: "#f59e0b",
              disabled: noImageCount === 0,
              loading: false,
              onClick: () => { setActiveTab("unclassified"); setUnclassifiedPage(1); },
              desc: "수동 업로드",
            },
          ];
          return (
            <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "none" }}>
              {actions.map((a, i) => (
                <button
                  key={i}
                  onClick={a.onClick}
                  disabled={a.disabled}
                  className="action-btn flex-1 w-full flex items-center gap-3 px-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed relative"
                  style={{
                    background: a.disabled ? "var(--surface-sunken)" : `linear-gradient(135deg, ${a.color}18, ${a.color}06)`,
                    borderBottom: i < actions.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    ["--hover-bg" as string]: `linear-gradient(135deg, ${a.color}30, ${a.color}15)`,
                  }}
                  onMouseEnter={(e) => { if (!a.disabled) e.currentTarget.style.background = `linear-gradient(135deg, ${a.color}30, ${a.color}15)`; }}
                  onMouseLeave={(e) => { if (!a.disabled) e.currentTarget.style.background = `linear-gradient(135deg, ${a.color}18, ${a.color}06)`; }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md" style={{ background: a.disabled ? "var(--border)" : `linear-gradient(135deg, ${a.color}, ${a.color}cc)` }}>
                    {a.loading ? <Loader2 size={20} className="animate-spin text-white" /> : <a.icon size={20} className="text-white" />}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[14px] font-black truncate" style={{ color: a.disabled ? "var(--text-quaternary)" : a.color }}>{a.label}</div>
                    <div className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>{a.desc}</div>
                  </div>
                  <span className="text-[24px] font-black tabular-nums shrink-0" style={{ color: a.disabled ? "var(--text-quaternary)" : a.color }}>{a.count}</span>
                </button>
              ))}
            </div>
          );
        })()}

        {/* 긴급 개선 — F·C등급 + 이미지 없음 종합 */}
        {(() => {
          const noImageCount = unclassifiedNoImage.length;
          const totalNeedsFix = needsFixCount + noImageCount;
          return (
            <div
              className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
              style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: `1px solid ${totalNeedsFix > 0 ? "#f0445233" : "var(--border-subtle)"}` }}
              onClick={() => { setActiveTab("needsfix"); setGradeFilter("critical"); setPage(1); }}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} style={{ color: "#f04452" }} />
                <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "#f04452" }}>긴급 개선</span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-[40px] font-black tabular-nums leading-none" style={{ color: "#f04452" }}>{totalNeedsFix}</span>
                <span className="text-[18px] font-bold" style={{ color: "#f04452", opacity: 0.5 }}>개</span>
              </div>
              <div className="space-y-2 mt-auto">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>F등급 (긴급)</span>
                  <span className="font-black tabular-nums" style={{ color: "#ef4444" }}>{fCount}개</span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>C등급 (주의)</span>
                  <span className="font-black tabular-nums" style={{ color: "#f97316" }}>{cCount}개</span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>이미지 없음</span>
                  <span className="font-black tabular-nums" style={{ color: "#f59e0b" }}>{noImageCount}개</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 분석 — CTR/리뷰 개선 지표 */}
        {(() => {
          const tracked = appliedCount;
          // CTR/리뷰 개선 지표 (실적 기반 — 추후 백엔드 연동)
          const avgCtrChange = tracked > 0 ? 12 : 0; // placeholder: 평균 +12%p 개선
          const reviewedCount = completedGenerations.filter(g => g.status === "applied").length;
          const reviewBoost = reviewedCount > 0 ? 8 : 0; // placeholder: 평균 +8% 리뷰 점수
          return (
            <div
              className="rounded-2xl px-5 py-5 cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
              style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}
              onClick={() => { setActiveTab("tracking"); }}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={18} style={{ color: "#0891b2" }} />
                <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "#0891b2" }}>분석</span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-[40px] font-black tabular-nums leading-none" style={{ color: "#0891b2" }}>{tracked}</span>
                <span className="text-[18px] font-bold" style={{ color: "#0891b2", opacity: 0.5 }}>개</span>
              </div>
              <div className="space-y-2 mt-auto">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>CTR 개선</span>
                  <span className="font-black tabular-nums" style={{ color: avgCtrChange > 0 ? "#00c471" : "var(--text-quaternary)" }}>
                    {tracked > 0 ? `▲ ${avgCtrChange}%p` : "데이터 없음"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>리뷰 점수</span>
                  <span className="font-black tabular-nums" style={{ color: reviewBoost > 0 ? "#00c471" : "var(--text-quaternary)" }}>
                    {reviewedCount > 0 ? `▲ ${reviewBoost}%` : "데이터 없음"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>추적 중</span>
                  <span className="font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{tracked}개</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ PIPELINE VISUALIZATION (with task lists) ═══ */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
        {(() => {
          // 단계별 작업 리스트 데이터 (단계당 7개)
          const recentApplied = completedGenerations.filter(g => g.status === "applied").slice(0, 7);
          const inGeneration = validActiveGenerations.slice(0, 7);
          const fProducts = classifiedResults.filter(r => r.grade === "F").slice(0, 7);
          const cProducts = classifiedResults.filter(r => r.grade === "C").slice(0, 7);
          const needsFix = [...fProducts, ...cProducts].slice(0, 7);
          const unclassifiedSample = unclassified.slice(0, 7);
          const recentClassified = classifiedResults.slice(0, 7);

          const steps = [
            { label: "미분류", count: unclassifiedCount, color: "#8b95a1", icon: Scan, tab: "unclassified" as TabKey, desc: "AI 스캔 대기",
              tasks: unclassifiedSample.map(p => ({ name: p.productName, status: "대기" })),
              emptyText: "대기 없음" },
            { label: "AI 분류", count: analyzedCount, color: "#3182f6", icon: Zap, tab: "all" as TabKey, desc: "Gemini Vision 완료",
              tasks: batchAi.running
                ? [{ name: batchAi.current || "분석 중", status: `${batchAi.done}/${batchAi.total}` }]
                : recentClassified.map(p => ({ name: p.productName, status: `${p.grade}등급` })),
              emptyText: "분석 대기" },
            { label: "개선 필요", count: needsFixCount, color: "#f59e0b", icon: AlertTriangle, tab: "needsfix" as TabKey, grade: "critical", desc: "F·C등급 상품",
              tasks: needsFix.map(p => ({ name: p.productName, status: p.grade === "F" ? "긴급" : "주의" })),
              emptyText: "이슈 없음" },
            { label: "AI 생성", count: validActiveGenerations.length + pendingProducts.length, color: "#7048e8", icon: Wand2, tab: "queue" as TabKey, desc: "분류 후 개선 재생성",
              tasks: [
                ...inGeneration.map(g => ({ name: g.product.name, status: g.status === "generating" ? "생성 중" : g.status === "ready" ? "준비됨" : "대기" })),
                ...pendingProducts.slice(0, Math.max(0, 7 - inGeneration.length)).map(p => ({ name: p.productName, status: "대기" })),
              ],
              emptyText: "생성 작업 없음" },
            { label: "적용 완료", count: appliedCount, color: "#00c471", icon: CheckCircle, tab: "history" as TabKey, desc: "쿠팡 반영됨",
              tasks: recentApplied.map(g => ({ name: g.product.name, status: "완료" })),
              emptyText: "최근 적용 없음" },
          ];

          return (
            <>
              {/* Pipeline steps */}
              <div className="grid grid-cols-5 gap-0">
                {steps.map((step, idx) => {
                  const isActive = (step.tab === activeTab);
                  return (
                    <button
                      key={step.label}
                      onClick={() => { setActiveTab(step.tab); if (step.grade) setGradeFilter(step.grade); else if (step.tab === "all") setGradeFilter("all"); }}
                      className="relative flex flex-col items-center pt-5 pb-3 px-2 transition-all hover:bg-black/[0.02] group"
                      style={isActive ? { background: `${step.color}08` } : {}}
                    >
                      {idx > 0 && (
                        <div className="absolute left-0 top-[44px] -translate-x-1/2 w-5 flex items-center">
                          <div className="w-full h-[1.5px]" style={{ background: "var(--border)" }} />
                          <ArrowRight size={12} className="absolute -right-1" style={{ color: "var(--text-disabled)" }} />
                        </div>
                      )}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110"
                        style={{ background: `${step.color}12`, border: isActive ? `2.5px solid ${step.color}` : `1.5px solid ${step.color}30` }}
                      >
                        <step.icon size={22} style={{ color: step.color }} />
                      </div>
                      <span className="text-[32px] font-black tabular-nums leading-none mt-1" style={{ color: step.count > 0 ? step.color : "var(--text-disabled)" }}>{step.count}</span>
                      <span className="text-[14px] font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>{step.label}</span>
                      <span className="text-[11px] mt-0.5" style={{ color: "var(--text-quaternary)" }}>{step.desc}</span>
                      {isActive && <div className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full" style={{ background: step.color }} />}
                    </button>
                  );
                })}
              </div>

              {/* Task lists per step — 더 큰 폰트, 7개 표시 */}
              <div className="grid grid-cols-5 gap-0 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                {steps.map((step) => (
                  <div key={step.label} className="px-4 py-3.5 border-l first:border-l-0" style={{ borderColor: "var(--border-subtle)", minHeight: 220 }}>
                    {step.tasks.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[12px]" style={{ color: "var(--text-quaternary)" }}>{step.emptyText}</div>
                    ) : (
                      <ul className="space-y-1.5">
                        {step.tasks.map((t, ti) => (
                          <li key={ti} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: step.color }} />
                            <span className="text-[12px] font-medium truncate flex-1" style={{ color: "var(--text-secondary)" }}>{t.name}</span>
                            <span className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded" style={{ background: `${step.color}12`, color: step.color }}>{t.status}</span>
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
      <div className="flex gap-1 rounded-xl p-1.5" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
        {([
          { key: "unclassified" as TabKey, label: `미분류`, count: unclassifiedCount, dot: unclassifiedCount > 0 },
          { key: "all" as TabKey, label: `분류 완료`, count: analyzedCount },
          { key: "needsfix" as TabKey, label: `개선 필요`, count: needsFixCount, dot: needsFixCount > 0 },
          { key: "queue" as TabKey, label: `재생성`, count: allQueueItems.length },
          { key: "history" as TabKey, label: `이력`, count: completedGenerations.length },
          { key: "tracking" as TabKey, label: `추적`, count: appliedCount },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === "needsfix") { setGradeFilter("critical"); setPage(1); }
              else if (tab.key !== "all") setGradeFilter("all");
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[15px] font-bold transition-colors relative"
            style={activeTab === tab.key ? { background: "var(--primary)", color: "#ffffff", boxShadow: "var(--shadow-sm)" } : { color: "var(--text-tertiary)" }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md" style={activeTab === tab.key ? { background: "rgba(255,255,255,0.2)" } : { background: "var(--border-subtle)" }}>
                {tab.count}
              </span>
            )}
            {tab.dot && activeTab !== tab.key && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* ═══ 미분류 탭 (이미지 분류 통합) ═══ */}
      {activeTab === "unclassified" && (
        <div className="space-y-3">
          {/* 새 이미지 직접 분류 패널 */}
          <UploadClassifyPanel
            onAnalyzed={(result) => {
              setAiResults((prev) => ({ ...prev, [result.productId]: result }));
              setToast({ message: `${result.grade}등급 (${result.overallScore}점) — Gemini Vision 분류 완료`, type: "success" });
              setTimeout(() => setToast(null), 4000);
            }}
          />

          {/* 일괄 AI 분류 버튼 */}
          {unclassifiedWithImage.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--primary-subtle)", border: "1px solid rgba(49,130,246,0.15)" }}>
              <div className="flex items-center gap-2">
                <Zap size={16} style={{ color: "var(--primary)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
                  미분류 {unclassifiedWithImage.length}개 — Gemini AI 분류 필요
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runBatchAiAnalysis(unclassifiedWithImage)}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: "var(--primary)" }}
                >
                  {batchAi.running ? (
                    <><Loader2 size={14} className="animate-spin" /> {batchAi.done}/{batchAi.total}</>
                  ) : (
                    <><Zap size={14} /> 이 페이지 품질+가이드라인 ({pagedUnclassified.filter((i) => i.imageUrl).length}개)</>
                  )}
                </button>
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified)}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ background: "rgba(49,130,246,0.12)", color: "var(--primary)" }}
                >
                  <Zap size={14} /> 품질만 분석
                </button>
                <button
                  onClick={() => runBatchAiAnalysis(pagedUnclassified, 'compliance')}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 bg-amber-600"
                >
                  <Zap size={14} /> 가이드라인만 체크
                </button>
              </div>
            </div>
          )}

          <PaginationBar current={unclassifiedPage} total={unclassifiedPages} count={unclassifiedWithImage.length} pageSize={pageSize} onChange={setUnclassifiedPage} onPageSizeChange={(s) => { setPageSize(s); setUnclassifiedPage(1); }} />

          {/* ─── 이미지 있는 미분류 ─── */}
          {unclassifiedWithImage.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon size={15} style={{ color: "var(--primary)" }} />
                <h3 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>이미지 있는 상품</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md font-bold" style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}>{unclassifiedWithImage.length}개</span>
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>— AI 분류 가능</span>
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
                      aiAnalyzed={aiDone}
                      onClick={() => { setSelectedProduct(item); setSelectedGen(null); }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── 이미지 없는 미분류 ─── */}
          {unclassifiedNoImage.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "var(--card-bg)", border: "1px solid #f59e0b30" }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} style={{ color: "#f59e0b" }} />
                <h3 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>이미지 없는 상품</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md font-bold" style={{ background: "#f59e0b15", color: "#f59e0b" }}>{unclassifiedNoImage.length}개</span>
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>— 이미지 등록 필요, AI 분류 불가</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {pagedNoImage.map((item) => (
                  <ProductCard
                    key={item.productId}
                    imageUrl={null}
                    name={item.productName}
                    overlay="skipped"
                    onClick={() => { setSelectedProduct(item); setSelectedGen(null); }}
                  />
                ))}
              </div>
              {noImagePages > 1 && (
                <div className="mt-3 text-center text-[11px]" style={{ color: "var(--text-tertiary)" }}>
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
      {activeTab === "tracking" && (
        <div className="space-y-3">
          {completedGenerations.filter(g => g.status === "applied").length === 0 ? (
            <EmptyState message="추적 중인 상품이 없습니다 — 썸네일을 적용한 후 CTR 변화를 모니터링할 수 있습니다" />
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} style={{ color: "#0891b2" }} />
                  <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>CTR 변화 추적</h3>
                  <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>{completedGenerations.filter(g => g.status === "applied").length}개 모니터링 중</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "var(--surface-sunken)" }}>
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>상품</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>적용 전 등급</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>적용일</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>경과일</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {completedGenerations.filter(g => g.status === "applied").map((g) => {
                    const daysAgo = Math.floor((Date.now() - new Date(g.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={g.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="px-5 py-3 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{g.product.name}</td>
                        <td className="text-right px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white ${gradeBg[g.grade as keyof typeof gradeBg] || "bg-gray-400"}`}>{g.grade}</span></td>
                        <td className="text-right px-4 py-3 text-[12px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{new Date(g.createdAt).toLocaleDateString("ko-KR")}</td>
                        <td className="text-right px-4 py-3 text-[12px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{daysAgo}일</td>
                        <td className="text-right px-5 py-3"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: "#0891b215", color: "#0891b2" }}>추적 중</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 1: 재생성 — 개선 필요에서 넘어온 F·C 상품 AI 재생성 ═══ */}
      {activeTab === "queue" && (
        <div className="space-y-3">
          {/* 안내 배너 + 일괄 재생성 */}
          {(pendingProducts.length > 0 || validActiveGenerations.length > 0) && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(112,72,232,0.05)", border: "1px solid rgba(112,72,232,0.20)" }}>
              <div className="flex items-center gap-2">
                <Wand2 size={16} style={{ color: "#7048e8" }} />
                <span className="text-sm font-bold" style={{ color: "#7048e8" }}>
                  개선 필요 → AI 재생성 큐
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  대기 {pendingProducts.length}개 · 진행 중 {validActiveGenerations.length}개
                </span>
              </div>
              {pendingProducts.length > 0 && (
                <button onClick={generateBatch} disabled={batchGenerating} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50" style={{ background: "#7048e8" }}>
                  {batchGenerating ? <><Loader2 size={14} className="animate-spin" /> Gemini 생성 중...</> : <><Wand2 size={14} /> 전체 AI 재생성 ({pendingProducts.length}개)</>}
                </button>
              )}
            </div>
          )}

          {/* Pagination header */}
          {allQueueItems.length > 0 && (
            <PaginationBar current={queuePage} total={queueTotalPages} count={allQueueItems.length} pageSize={pageSize} onChange={setQueuePage} onPageSizeChange={(s) => { setPageSize(s); setQueuePage(1); }} />
          )}

          {/* Queue Grid — 이미지 있는 F·C 등급 상품만 */}
          {allQueueItems.length === 0 ? (
            <EmptyState message="재생성 대기 중인 상품이 없습니다 — 개선 필요 탭에서 F·C 등급 상품을 분류하세요" />
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {pagedQueue.map((item) =>
                item.type === "gen" ? (
                  <ProductCard
                    key={item.gen.id}
                    imageUrl={item.gen.selectedUrl || item.gen.originalUrl || item.gen.product.imageUrl}
                    name={item.gen.product.name}
                    badge={<StatusBadge status={item.gen.status} />}
                    overlay={item.gen.status === "generating" ? "generating" : item.gen.selectedUrl ? "selected" : "ready"}
                    candidateCount={item.gen.candidates.length}
                    onClick={() => { setSelectedGen(item.gen); setSelectedProduct(null); }}
                  />
                ) : (
                  <ProductCard
                    key={item.product.productId}
                    imageUrl={item.product.imageUrl}
                    name={item.product.productName}
                    grade={item.product.grade}
                    score={item.product.overallScore}
                    isGenerating={generatingIds.has(item.product.productId)}
                    onGenerate={() => generateSingle(item.product.productId)}
                    onClick={() => { setSelectedProduct(item.product); setSelectedGen(null); }}
                  />
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 2: 전체 스캔 결과 — 4열 그리드 ═══ */}
      {(activeTab === "all" || activeTab === "needsfix") && (
        <div className="space-y-3">
          {/* 개선 필요 탭 — 안내 배너 */}
          {activeTab === "needsfix" && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.20)" }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
                <span className="text-sm font-bold" style={{ color: "#f59e0b" }}>
                  개선 필요 상품 — F·C등급 {needsFixCount}개
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>썸네일 재생성 권장</span>
              </div>
              <button
                onClick={() => { setActiveTab("queue"); generateBatch(); }}
                disabled={pendingProducts.length === 0 || batchGenerating}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: "#7048e8" }}
              >
                {batchGenerating ? <><Loader2 size={12} className="animate-spin" /> 생성 중...</> : <><Wand2 size={12} /> 전체 AI 재생성</>}
              </button>
            </div>
          )}

          {/* Grade sub-filter — 분류 완료 탭에서만 */}
          {activeTab === "all" && (
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: "all", label: `전체 (${classifiedResults.length})` },
                { key: "critical", label: `긴급 (${criticalCount})`, color: "text-red-600" },
                ...["S", "A", "B", "C", "F"].map((g) => ({ key: g, label: `${g} (${gradeDistribution[g] || 0})` })),
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setGradeFilter(tab.key); setPage(1); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                  style={gradeFilter === tab.key ? { background: "var(--primary)", color: "#fff" } : { background: "var(--card-bg)", border: "1px solid var(--border)", color: "color" in tab ? undefined : "var(--text-secondary)" }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* AI 일괄 분석 + Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runBatchAiAnalysis(paged)}
                  disabled={batchAi.running}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: "#3182f6" }}
                >
                  {batchAi.running ? (
                    <><Loader2 size={12} className="animate-spin" /> {batchAi.done}/{batchAi.total} 분석 중...</>
                  ) : (
                    <><Zap size={12} /> 현재 페이지 재분석</>
                  )}
                </button>
                {Object.keys(aiResults).length > 0 && (
                  <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                    AI 분석 완료: {Object.keys(aiResults).length}개
                  </span>
                )}
              </div>
              <PaginationBar current={page} total={totalPages} count={filtered.length} pageSize={pageSize} onChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
            </div>
          )}

          {/* Grid */}
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
                    issueCount={display.issues.filter((i) => i.severity === "critical").length}
                    aiAnalyzed={isAiDone}
                    onClick={() => { setSelectedProduct(item); setSelectedGen(null); }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 3: 완료 이력 — 4열 그리드 + 페이지네이션 ═══ */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {completedGenerations.length === 0 ? (
            <EmptyState message="완료된 작업이 없습니다" />
          ) : (
            <>
              <PaginationBar current={historyPage} total={historyTotalPages} count={completedGenerations.length} pageSize={pageSize} onChange={setHistoryPage} onPageSizeChange={(s) => { setPageSize(s); setHistoryPage(1); }} />
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {pagedHistory.map((gen) => (
                  <ProductCard
                    key={gen.id}
                    imageUrl={gen.selectedUrl || gen.originalUrl || gen.product.imageUrl}
                    name={gen.product.name}
                    badge={<StatusBadge status={gen.status} />}
                    overlay={gen.status === "applied" ? "applied" : "skipped"}
                    onClick={() => { setSelectedGen(gen); setSelectedProduct(null); }}
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
          isAiAnalyzing={selectedProduct ? aiAnalyzing === selectedProduct.productId : false}
          isGenerating={selectedProduct ? generatingIds.has(selectedProduct.productId) : false}
          generatedProductIds={generatedProductIds}
          onClose={() => { setSelectedProduct(null); setSelectedGen(null); }}
          onAiAnalyze={() => selectedProduct && runAiAnalysis(selectedProduct.productId)}
          onGenerate={() => selectedProduct && generateSingle(selectedProduct.productId)}
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
        />
      )}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────

const gradeColors: Record<string, string> = {
  S: "text-emerald-500", A: "text-blue-500", B: "text-amber-500", C: "text-orange-500", F: "text-red-500",
};
const gradeLabels: Record<string, string> = {
  S: "최우수", A: "우수", B: "보통", C: "미흡", F: "긴급 개선",
};
const gradeBg: Record<string, string> = {
  S: "bg-emerald-500", A: "bg-blue-500", B: "bg-amber-500", C: "bg-orange-500", F: "bg-red-500",
};

// ─── Product Card (쇼핑몰 스타일) ────────────────────────────────

function ProductCard({
  imageUrl,
  name,
  grade,
  score,
  badge,
  overlay,
  issueCount,
  candidateCount,
  aiAnalyzed,
  isGenerating,
  onGenerate,
  onClick,
}: {
  imageUrl: string | null;
  name: string;
  grade?: string;
  score?: number;
  badge?: React.ReactNode;
  overlay?: "generating" | "selected" | "ready" | "applied" | "skipped";
  issueCount?: number;
  candidateCount?: number;
  aiAnalyzed?: boolean;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onClick?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("/generated-thumbnails/")) && !imgError;

  return (
    <div className="overflow-hidden group cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }} onClick={onClick}>
      {/* Image */}
      <div className="relative aspect-square" style={{ background: "var(--surface-sunken)" }}>
        {showImage ? (
          <img
            src={imageUrl!}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <ImageIcon size={32} style={{ color: "var(--text-disabled)" }} />
          </div>
        )}

        {/* Grade badge */}
        {grade && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-black text-white ${gradeBg[grade] || "bg-gray-500"}`}>
              {grade}
              {score !== undefined && <span className="font-mono font-medium text-[12px] opacity-80">{score}</span>}
            </span>
            {aiAnalyzed && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500 text-white">
                <Zap size={10} /> AI
              </span>
            )}
          </div>
        )}

        {/* Issue count */}
        {issueCount !== undefined && issueCount > 0 && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[12px] font-medium bg-red-500 text-white">
              <AlertTriangle size={12} /> {issueCount}
            </span>
          </div>
        )}

        {/* Candidate count */}
        {candidateCount !== undefined && candidateCount > 0 && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[12px] font-medium bg-blue-500 text-white">
              <Sparkles size={12} /> {candidateCount}장
            </span>
          </div>
        )}

        {/* Overlay states */}
        {overlay === "generating" && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="text-center">
              <Loader2 size={28} className="text-white animate-spin mx-auto" />
              <div className="text-white text-xs font-medium mt-2">Gemini 생성 중...</div>
            </div>
          </div>
        )}
        {overlay === "selected" && (
          <div className="absolute inset-0 bg-blue-500/20 flex items-end justify-center pb-3">
            <span className="bg-blue-600 text-white text-[12px] font-semibold px-3 py-1 rounded-full">이미지 선택됨</span>
          </div>
        )}
        {overlay === "applied" && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-end justify-center pb-3">
            <span className="bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle size={12} /> 적용 완료</span>
          </div>
        )}
        {overlay === "skipped" && (
          <div className="absolute inset-0 bg-gray-500/20 flex items-end justify-center pb-3">
            <span className="bg-gray-600 text-white text-[12px] font-semibold px-3 py-1 rounded-full">건너뜀</span>
          </div>
        )}

        {/* Generate button on hover */}
        {onGenerate && !isGenerating && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-xs font-semibold text-gray-900 shadow-lg hover:bg-gray-50 transition-colors"
            >
              <Wand2 size={14} /> AI 생성
            </button>
          </div>
        )}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 size={28} className="text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="text-[13px] font-medium line-clamp-2 leading-5" style={{ color: "var(--text-primary)" }}>{name}</div>
        <div className="mt-1.5">
          {badge || (grade && (
            <span className={`text-[11px] font-semibold ${gradeColors[grade]}`} style={{ color: undefined }}>
              {gradeLabels[grade] || grade}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────

function DetailModal({
  product,
  gen,
  aiResult,
  isAiAnalyzing,
  isGenerating,
  generatedProductIds,
  onClose,
  onAiAnalyze,
  onGenerate,
  onSelectCandidate,
  onApply,
  onSkip,
}: {
  product: AnalysisResult | null;
  gen: GenerationItem | null | undefined;
  aiResult?: AnalysisResult;
  isAiAnalyzing: boolean;
  isGenerating: boolean;
  generatedProductIds: Set<string>;
  onClose: () => void;
  onAiAnalyze: () => void;
  onGenerate: () => void;
  onSelectCandidate: (url: string) => void;
  onApply: () => void;
  onSkip: () => void;
}) {
  const display = aiResult || product;
  const candidates = gen?.candidates || [];
  const productName = gen?.product.name || product?.productName || "";
  const originalImage = gen?.originalUrl || gen?.product.imageUrl || product?.imageUrl || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--card-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold line-clamp-1" style={{ color: "var(--text-primary)" }}>{productName}</div>
            {display && (
              <div className="flex items-center gap-2 mt-1">
                <ScoreBadge score={display.overallScore} grade={display.grade} />
                {gen && <StatusBadge status={gen.status} />}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Before / After Comparison */}
          {gen && candidates.length > 0 ? (
            <>
              <div className="flex items-start gap-4">
                {/* Before */}
                <div className="w-40 flex-shrink-0">
                  <div className="text-[10px] font-mono uppercase mb-1.5" style={{ color: "var(--text-quaternary)" }}>Before</div>
                  <div className="aspect-square rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)" }}>
                    {originalImage ? (
                      <img src={originalImage} alt="원본" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon size={32} style={{ color: "var(--text-disabled)" }} /></div>
                    )}
                  </div>
                </div>

                <div className="flex items-center pt-20 flex-shrink-0">
                  <ArrowRight size={20} style={{ color: "var(--text-disabled)" }} />
                </div>

                {/* Candidates */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono uppercase mb-1.5" style={{ color: "var(--text-quaternary)" }}>
                    Gemini AI 후보 ({candidates.length}장)
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {candidates.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => onSelectCandidate(url)}
                        className="relative rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02]"
                        style={gen.selectedUrl === url
                          ? { borderColor: "var(--primary)", boxShadow: "0 0 0 3px var(--primary-subtle)" }
                          : { borderColor: "var(--border)" }
                        }
                      >
                        <div className="aspect-square bg-gray-100">
                          <img src={url} alt={`후보 ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        </div>
                        <div className="absolute top-1.5 left-1.5">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                            gen.selectedUrl === url ? "bg-blue-500 text-white" : "bg-white/80 text-gray-600 border border-gray-300"
                          }`}>
                            {gen.selectedUrl === url ? <Check size={10} /> : String.fromCharCode(65 + idx)}
                          </span>
                        </div>
                        {gen.selectedUrl === url && (
                          <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                            <span className="bg-blue-600 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">선택됨</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Apply Actions */}
              {gen.status === "ready" && (
                <div className="flex items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <button onClick={onApply} disabled={!gen.selectedUrl} className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors" style={{ background: "var(--primary)" }}>
                    <ExternalLink size={14} /> 쿠팡에 적용하기
                  </button>
                  <button onClick={onSkip} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors" style={{ color: "var(--text-tertiary)" }}>
                    <SkipForward size={14} /> 건너뛰기
                  </button>
                  {gen.selectedUrl && (
                    <>
                      <div className="flex-1" />
                      <button
                        onClick={() => gen.selectedUrl && window.open(gen.selectedUrl, "_blank")}
                        className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }}
                        title="다운로드"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={async () => { if (gen.selectedUrl) try { await navigator.clipboard.writeText(gen.selectedUrl); } catch {} }}
                        className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }}
                        title="URL 복사"
                      >
                        <Copy size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Instruction */}
              {gen.status === "ready" && gen.selectedUrl && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-800 text-xs">
                  <Lightbulb size={14} className="shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <div className="font-semibold mb-0.5">적용 방법</div>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                      <li>&quot;쿠팡에 적용하기&quot; 클릭 → 쿠팡 Wing 상품수정 페이지 오픈</li>
                      <li>익스텐션 사이드 패널에서 AI 이미지를 확인</li>
                      <li>이미지를 드래그하여 쿠팡 업로드 영역에 드롭</li>
                    </ol>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* No generation yet — show analysis */
            <>
              <div className="flex items-start gap-4">
                <div className="w-48 flex-shrink-0">
                  <div className="aspect-square rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)" }}>
                    {originalImage && (originalImage.startsWith("http") || originalImage.startsWith("/")) ? (
                      <img src={originalImage} alt={productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon size={36} style={{ color: "var(--text-disabled)" }} /></div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={onAiAnalyze} disabled={isAiAnalyzing} className="flex items-center gap-2 px-3 py-2 text-white rounded-lg text-xs font-medium disabled:opacity-50" style={{ background: "var(--primary)" }}>
                      <Eye size={12} /> {isAiAnalyzing ? "AI 분석 중..." : aiResult ? "재분석" : "AI 정밀 분석"}
                    </button>
                    {product && (product.grade === "F" || product.grade === "C") && !generatedProductIds.has(product.productId) && (
                      <button onClick={onGenerate} disabled={isGenerating} className="flex items-center gap-2 px-3 py-2 text-white rounded-lg text-xs font-medium disabled:opacity-50" style={{ background: "#7048e8" }}>
                        <Wand2 size={12} /> {isGenerating ? "Gemini 생성 중..." : "썸네일 재생성"}
                      </button>
                    )}
                  </div>

                  {aiResult && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-600 font-mono">
                      <Zap size={10} /> GEMINI VISION AI 분석 결과
                    </div>
                  )}

                  {/* Score Breakdown — AI 분석 시에만 */}
                  {display && display.scores && (
                    <ScoreBreakdown scores={display.scores} />
                  )}

                  {/* Issues */}
                  {display && display.issues.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                        발견된 이슈 ({display.issues.filter(i => i.severity === "critical").length} 크리티컬, {display.issues.filter(i => i.severity === "warning").length} 경고)
                      </div>
                      <div className="space-y-1">
                        {display.issues.map((issue, idx) => (
                          <div key={idx} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                            issue.severity === "critical" ? "bg-red-50 text-red-800" : issue.severity === "warning" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"
                          }`}>
                            {issue.severity === "critical" ? <XCircle size={13} className="shrink-0 mt-0.5" /> : issue.severity === "warning" ? <AlertTriangle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle size={13} className="shrink-0 mt-0.5" />}
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {display && display.suggestions.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase mb-1.5" style={{ color: "var(--text-tertiary)" }}>개선 제안</div>
                      <div className="space-y-1">
                        {display.suggestions.map((s, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs">
                            <Lightbulb size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Mini Card ───────────────────────────────────────────────

// ─── Upload & Classify Panel ─────────────────────────────────────

function UploadClassifyPanel({ onAnalyzed }: { onAnalyzed: (result: AnalysisResult) => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const analyzeUrl = async (url: string, name?: string) => {
    if (!url) return;
    setAnalyzing(true);
    try {
      const r = await thumbFetch("/api/thumbnails/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, productName: name || "업로드 이미지" }),
      });
      const data = await r.json();
      if (data.grade) {
        setResults((prev) => [data, ...prev]);
        onAnalyzed(data);
      }
    } catch {
      // ignore
    } finally {
      setAnalyzing(false);
      setImageUrl("");
    }
  };

  const handleFileUpload = async (file: File) => {
    // 로컬 파일 → base64 data URL로 미리보기
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 이미지 입력 영역 */}
        <div className="lg:col-span-2 space-y-3">
          {/* URL 입력 */}
          <div className="rounded-2xl p-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>쿠팡 이미지 URL로 분류</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://thumbnail.coupangcdn.com/... 또는 이미지 URL 붙여넣기"
                className="flex-1 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="상품명 (선택)"
                className="w-40 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button
                onClick={() => analyzeUrl(imageUrl, productName)}
                disabled={!imageUrl || analyzing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors"
                style={{ background: "#3182f6" }}
              >
                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                분류
              </button>
            </div>
          </div>

          {/* 드래그 앤 드롭 / 파일 업로드 */}
          <div
            className={`rounded-2xl p-8 text-center cursor-pointer transition-all ${dragOver ? "scale-[1.01]" : ""}`}
            style={{
              background: dragOver ? "rgba(49,130,246,0.06)" : "var(--card-bg)",
              boxShadow: "var(--shadow-md)",
              border: `2px dashed ${dragOver ? "#3182f6" : "var(--border)"}`,
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith("image/")) handleFileUpload(file);
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.multiple = true;
              input.onchange = () => {
                if (input.files) {
                  Array.from(input.files).forEach(handleFileUpload);
                }
              };
              input.click();
            }}
          >
            <ImageIcon size={32} className="mx-auto mb-2" style={{ color: "var(--text-quaternary)" }} />
            <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>이미지를 드래그하거나 클릭해서 업로드</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>JPG, PNG 지원 — 쿠팡 Wing에서 이미지를 저장 후 여기에 업로드</div>
          </div>

          {/* 분류 결과 */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>분류 결과 ({results.length}개)</div>
              {results.map((r, idx) => (
                <div key={idx} className="rounded-xl p-4" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-start gap-4">
                    {r.imageUrl && (
                      <div className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-50">
                        <img src={r.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-black text-white ${gradeBg[r.grade]}`}>{r.grade}</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{r.overallScore}점</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">{r.analysisMethod === "ai" ? "Gemini AI" : "룰 기반"}</span>
                      </div>
                      <div className="text-xs line-clamp-1" style={{ color: "var(--text-secondary)" }}>{r.productName}</div>
                      {r.scores && <ScoreBreakdown scores={r.scores} />}
                      <div className="mt-2 space-y-1">
                        {r.issues.filter(i => i.severity === "critical").map((issue, i) => (
                          <div key={i} className="text-[11px] text-red-700 bg-red-50 px-2 py-1 rounded">
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gemini 분류 기준 */}
        <div className="rounded-2xl p-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} style={{ color: "#3182f6" }} />
            <span className="text-sm font-bold" style={{ color: "#3182f6" }}>Gemini Vision 분류 기준</span>
          </div>
          <div className="space-y-3">
            {[
              { label: "쿠팡 가이드라인", max: 25, color: "#2563eb", items: ["순백색(#FFF) 배경", "상품 85%+ 비율", "워터마크/텍스트 없음", "1:1 정사각형"] },
              { label: "히어로 샷 품질", max: 20, color: "#3182f6", items: ["30도 틸트 촬영", "소프트박스 조명", "선명도/포커스", "입체감/깊이"] },
              { label: "구도 / 레이아웃", max: 20, color: "#059669", items: ["중앙 정렬", "5-10% 여백", "세트 상품 배치", "그림자 처리"] },
              { label: "브랜드 일관성", max: 15, color: "#d97706", items: ["톤/색감 통일", "레이아웃 반복", "브랜드 인식 형성"] },
              { label: "모바일 매력도", max: 20, color: "#dc2626", items: ["작은 화면 가독성", "상품 대비", "경쟁 상품 대비 차별화", "24pt+ 폰트"] },
            ].map((cat) => (
              <div key={cat.label} className="rounded-xl p-3" style={{ background: `${cat.color}08`, border: `1px solid ${cat.color}15` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold" style={{ color: cat.color }}>{cat.label}</span>
                  <span className="text-[10px] font-bold tabular-nums" style={{ color: cat.color }}>{cat.max}점</span>
                </div>
                <div className="space-y-0.5">
                  {cat.items.map((item, i) => (
                    <div key={i} className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                      <div className="w-1 h-1 rounded-full" style={{ background: cat.color }} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 text-center" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              S: 90+ | A: 75+ | B: 60+ | C: 40+ | F: 39-
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBreakdown({ scores }: { scores: AnalysisScores }) {
  const items = [
    { label: "쿠팡 가이드라인", score: scores.guideline, max: 25, desc: "흰배경, 비율, 워터마크" },
    { label: "히어로 샷 품질", score: scores.heroShot, max: 20, desc: "각도, 조명, 선명도" },
    { label: "구도 / 레이아웃", score: scores.composition, max: 20, desc: "중앙 정렬, 여백, 배치" },
    { label: "브랜드 일관성", score: scores.branding, max: 15, desc: "톤 통일, 반복 패턴" },
    { label: "모바일 매력도", score: scores.mobile, max: 20, desc: "작은 화면 가독성, 대비" },
  ];
  const total = items.reduce((s, i) => s + i.score, 0);

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-sunken, #f4f5f7)", border: "1px solid var(--border-subtle, #f2f3f5)" }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-mono text-gray-500 uppercase">항목별 채점</span>
        <span className="text-sm font-black tabular-nums" style={{ color: total >= 75 ? "#059669" : total >= 40 ? "#d97706" : "#dc2626" }}>{total}<span className="text-xs font-medium text-gray-400">/100</span></span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
          const color = pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626";
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary, #191f28)" }}>{item.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary, #8b95a1)" }}>{item.desc}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black tabular-nums" style={{ color }}>{item.score}</span>
                  <span className="text-[10px] text-gray-400">/{item.max}</span>
                  {pct < 50 && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: `${color}15`, color }}>감점</span>}
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${color}15` }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiMini({ icon: Icon, color, label, value, unit, sub, bar, alert, onClick }: {
  icon: typeof CheckCircle;
  color: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  bar?: number;
  alert?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className="rounded-2xl px-5 py-5 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-shadow"
      style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: `1px solid ${alert ? `${color}33` : "var(--border-subtle)"}` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} style={{ color }} />
        <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[40px] font-black tabular-nums leading-none" style={{ color }}>{value}</span>
        <span className="text-[18px] font-bold" style={{ color, opacity: 0.5 }}>{unit}</span>
      </div>
      <div className="text-[13px] mt-2 font-medium" style={{ color: "var(--text-tertiary)" }}>{sub}</div>
      {bar !== undefined && (
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: `${color}18` }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(bar, 100)}%`, background: color }} />
        </div>
      )}
      {alert && (
        <div className="mt-3 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ background: `${color}15`, color }}>즉시 조치</div>
      )}
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: typeof Clock }> = {
    pending: { label: "대기중", color: "bg-gray-100 text-gray-600", icon: Clock },
    generating: { label: "생성중", color: "bg-blue-100 text-blue-700", icon: Loader2 },
    ready: { label: "후보 선택", color: "bg-amber-100 text-amber-700", icon: Sparkles },
    applied: { label: "적용 완료", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
    skipped: { label: "건너뜀", color: "bg-gray-100 text-gray-500", icon: SkipForward },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>
      <Icon size={10} className={status === "generating" ? "animate-spin" : ""} /> {c.label}
    </span>
  );
}

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  const color =
    grade === "S" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : grade === "A" ? "bg-blue-100 text-blue-700 border-blue-200"
    : grade === "B" ? "bg-amber-100 text-amber-700 border-amber-200"
    : grade === "C" ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-red-100 text-red-700 border-red-200";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${color}`}>
      <span className="text-lg font-black">{grade}</span>
      <span className="text-sm font-mono tabular-nums">{score}</span>
    </div>
  );
}

function PaginationBar({ current, total, count, pageSize, onChange, onPageSizeChange }: { current: number; total: number; count: number; pageSize: number; onChange: (p: number) => void; onPageSizeChange?: (size: number) => void }) {
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, count);
  return (
    <div className="flex items-center justify-between" style={{ color: "var(--text-tertiary)" }}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">{count}개 중 {from}-{to}</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "var(--surface-sunken)" }}>
            {[20, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => onPageSizeChange(size)}
                className="px-2 py-0.5 rounded-md text-[13px] font-semibold transition-colors"
                style={pageSize === size ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-tertiary)" }}
              >
                {size}
              </button>
            ))}
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(Math.max(1, current - 1))} disabled={current === 1} className="px-2 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors" style={{ background: "var(--surface-sunken)" }}><ChevronLeft size={14} /></button>
          <span className="px-3 text-xs font-semibold tabular-nums">{current} / {total}</span>
          <button onClick={() => onChange(Math.min(total, current + 1))} disabled={current === total} className="px-2 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors" style={{ background: "var(--surface-sunken)" }}><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

function ThumbnailPreview({ imageUrl, productName, size }: { imageUrl: string | null; productName: string; size: "sm" | "lg" }) {
  const [hasError, setHasError] = useState(false);
  const dimension = size === "lg" ? "w-32 h-32" : "w-20 h-20";
  const iconSize = size === "lg" ? 28 : 20;
  const showImage = imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("/generated-thumbnails/")) && !hasError;

  return (
    <div className={`${dimension} rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200`}>
      {showImage ? (
        <img src={imageUrl} alt={productName} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setHasError(true)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400">
          <ImageIcon size={iconSize} className="text-gray-300" />
        </div>
      )}
    </div>
  );
}
