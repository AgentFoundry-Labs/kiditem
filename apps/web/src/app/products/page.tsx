"use client";
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import type { ProductListItem as Product, SyncInfo, PipelineCounts } from '@kiditem/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useState, useRef } from "react";
import { Plus, Download, Search, BarChart3 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import PageSkeleton from "@/components/ui/PageSkeleton";
import ProductPipeline from "./components/ProductPipeline";
import AddProductModal from "./components/AddProductModal";
import ProductListItem from "./components/ProductListItem";

const DEFAULT_PIPELINE: PipelineCounts = { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, minus: 0, low: 0, gradeChangeA: 0, gradeChangeB: 0, gradeChangeC: 0, adCount: 0, noAdCount: 0 };

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [adFilter, setAdFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState(7);
  const [trafficMsg, setTrafficMsg] = useState("");
  const trafficRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  // Products query
  const queryParams: Record<string, string> = {
    page: String(page), limit: String(PAGE_SIZE), period: String(period),
    ...(gradeFilter !== "all" && { grade: gradeFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(submittedSearch && { search: submittedSearch }),
  };
  const { data: productsData, isLoading: loading, error: productsError } = useQuery({
    queryKey: queryKeys.products.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.get<{ items: Product[]; total: number }>(`/api/products?${params}`);
    },
  });
  const products = productsData?.items ?? [];
  const total = productsData?.total ?? 0;
  const error = productsError ? (isApiError(productsError) ? productsError.detail : "상품 목록을 불러오지 못했습니다.") : null;

  // Pipeline stats query
  const { data: pipelineCounts = DEFAULT_PIPELINE } = useQuery({
    queryKey: queryKeys.products.pipelineStats(statusFilter !== "all" ? statusFilter : undefined),
    queryFn: () => {
      const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return apiClient.get<PipelineCounts>(`/api/products/pipeline-stats${statusParam}`);
    },
  });

  // Sync info query
  const { data: syncInfo } = useQuery({
    queryKey: queryKeys.syncInfo(),
    queryFn: async () => {
      try {
        const data = await apiClient.get<{ lastSyncedAt: string | null }>(`/api/coupang-dashboard`);
        return { lastSyncedAt: data.lastSyncedAt } as SyncInfo;
      } catch {
        return { lastSyncedAt: null } as SyncInfo;
      }
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedSearch(search);
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
    onError: (err) => {
      setTrafficMsg(isApiError(err) ? err.detail : "업로드 실패");
    },
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
              <button key={p.days} onClick={() => { setPeriod(p.days); setPage(1); }}
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
        aCount={pipelineCounts.gradeA}
        bCount={pipelineCounts.gradeB}
        cCount={pipelineCounts.gradeC}
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
          { key: "A", label: `A등급 (${pipelineCounts.gradeA})`, color: "bg-green-100 text-green-700" },
          { key: "B", label: `B등급 (${pipelineCounts.gradeB})`, color: "bg-blue-100 text-blue-700" },
          { key: "C", label: `C등급 (${pipelineCounts.gradeC})`, color: "bg-orange-100 text-orange-700" },
        ].map((f) => (
          <button key={f.key} onClick={() => { setGradeFilter(f.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${gradeFilter === f.key ? f.color : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            {f.label}
          </button>
        ))}
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white">
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

        {displayProducts.map((p, index) => (
          <ProductListItem
            key={p.id}
            product={p}
            rank={(page - 1) * PAGE_SIZE + index + 1}
          />
        ))}
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={handlePageChange} />
      </div>
      )}

      {showModal && <AddProductModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: queryKeys.products.all }); }} />}
    </div>
  );
}
