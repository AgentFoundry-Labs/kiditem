'use client';

import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download, Upload, Search, BarChart3, Package,
  TrendingUp, TrendingDown, AlertTriangle, MinusCircle, ArrowRight,
} from "lucide-react";
import { formatKRW, formatPercent, getGradeColor, getProfitColor, getProductStatusBadge } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProductListItem as Product, PipelineCounts } from "@kiditem/shared";
import PageSkeleton from "@/components/ui/PageSkeleton";
import AddProductModal from "./components/AddProductModal";
import ExcelUploadModal from "./components/ExcelUploadModal";

const DEFAULT_PIPELINE: PipelineCounts = {
  total: 0, gradeA: 0, gradeB: 0, gradeC: 0,
  minus: 0, low: 0, gradeChangeA: 0, gradeChangeB: 0, gradeChangeC: 0,
  adCount: 0, noAdCount: 0,
};
const PAGE_SIZE = 20;

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const trafficRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [submittedSearch, setSubmittedSearch] = useState(() => searchParams.get("search") ?? "");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adFilter, setAdFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [period, setPeriod] = useState(7);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [trafficMsg, setTrafficMsg] = useState("");

  // ─── Products query ───
  const queryParams: Record<string, string> = {
    page: String(page),
    limit: String(PAGE_SIZE),
    period: String(period),
    ...(gradeFilter !== "all" && { grade: gradeFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(submittedSearch && { search: submittedSearch }),
  };

  const { data: productsData, isLoading, error: productsError } = useQuery({
    queryKey: queryKeys.products.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.get<{ items: Product[]; total: number }>(`/api/products?${params}`);
    },
  });

  const allProducts = productsData?.items ?? [];
  const totalCount = productsData?.total ?? 0;

  // ─── Pipeline stats ───
  const { data: pipelineCounts = DEFAULT_PIPELINE } = useQuery({
    queryKey: queryKeys.products.pipelineStats(statusFilter !== "all" ? statusFilter : undefined),
    queryFn: () => {
      const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return apiClient.get<PipelineCounts>(`/api/products/pipeline-stats${statusParam}`);
    },
  });

  // ─── Traffic upload ───
  const trafficUpload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("period", String(period));
      return apiClient.upload<{ success: boolean; upserted?: number; error?: string }>(`/api/traffic/upload`, fd);
    },
    onSuccess: (data) => {
      if (data.success) {
        setTrafficMsg(`${data.upserted}개 상품 트래픽 업데이트 완료`);
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      } else {
        setTrafficMsg(`오류: ${data.error}`);
      }
    },
    onError: (err) => { setTrafficMsg(isApiError(err) ? err.detail : "업로드 실패"); },
    onSettled: () => {
      if (trafficRef.current) trafficRef.current.value = "";
      setTimeout(() => setTrafficMsg(""), 5000);
    },
  });

  const handleTrafficUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrafficMsg("업로드 중...");
    trafficUpload.mutate(file);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedSearch(search);
  };

  const handleExcelDownload = async () => {
    const params = new URLSearchParams();
    if (gradeFilter !== "all") params.set("grade", gradeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (submittedSearch) params.set("search", submittedSearch);
    params.set("limit", "10000");
    const data = await apiClient.get<{ items: Product[] }>(`/api/products?${params}`);
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        data.items.map((p) => ({
          등급: getGrade(p),
          상품명: p.name,
          SKU: p.sku,
          카테고리: p.category,
          회사: p.company,
          매입가: p.costPrice,
          판매가: p.sellPrice,
          수수료율: p.commissionRate,
          배송비: p.shippingCost,
          매출: p.revenue,
          순이익: p.netProfit,
          이익률: p.profitRate,
          광고비율: p.adRate,
          재고: p.currentStock,
          상태: p.status === "active" ? "판매중" : p.status === "inactive" ? "중지" : "정리",
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "상품목록");
      XLSX.writeFile(wb, `상품목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading && allProducts.length === 0) return <PageSkeleton variant="table" />;
  if (productsError) {
    const msg = isApiError(productsError) ? productsError.detail : "상품 목록을 불러오지 못했습니다.";
    return <div className="flex items-center justify-center h-64 text-red-500">{msg}</div>;
  }

  // ─── ABC 등급: 14일(t14) 데이터 기준 클라이언트 계산 ───
  const scoreMap = new Map<string, { score: number; grade: string; rank: number; prevRank: number | null; strategy: string }>();
  (() => {
    const withRev = allProducts
      .map((p) => ({ id: p.id, rev: p.t14?.revenue || 0 }))
      .filter((p) => p.rev > 0)
      .sort((a, b) => b.rev - a.rev);
    const totalRev = withRev.reduce((s, p) => s + p.rev, 0);
    const revenueScoreMap = new Map<string, number>();
    let cum = 0;
    for (const p of withRev) {
      cum += p.rev;
      const pct = totalRev > 0 ? (cum / totalRev) * 100 : 100;
      revenueScoreMap.set(p.id, pct <= 70 ? 50 : pct <= 90 ? 30 : 10);
    }

    const prevWithRev = allProducts
      .map((p) => ({ id: p.id, rev: p.t14prev?.revenue || 0 }))
      .filter((p) => p.rev > 0)
      .sort((a, b) => b.rev - a.rev);
    const prevRankMap = new Map<string, number>();
    prevWithRev.forEach((p, i) => prevRankMap.set(p.id, i + 1));

    const scored = allProducts.map((p) => {
      const revScore = revenueScoreMap.get(p.id) || 0;
      const adScore = 15; // adTier/roas not in API response
      const conv = p.t14?.conversionRate || 0;
      let convScore = 0;
      if (conv >= 5) convScore = 20;
      else if (conv >= 3) convScore = 15;
      else if (conv >= 1) convScore = 10;
      else if (conv > 0) convScore = 5;
      const total = revScore + adScore + convScore;
      let grade = "C";
      if (total >= 60) grade = "A";
      else if (total >= 30) grade = "B";
      return { id: p.id, score: total, grade, revScore };
    });

    const ranked = scored.filter((s) => s.revScore > 0).sort((a, b) => b.score - a.score);
    ranked.forEach((s, i) => {
      const p = allProducts.find((pp) => pp.id === s.id)!;
      const rank = i + 1;
      const prevRank = prevRankMap.get(s.id) || null;
      let strategy = "";
      if (s.grade === "A" && p.adTier) strategy = `핵심 상품 — 광고 유지 추천`;
      else if (s.grade === "A") strategy = `자연매출 우수 — 광고 테스트 시 A급 후보`;
      else if (s.grade === "B" && p.adTier) strategy = `키워드 최적화 필요 — 소재 변경 또는 입찰가 조정`;
      else if (s.grade === "B") strategy = `성장 가능성 — A등급 승격 조건 검토`;
      else strategy = `매출 개선 필요`;
      scoreMap.set(s.id, { score: s.score, grade: s.grade, rank, prevRank, strategy });
    });

    scored.filter((s) => s.revScore === 0).forEach((s) => {
      const p = allProducts.find((pp) => pp.id === s.id)!;
      const strategy = p.adTier ? `광고 중단 권장 — 매출 없음` : `판매 이력 없음`;
      scoreMap.set(s.id, { score: 0, grade: "C", rank: 0, prevRank: null, strategy });
    });
  })();

  const getGrade = (p: Product) => p.abcGrade || scoreMap.get(p.id)?.grade || "C";
  const getRank = (p: Product) => scoreMap.get(p.id)?.rank || 0;
  const getRankChange = (p: Product) => {
    const info = scoreMap.get(p.id);
    if (!info || !info.prevRank || !info.rank) return null;
    return info.prevRank - info.rank;
  };
  const getStrategy = (p: Product) => scoreMap.get(p.id)?.strategy || "";
  const getScore = (p: Product) => p.gradeScore ?? scoreMap.get(p.id)?.score ?? 0;

  // 등급별 매출/광고비 (현재 페이지 기준 근사치)
  const gradeRevMap: Record<string, number> = { A: 0, B: 0, C: 0 };
  const gradeAdMap: Record<string, number> = { A: 0, B: 0, C: 0 };
  let totalGradeRev = 0;
  for (const p of allProducts) {
    const g = getGrade(p);
    const rev = p.t14?.revenue || 0;
    totalGradeRev += rev;
    if (g === "A" || g === "B" || g === "C") {
      gradeRevMap[g] += rev;
      gradeAdMap[g] += p.adRate > 0 ? rev * (p.adRate / 100) : 0;
    }
  }
  const gradeRevPct = {
    A: totalGradeRev > 0 ? Math.round((gradeRevMap.A / totalGradeRev) * 100) : 0,
    B: totalGradeRev > 0 ? Math.round((gradeRevMap.B / totalGradeRev) * 100) : 0,
    C: totalGradeRev > 0 ? Math.round((gradeRevMap.C / totalGradeRev) * 100) : 0,
  };

  // 필터 (광고 클라이언트 필터)
  const filtered = allProducts.filter(
    (p) => adFilter === "all" || (adFilter === "ad" ? !!p.adTier : !p.adTier)
  );

  // 정렬
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "desc") setSortDir("asc");
      else { setSortKey(""); setSortDir("desc"); }
    } else { setSortKey(key); setSortDir("desc"); }
  };
  const getSortVal = (p: Product, key: string): number => {
    const t = p.traffic;
    switch (key) {
      case "visitors": return t?.visitors || 0;
      case "views": return t?.views || 0;
      case "cartAdds": return t?.cartAdds || 0;
      case "orders": return t?.orders || 0;
      case "salesQty": return t?.salesQty || 0;
      case "revenue": return t?.revenue || 0;
      case "profitRate": return p.profitRate;
      default: return 0;
    }
  };
  const displayProducts = [...filtered].sort((a, b) => {
    if (!sortKey) {
      const ra = getRank(a) || 99999, rb = getRank(b) || 99999;
      return ra - rb;
    }
    const av = getSortVal(a, sortKey), bv = getSortVal(b, sortKey);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* ═══ 헤더 ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
            <Package size={20} className="text-white" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>상품관리</h1>
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-tertiary)" }}>14일 기준</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl p-1" style={{ background: "var(--surface-sunken)" }}>
            {[{ days: 7, label: "7일" }, { days: 14, label: "14일" }, { days: 30, label: "30일" }, { days: 365, label: "연간" }].map((item) => (
              <button key={item.days} onClick={() => { setPeriod(item.days); setPage(1); }}
                className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
                style={period === item.days
                  ? { background: "var(--primary)", color: "#fff", boxShadow: "var(--shadow-sm)" }
                  : { color: "var(--text-tertiary)" }}>
                {item.label}
              </button>
            ))}
          </div>
          <input ref={trafficRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleTrafficUpload} className="hidden" />
          <button onClick={() => trafficRef.current?.click()} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
            <BarChart3 size={14} /> 트래픽 업로드
          </button>
          {trafficMsg && <span className="text-[13px] font-semibold" style={{ color: "var(--primary)" }}>{trafficMsg}</span>}
          <button onClick={handleExcelDownload} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
            <Download size={14} />
          </button>
          <button onClick={() => setShowUploadModal(true)} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
            <Upload size={14} />
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white" style={{ background: "var(--primary)" }}>
            + 상품 추가
          </button>
        </div>
      </div>

      {/* ═══ 등급 카드 ═══ */}
      {(() => {
        const fmtWon = (v: number) => v >= 100000000 ? `${(v / 100000000).toFixed(1)}억` : v >= 10000 ? `${Math.round(v / 10000)}만` : v.toLocaleString();
        const cards = [
          { key: "all", label: "전체 상품", value: pipelineCounts.total, color: "var(--primary)", icon: Package, rev: totalGradeRev, ad: gradeAdMap.A + gradeAdMap.B + gradeAdMap.C, revPct: null as number | null },
          { key: "A", label: "A등급", value: pipelineCounts.gradeA, color: "#00c471", icon: TrendingUp, rev: gradeRevMap.A, ad: gradeAdMap.A, revPct: gradeRevPct.A },
          { key: "B", label: "B등급", value: pipelineCounts.gradeB, color: "#f59e0b", icon: ArrowRight, rev: gradeRevMap.B, ad: gradeAdMap.B, revPct: gradeRevPct.B },
          { key: "C", label: "C등급", value: pipelineCounts.gradeC, color: "#f97316", icon: TrendingDown, rev: gradeRevMap.C, ad: gradeAdMap.C, revPct: gradeRevPct.C },
          { key: "minus", label: "적자", value: pipelineCounts.minus, color: "#f04452", icon: MinusCircle, rev: null as number | null, ad: null as number | null, revPct: null as number | null },
          { key: "low", label: "3%이하", value: pipelineCounts.low, color: "#8b95a1", icon: AlertTriangle, rev: null as number | null, ad: null as number | null, revPct: null as number | null },
        ];
        return (
          <div className="grid grid-cols-6 gap-3">
            {cards.map((card) => {
              const isActive = gradeFilter === card.key;
              const Icon = card.icon;
              return (
                <button key={card.key} onClick={() => { setGradeFilter(card.key); setPage(1); }}
                  className="rounded-2xl p-4 text-left transition-all hover:shadow-md"
                  style={{
                    background: isActive ? card.color : "var(--card-bg)",
                    border: isActive ? `2px solid ${card.color}` : "1px solid var(--border-subtle)",
                    boxShadow: isActive ? `0 4px 20px ${card.color}25` : "var(--shadow-sm)",
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <Icon size={16} style={{ color: isActive ? "rgba(255,255,255,0.7)" : card.color }} />
                    {card.revPct !== null && (
                      <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                        style={{ background: isActive ? "rgba(255,255,255,0.2)" : `${card.color}12`, color: isActive ? "rgba(255,255,255,0.8)" : card.color }}>
                        매출 {card.revPct}%
                      </span>
                    )}
                  </div>
                  <div className="text-3xl font-black tabular-nums" style={{ color: isActive ? "#fff" : "var(--text-primary)" }}>{card.value}</div>
                  <div className="text-[14px] font-semibold mt-0.5" style={{ color: isActive ? "rgba(255,255,255,0.75)" : "var(--text-tertiary)" }}>{card.label}</div>
                  {card.rev !== null && (
                    <div className="mt-2.5 pt-2.5 space-y-1.5" style={{ borderTop: isActive ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--border-subtle)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px]" style={{ color: isActive ? "rgba(255,255,255,0.5)" : "var(--text-quaternary)" }}>매출</span>
                        <span className="text-[14px] font-bold tabular-nums" style={{ color: isActive ? "#fff" : "var(--text-primary)" }}>{fmtWon(card.rev)}원</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px]" style={{ color: isActive ? "rgba(255,255,255,0.5)" : "var(--text-quaternary)" }}>광고비</span>
                        <span className="text-[14px] font-bold tabular-nums" style={{ color: isActive ? "rgba(255,255,255,0.85)" : "var(--text-secondary)" }}>{fmtWon(card.ad!)}원</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* ═══ 검색 + 필터 ═══ */}
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명 · SKU 검색"
            className="h-10 pl-9 pr-3 text-[14px] rounded-xl w-full"
            style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
        </form>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
          <option value="all">전체 상태</option>
          <option value="active">판매중</option>
          <option value="inactive">판매중지</option>
        </select>
        <div className="flex items-center rounded-xl p-1" style={{ background: "var(--surface-sunken)" }}>
          {[{ key: "all", label: "전체" }, { key: "ad", label: "광고중" }, { key: "noad", label: "광고없음" }].map((f) => (
            <button key={f.key} onClick={() => setAdFilter(f.key)}
              className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
              style={adFilter === f.key ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-tertiary)" }}>{totalCount}개 표시</span>
      </div>

      {/* 정리 대상 안내 배너 */}
      {(gradeFilter === "minus" || gradeFilter === "low") && displayProducts.length > 0 && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-2xl"
          style={{
            background: gradeFilter === "minus" ? "rgba(240,68,82,0.05)" : "rgba(245,158,11,0.05)",
            border: `1px solid ${gradeFilter === "minus" ? "rgba(240,68,82,0.15)" : "rgba(245,158,11,0.15)"}`,
          }}>
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: gradeFilter === "minus" ? "#f04452" : "#f59e0b" }} />
          <div>
            <div className="text-[15px] font-bold" style={{ color: gradeFilter === "minus" ? "#f04452" : "#f59e0b" }}>
              {gradeFilter === "minus" ? `적자 상품 ${totalCount}개 — 정리 검토 필요` : `수익률 3% 이하 상품 ${totalCount}개 — 개선 필요`}
            </div>
            <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {gradeFilter === "minus"
                ? "매출 대비 비용이 초과된 상품입니다. 가격 인상, 매입가 재협상, 광고 중단, 또는 판매 중지를 검토하세요."
                : "수익률이 낮아 운영 효율이 떨어지는 상품입니다. 가격 조정, 비용 절감, 또는 광고 최적화를 검토하세요."}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 컬럼 헤더 (정렬) ═══ */}
      <div className="flex items-center px-6 py-2 text-[12px] font-semibold" style={{ color: "var(--text-quaternary)" }}>
        <div className="flex-1">옵션</div>
        <div className="flex items-center shrink-0">
          {[
            { key: "visitors", label: "방문자", w: "w-[110px]" },
            { key: "views", label: "조회", w: "w-[110px]" },
            { key: "cartAdds", label: "장바구니", w: "w-[110px]" },
            { key: "orders", label: "주문", w: "w-[110px]" },
          ].map((col) => (
            <button key={col.key} onClick={() => toggleSort(col.key)}
              className={`${col.w} text-center flex items-center justify-center gap-0.5 hover:text-slate-700 cursor-pointer`}>
              {col.label}{" "}
              <span className={`text-[9px] ${sortKey === col.key ? "text-blue-600" : "text-slate-300"}`}>
                {sortKey === col.key ? (sortDir === "desc" ? "▼" : "▲") : "▼"}
              </span>
            </button>
          ))}
          <div className="mx-6" style={{ width: 1 }} />
          <button onClick={() => toggleSort("salesQty")} className="w-[120px] pr-4 text-center flex items-center justify-center gap-0.5 hover:text-slate-700 cursor-pointer">
            판매량{" "}
            <span className={`text-[9px] ${sortKey === "salesQty" ? "text-blue-600" : "text-slate-300"}`}>
              {sortKey === "salesQty" ? (sortDir === "desc" ? "▼" : "▲") : "▼"}
            </span>
          </button>
          <button onClick={() => toggleSort("revenue")} className="w-[160px] text-right flex items-center justify-end gap-0.5 hover:text-slate-700 cursor-pointer text-blue-500">
            매출 (원){" "}
            <span className={`text-[9px] ${sortKey === "revenue" ? "text-blue-600" : "text-blue-300"}`}>
              {sortKey === "revenue" ? (sortDir === "desc" ? "▼" : "▲") : "▼"}
            </span>
          </button>
        </div>
      </div>

      {/* ═══ 상품 카드 리스트 ═══ */}
      <div className="relative">
        {isLoading && allProducts.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-20 rounded-xl" style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(2px)" }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>불러오는 중...</span>
            </div>
          </div>
        )}
        {displayProducts.length === 0 && !isLoading ? (
          <div className="rounded-xl p-12 text-center" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
            등록된 상품이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {displayProducts.map((p, idx) => {
              const badge = getProductStatusBadge(p.status);
              const t14 = p.t14;
              const t = p.traffic;
              const h14 = !!t14;
              const h = !!t;
              const visitors = h ? t.visitors : null;
              const views = h ? t.views : null;
              const carts = h ? t.cartAdds : null;
              const ord = h14 ? t14.orders : (h ? t.orders : null);
              const qty = h14 ? t14.salesQty : (h ? t.salesQty : null);
              const rev = h14 ? t14.revenue : (h ? t.revenue : null);
              return (
                <div key={`${p.id}-${idx}`}
                  className={`bg-white rounded-xl border border-slate-200 px-6 py-5 flex items-start hover:shadow-sm transition-shadow ${p.profitRate < 0 ? "border-red-200 bg-red-50/20" : ""}`}>
                  {/* 왼쪽: 썸네일 + 상품정보 */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* 순위 */}
                    <div className="w-8 shrink-0 pt-2 text-center">
                      {getRank(p) > 0 ? (
                        <>
                          <div className="text-lg font-bold text-slate-400 tabular-nums">#{getRank(p)}</div>
                          {(() => {
                            const ch = getRankChange(p);
                            if (ch === null) return <div className="text-[9px] text-slate-300 font-mono">NEW</div>;
                            if (ch > 0) return <div className="text-[9px] text-green-600 font-bold">▲{ch}</div>;
                            if (ch < 0) return <div className="text-[9px] text-red-500 font-bold">▼{Math.abs(ch)}</div>;
                            return <div className="text-[9px] text-slate-300">-</div>;
                          })()}
                        </>
                      ) : <div className="text-xs text-slate-300">-</div>}
                    </div>
                    {/* 썸네일 */}
                    <div className="w-[88px] h-[88px] rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0 relative">
                      {(p.thumbnailUrl || p.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={(p.thumbnailUrl || p.imageUrl)!} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">NO IMG</div>
                      )}
                      {p.status === "active" && (
                        <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 text-white text-[7px] text-center py-0.5 font-medium">판매중</div>
                      )}
                    </div>
                    {/* 상품 정보 */}
                    <div className="min-w-0 pt-0.5">
                      <a href={`/products/${p.id}`} className="text-[16px] font-bold text-slate-900 leading-snug line-clamp-2 hover:underline">{p.name}</a>
                      <div className="text-[11px] text-slate-400 mt-1.5 space-x-1">
                        <span>등록상품 ID: {p.coupangProductId || "-"}</span>
                        {p.sku && <span>&#183; SKU: {p.sku}</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">카테고리: {p.category || "-"}</div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(getGrade(p))}`}>{getGrade(p)}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{getScore(p)}점</span>
                        {p.adTier && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">{p.adTier} 광고</span>}
                        {p.adRate > 0 && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.adRate > 15 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-500"}`}>
                            광고비율 {formatPercent(p.adRate)}
                          </span>
                        )}
                        {badge.label !== "판매중" && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>{badge.label}</span>
                        )}
                      </div>
                      {getStrategy(p) && (
                        <div className={`text-[11px] mt-1.5 ${getGrade(p) === "A" ? "text-green-600" : getGrade(p) === "B" ? "text-yellow-600" : "text-slate-400"}`}>
                          → {getStrategy(p)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 오른쪽: 트래픽 + 판매량 + 매출 */}
                  <div className="flex items-start shrink-0">
                    {[
                      { val: visitors, label: "방문자" },
                      { val: views, label: "조회" },
                      { val: carts, label: "장바구니" },
                      { val: ord, label: "주문" },
                    ].map(({ val, label }) => (
                      <div key={label} className="w-[110px] text-center">
                        <div className="text-[26px] font-extrabold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
                          {val !== null ? val.toLocaleString() : "-"}
                        </div>
                        <div className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                      </div>
                    ))}
                    <div className="w-px h-14 bg-slate-200 mx-6 mt-0.5" />
                    {/* 판매량 */}
                    <div className="w-[120px] text-center pr-4">
                      <div className="text-[30px] font-black tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
                        {qty !== null ? qty.toLocaleString() : "-"}
                      </div>
                      <div className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>판매량</div>
                      <div className={`text-[12px] mt-0.5 tabular-nums font-semibold ${getProfitColor(p.profitRate)}`}>
                        이익률 {formatPercent(p.profitRate)}
                      </div>
                    </div>
                    {/* 매출 */}
                    <div className="w-[160px] text-right">
                      <div className="text-[30px] font-black tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
                        {rev !== null ? formatKRW(rev) : "-"}
                      </div>
                      <div className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>매출 (원)</div>
                      {p.adRate > 0 && (
                        <div className={`text-[11px] mt-0.5 tabular-nums font-medium ${p.adRate > 15 ? "text-red-600" : "text-slate-500"}`}>
                          광고 {formatPercent(p.adRate)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-400 font-mono">
              {totalCount}개 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                이전
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pg: number;
                if (totalPages <= 7) pg = i + 1;
                else if (page <= 4) pg = i + 1;
                else if (page >= totalPages - 3) pg = totalPages - 6 + i;
                else pg = page - 3 + i;
                return (
                  <button key={pg} onClick={() => goToPage(pg)}
                    className={`w-8 h-8 text-xs rounded-md ${pg === page ? "bg-gray-900 text-white font-semibold" : "border border-gray-200 hover:bg-gray-50 text-gray-600"}`}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AddProductModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: queryKeys.products.all }); }}
        />
      )}

      {showUploadModal && (
        <ExcelUploadModal
          onClose={() => setShowUploadModal(false)}
          onComplete={() => { setShowUploadModal(false); queryClient.invalidateQueries({ queryKey: queryKeys.products.all }); }}
        />
      )}
    </div>
  );
}
