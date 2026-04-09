'use client';
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import type { ProductListItem as Product, SyncInfo, PipelineCounts } from "@kiditem/shared";
import { queryKeys } from "@/lib/query-keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import PageSkeleton from "@/components/ui/PageSkeleton";
import ProductPipeline from "./components/ProductPipeline";
import AddProductModal from "./components/AddProductModal";
import ProductPageHeader from "./components/ProductPageHeader";
import ProductFilterBar from "./components/ProductFilterBar";
import ProductListTable from "./components/ProductListTable";

const DEFAULT_PIPELINE: PipelineCounts = { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, minus: 0, low: 0, gradeChangeA: 0, gradeChangeB: 0, gradeChangeC: 0, adCount: 0, noAdCount: 0 };
const PAGE_SIZE = 50;

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

  const { data: pipelineCounts = DEFAULT_PIPELINE } = useQuery({
    queryKey: queryKeys.products.pipelineStats(statusFilter !== "all" ? statusFilter : undefined),
    queryFn: () => {
      const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return apiClient.get<PipelineCounts>(`/api/products/pipeline-stats${statusParam}`);
    },
  });

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
          등급: p.abcGrade, 상품명: p.name, SKU: p.sku, 카테고리: p.category,
          회사: p.company, 매입가: p.costPrice, 판매가: p.sellPrice,
          수수료율: p.commissionRate, 배송비: p.shippingCost, 매출: p.revenue,
          순이익: p.netProfit, 이익률: p.profitRate, 광고비율: p.adRate,
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

  const displayProducts = adFilter === "all"
    ? products
    : adFilter === "ad"
      ? products.filter((p) => p.adTier)
      : products.filter((p) => !p.adTier);

  if (loading) return <PageSkeleton variant="table" />;
  if (error) return <div className="flex items-center justify-center h-64 text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <ProductPageHeader
        total={total}
        period={period}
        onPeriodChange={(days) => { setPeriod(days); setPage(1); }}
        trafficRef={trafficRef}
        onTrafficUpload={handleTrafficUpload}
        trafficMsg={trafficMsg}
        onExcelDownload={handleExcelDownload}
        onAddProduct={() => setShowModal(true)}
        syncInfo={syncInfo}
      />
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
      <ProductFilterBar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={handleSearch}
        gradeFilter={gradeFilter}
        onGradeChange={(g) => { setGradeFilter(g); setPage(1); }}
        statusFilter={statusFilter}
        onStatusChange={(s) => { setStatusFilter(s); setPage(1); }}
        adFilter={adFilter}
        onAdFilterChange={setAdFilter}
        pipelineCounts={pipelineCounts}
      />
      <ProductListTable
        displayProducts={displayProducts}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />
      {showModal && (
        <AddProductModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: queryKeys.products.all }); }}
        />
      )}
    </div>
  );
}
