"use client";
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import type { ProductListItem as Product, TrafficData, SyncInfo, PipelineCounts } from '@kiditem/shared';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, Search, BarChart3 } from "lucide-react";
import { formatKRW, formatPercent, getProfitColor, getProductStatusBadge, timeAgo } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import PageSkeleton from "@/components/ui/PageSkeleton";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [adFilter, setAdFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [period, setPeriod] = useState(7);
  const [pipelineCounts, setPipelineCounts] = useState<PipelineCounts>({ total: 0, A: 0, B: 0, C: 0, minus: 0, low: 0, gradeChangeA: 0, gradeChangeB: 0, gradeChangeC: 0, adCount: 0, noAdCount: 0 });
  const [trafficMsg, setTrafficMsg] = useState("");
  const trafficRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  const fetchProducts = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (gradeFilter !== "all") params.set("grade", gradeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    params.set("period", String(period));
    try {
      const data = await apiClient.get<{ items: Product[]; total: number }>(`/api/products?${params}`);
      setProducts(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.detail : "상품 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [gradeFilter, statusFilter, search, page, period]);

  const fetchPipelineCounts = useCallback(async () => {
    const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    try {
      const data = await apiClient.get<Record<string, number>>(`/api/products/pipeline-stats${statusParam}`);
      setPipelineCounts({
        total: data.total || 0,
        A: data.gradeA || 0,
        B: data.gradeB || 0,
        C: data.gradeC || 0,
        minus: data.minus || 0,
        low: data.low || 0,
        gradeChangeA: data.gradeChangeA || 0,
        gradeChangeB: data.gradeChangeB || 0,
        gradeChangeC: data.gradeChangeC || 0,
        adCount: data.adCount || 0,
        noAdCount: data.noAdCount || 0,
      });
    } catch (_e) {
      // pipeline counts are non-critical
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchPipelineCounts();
    apiClient.get<{ lastSyncedAt: string | null }>(`/api/coupang-dashboard`)
      .then(data => setSyncInfo({ lastSyncedAt: data.lastSyncedAt }))
      .catch(() => setSyncInfo({ lastSyncedAt: null }));
  }, [fetchPipelineCounts]);

  useEffect(() => {
    setPage(1);
    fetchProducts(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeFilter, statusFilter, period]);

  useEffect(() => {
    fetchProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleExcelDownload = async () => {
    const params = new URLSearchParams();
    if (gradeFilter !== "all") params.set("grade", gradeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("limit", "10000");
    const data = await apiClient.get<{ items: Product[] }>(`/api/products?${params}`);
    const allProducts: Product[] = data.items;
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        allProducts.map((p) => ({
          등급: p.abcGrade,
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

  const handleTrafficUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrafficMsg("업로드 중...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("period", String(period));
      const data = await apiClient.upload<{ success: boolean; upserted?: number; error?: string }>(`/api/traffic/upload`, fd);
      if (data.success) {
        setTrafficMsg(`${data.upserted}개 상품 트래픽 업데이트 완료`);
        fetchProducts();
      } else {
        setTrafficMsg(`오류: ${data.error}`);
      }
    } catch (err) {
      setTrafficMsg(isApiError(err) ? err.detail : "업로드 실패");
    }
    if (trafficRef.current) trafficRef.current.value = "";
    setTimeout(() => setTrafficMsg(""), 5000);
  };

  const displayProducts = adFilter === "all"
    ? products
    : adFilter === "ad"
      ? products.filter(p => p.adTier)
      : products.filter(p => !p.adTier);

  if (loading) return <PageSkeleton variant="table" />;
  if (error) return <div className="flex items-center justify-center h-64 text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          상품 관리 <span className="text-slate-400 font-normal">(총 <strong className="text-slate-900">{total}</strong>)</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {[
              { days: 7, label: "7일" },
              { days: 14, label: "14일" },
              { days: 30, label: "30일" },
              { days: 365, label: "연간" },
            ].map((p) => (
              <button key={p.days} onClick={() => setPeriod(p.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p.days ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input ref={trafficRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleTrafficUpload} className="hidden" />
          <button onClick={() => trafficRef.current?.click()} className="flex items-center gap-1.5 h-9 px-4 border border-cyan-400 text-cyan-700 rounded-lg text-sm hover:bg-cyan-50 bg-white">
            <BarChart3 size={14} /> {period}일 트래픽 업로드
          </button>
          {trafficMsg && <span className="text-xs text-cyan-600">{trafficMsg}</span>}
          <button onClick={handleExcelDownload} className="flex items-center gap-1.5 h-9 px-4 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 bg-white">
            <Download size={14} /> 엑셀 다운로드
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 h-9 px-4 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={14} /> 상품 등록
          </button>
        </div>
      </div>

      {syncInfo && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className={`w-1.5 h-1.5 rounded-full ${syncInfo.lastSyncedAt ? 'bg-green-400' : 'bg-amber-400'}`} />
          {syncInfo.lastSyncedAt
            ? `최근 동기화: ${timeAgo(syncInfo.lastSyncedAt)}`
            : '동기화 기록 없음 — 설정에서 동기화를 실행하세요'}
        </div>
      )}

      <ProductPipeline
        total={pipelineCounts.total}
        aCount={pipelineCounts.A}
        bCount={pipelineCounts.B}
        cCount={pipelineCounts.C}
        minusCount={pipelineCounts.minus}
        lowCount={pipelineCounts.low}
        gradeChangeA={pipelineCounts.gradeChangeA}
        gradeChangeB={pipelineCounts.gradeChangeB}
        gradeChangeC={pipelineCounts.gradeChangeC}
        onGradeClick={(g) => { setGradeFilter(g); setPage(1); }}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명/SKU 검색"
            className="h-9 pl-8 pr-3 text-sm border border-slate-300 rounded-lg w-full bg-white" />
        </form>
        {[
          { key: "all", label: "전체", color: "bg-slate-900 text-white" },
          { key: "A", label: `A등급 (${pipelineCounts.A})`, color: "bg-green-100 text-green-700" },
          { key: "B", label: `B등급 (${pipelineCounts.B})`, color: "bg-blue-100 text-blue-700" },
          { key: "C", label: `C등급 (${pipelineCounts.C})`, color: "bg-orange-100 text-orange-700" },
        ].map((f) => (
          <button key={f.key} onClick={() => { setGradeFilter(f.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${gradeFilter === f.key ? f.color : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            {f.label}
          </button>
        ))}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="all">전체 상태</option>
          <option value="active">판매중</option>
          <option value="inactive">중지</option>
          <option value="discontinued">정리</option>
        </select>
        <div className="flex items-center bg-blue-50 rounded-lg p-0.5">
          {[
            { key: "all", label: "전체 상품" },
            { key: "ad", label: `광고중(${pipelineCounts.adCount})` },
            { key: "noad", label: `광고없음(${pipelineCounts.noAdCount})` },
          ].map((f) => (
            <button key={f.key} onClick={() => setAdFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${adFilter === f.key ? "bg-white text-blue-700 shadow-sm" : "text-blue-400 hover:text-blue-600"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {displayProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          등록된 상품이 없습니다.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-2.5 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8" />
            <div className="w-[60px]" />
          </div>
          <div className="flex-1 min-w-0 ml-4" />
          <div className="flex items-center shrink-0">
            <div className="w-[72px] text-right text-xs font-medium text-gray-400">옵션</div>
            <div className="w-[80px] text-right text-xs font-medium text-gray-400">방문자▼</div>
            <div className="w-[72px] text-right text-xs font-medium text-gray-400">조회▼</div>
            <div className="w-[80px] text-right text-xs font-medium text-gray-400">장바구니▼</div>
            <div className="w-[72px] text-right text-xs font-medium text-gray-400">주문▼</div>
            <div className="w-[88px] text-right text-xs font-medium text-gray-400">판매량</div>
            <div className="w-[120px] text-right text-xs font-medium text-gray-400">매출 (원) ▼</div>
          </div>
        </div>

        {displayProducts.map((p, index) => {
          const badge = getProductStatusBadge(p.status);
          const t = p.traffic;
          const rank = (page - 1) * PAGE_SIZE + index + 1;
          const isNew = p.createdAt ? (Date.now() - new Date(p.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000 : false;

          return (
            <div
              key={p.id}
              onClick={() => router.push(`/products/${p.id}`)}
              className="flex items-center px-5 py-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex flex-col items-center w-8">
                  <span className="text-sm text-gray-400">#{rank}</span>
                  {isNew && (
                    <span className="mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-600 rounded">NEW</span>
                  )}
                </div>
                <div className="w-[60px] h-[60px] rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {(p.thumbnailUrl || p.imageUrl) ? (
                    <img src={p.thumbnailUrl || p.imageUrl!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0 ml-4">
                <p className="text-base font-semibold text-gray-900 truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                  <span className="text-xs text-gray-400">ID: {p.coupangProductId || p.sku}</span>
                </div>
                {p.category && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {p.category.split('/').slice(-2).join('/')}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {p.abcGrade && (
                    <>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.abcGrade === 'A' ? 'bg-green-100 text-green-700' :
                        p.abcGrade === 'B' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>{p.abcGrade}</span>
                      {p.gradeScore != null && (
                        <span className="text-xs text-gray-500">{p.gradeScore}점</span>
                      )}
                    </>
                  )}
                  {p.healthScore != null && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.healthScore >= 70 ? 'bg-green-50 text-green-700' :
                      p.healthScore >= 40 ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{p.healthScore}</span>
                  )}
                  {p.adTier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      p.adTier === '1차' ? 'bg-blue-50 text-blue-600' :
                      p.adTier === '2차' ? 'bg-purple-50 text-purple-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>{p.adTier} 광고</span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${
                  p.abcGrade === 'A' ? 'text-green-600' :
                  p.abcGrade === 'B' ? 'text-amber-600' :
                  'text-red-500'
                }`}>
                  {p.abcGrade === 'A'
                    ? '→ 핵심 상품 — 매출 집중 관리'
                    : p.abcGrade === 'B' && p.profitRate >= 0
                      ? '→ 성장 가능 — 광고 최적화 추천'
                      : p.abcGrade === 'B' && p.profitRate < 0
                        ? '→ 수익성 개선 필요 — 원가/광고비 점검'
                        : p.abcGrade === 'C' && p.adTier
                          ? '→ 광고 중단 검토 — 매출 대비 광고비 역전'
                          : p.abcGrade === 'C'
                            ? '→ 정리 대상 — 판매 중단 고려'
                            : ''}
                </p>
              </div>

              <div className="flex items-center shrink-0">
                <div className="w-[72px]" />
                <div className="w-[80px] text-right">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {t?.visitors != null ? t.visitors.toLocaleString() : <span className="text-gray-300">-</span>}
                  </p>
                  <p className="text-xs text-gray-400">방문자</p>
                </div>
                <div className="w-[72px] text-right">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {t?.views != null ? t.views.toLocaleString() : <span className="text-gray-300">-</span>}
                  </p>
                  <p className="text-xs text-gray-400">조회</p>
                </div>
                <div className="w-[80px] text-right">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {t?.cartAdds != null ? t.cartAdds.toLocaleString() : <span className="text-gray-300">-</span>}
                  </p>
                  <p className="text-xs text-gray-400">장바구니</p>
                </div>
                <div className="w-[72px] text-right">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {t?.orders != null ? t.orders.toLocaleString() : <span className="text-gray-300">-</span>}
                  </p>
                  <p className="text-xs text-gray-400">주문</p>
                </div>
                <div className="w-[88px] text-right">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {t?.salesQty != null ? t.salesQty.toLocaleString() : <span className="text-gray-300">-</span>}
                  </p>
                  <p className={`text-xs ${getProfitColor(p.profitRate)}`}>이익률 {formatPercent(p.profitRate)}</p>
                </div>
                <div className="w-[120px] text-right">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{formatKRW(t?.revenue ?? p.revenue)}</p>
                  <p className="text-xs text-gray-400">매출 (원)</p>
                </div>
              </div>
            </div>
          );
        })}
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={handlePageChange} />
      </div>
      )}

      {showModal && <AddProductModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchProducts(); }} />}
    </div>
  );
}

function ProductPipeline({ total, aCount, bCount, cCount, minusCount, lowCount, gradeChangeA, gradeChangeB, gradeChangeC, onGradeClick }: {
  total: number; aCount: number; bCount: number; cCount: number; minusCount: number; lowCount: number;
  gradeChangeA: number; gradeChangeB: number; gradeChangeC: number;
  onGradeClick: (grade: string) => void;
}) {
  const nw = 120, nh = 65;
  const gradeChanges: Record<string, number> = { A: gradeChangeA, B: gradeChangeB, C: gradeChangeC };
  const nodes = [
    { id: "minus", label: "적자", value: minusCount, color: "#dc2626", x: 20, y: 40 },
    { id: "low", label: "3%이하", value: lowCount, color: "#d97706", x: 20, y: 170 },
    { id: "total", label: "전체", value: total, color: "#6366f1", x: 290, y: 105 },
    { id: "A", label: "A등급", value: aCount, color: "#22c55e", x: 560, y: 15 },
    { id: "B", label: "B등급", value: bCount, color: "#3b82f6", x: 560, y: 105 },
    { id: "C", label: "C등급", value: cCount, color: "#f97316", x: 560, y: 195 },
  ];
  const edges: [number, number][] = [
    [2, 0], [2, 1], [2, 3], [2, 4], [2, 5],
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Product Pipeline</h3>
        <span className="text-xs text-emerald-600 font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
        </span>
      </div>
      <div className="overflow-x-auto bg-slate-50/50 py-5 px-3">
        <svg width="100%" height={280} viewBox="0 0 720 280" preserveAspectRatio="xMidYMid meet" style={{ minWidth: 500 }}>
          <defs>
            <pattern id="pdots" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="7" cy="7" r="0.4" fill="#dde0e5" />
            </pattern>
          </defs>
          <rect width="720" height="280" fill="url(#pdots)" rx="6" />

          {edges.map(([fi, ti], i) => {
            const f = nodes[fi], t = nodes[ti];
            const goLeft = t.x < f.x;
            const x1 = goLeft ? f.x : f.x + nw;
            const x2 = goLeft ? t.x + nw : t.x;
            return (
              <line key={`pe-${i}`} x1={x1} y1={f.y + nh / 2} x2={x2} y2={t.y + nh / 2}
                stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="5 4" />
            );
          })}

          {nodes.map((n) => (
            <g key={n.id}
              onClick={() => {
                if (n.id === "A" || n.id === "B" || n.id === "C") onGradeClick(n.id);
                else if (n.id === "total") onGradeClick("all");
              }}
              className="cursor-pointer"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.05))" }}
            >
              <rect x={n.x} y={n.y} width={nw} height={nh} rx="10" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
              <rect x={n.x} y={n.y} width={nw} height={nh} rx="10" fill={n.color} opacity="0.06" />
              <text x={n.x + nw / 2} y={n.y + 26} textAnchor="middle" fontSize="24" fontWeight="800"
                fontFamily="ui-monospace, monospace" fill={n.color}>
                {n.value}
              </text>
              <text x={n.x + nw / 2} y={n.y + 44} textAnchor="middle" fontSize="13" fontWeight="600" fill="#374151">
                {n.label}
              </text>
              {n.value > 0 && (
                <circle cx={n.x + nw - 8} cy={n.y + 8} r="3" fill={n.color} className="animate-pulse" />
              )}
              {gradeChanges[n.id] !== undefined && gradeChanges[n.id] !== 0 && (
                <text x={n.x + nw / 2} y={n.y + nh + 16} textAnchor="middle" fontSize="11" fontWeight="600"
                  fill={gradeChanges[n.id] > 0 ? "#16a34a" : "#dc2626"}>
                  {gradeChanges[n.id] > 0 ? `▲ +${gradeChanges[n.id]}` : `▼ ${gradeChanges[n.id]}`}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function AddProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", sku: "", category: "", costPrice: 0, sellPrice: 0, commissionRate: 10, shippingCost: 3000, companyId: "", currentStock: 0,
  });
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiClient.get<{ id: string; name: string }[]>(`/api/companies`).then(setCompanies).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post(`/api/products`, form);
      onSaved();
    } catch (err) {
      alert(isApiError(err) ? err.detail : "상품 등록 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">상품 등록</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">상품명 *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">SKU</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">카테고리</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">회사</label>
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">선택</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">판매가</label>
              <input type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">매입가</label>
              <input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">수수료율 (%)</label>
              <input type="number" step="0.1" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">배송비</label>
              <input type="number" value={form.shippingCost} onChange={(e) => setForm({ ...form, shippingCost: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">초기 재고</label>
              <input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 border rounded-lg text-sm hover:bg-slate-50">취소</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">등록</button>
          </div>
        </form>
      </div>
    </div>
  );
}
