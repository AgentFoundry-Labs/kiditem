'use client';

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download, Upload, Search, Package,
  TrendingUp, TrendingDown, AlertTriangle, ArrowRight,
  ChevronDown,
} from "lucide-react";
import { formatKRW, getGradeColor, getProductStatusBadge } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ProductCatalogCountsSchema,
  ProductCatalogListResponseSchema,
  type ProductCatalogCounts,
  type ProductCatalogListItem as Product,
} from "@kiditem/shared/product";
import PageSkeleton from "@/components/ui/PageSkeleton";
import AddProductModal from "../../products/components/AddProductModal";
import ExcelUploadModal from "../../products/components/ExcelUploadModal";

const DEFAULT_PIPELINE: ProductCatalogCounts = {
  total: 0,
  gradeA: 0,
  gradeB: 0,
  gradeC: 0,
  adCount: 0,
  noAdCount: 0,
  draftCount: 0,
  processingCount: 0,
  processedCount: 0,
  discontinuedCount: 0,
  temporaryCount: 0,
};
const PAGE_SIZE = 20;

function formatRange(range: { min: number; max: number } | null): string {
  if (!range) return '-';
  if (range.min === range.max) return `${formatKRW(range.min)}원`;
  return `${formatKRW(range.min)}-${formatKRW(range.max)}원`;
}

export default function ProductsListView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [submittedSearch, setSubmittedSearch] = useState(() => searchParams.get("search") ?? "");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adFilter, setAdFilter] = useState<"all" | "ad" | "noad">("all");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const queryParams: Record<string, string> = {
    page: String(page),
    limit: String(PAGE_SIZE),
    ...(gradeFilter !== "all" && { grade: gradeFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(submittedSearch && { search: submittedSearch }),
  };

  const { data: productsData, isLoading, error: productsError } = useQuery({
    queryKey: queryKeys.products.catalog.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.getParsed(`/api/products/catalog?${params}`, ProductCatalogListResponseSchema);
    },
  });

  const allProducts = productsData?.items ?? [];
  const totalCount = productsData?.total ?? 0;

  const { data: pipelineCounts = DEFAULT_PIPELINE } = useQuery({
    queryKey: queryKeys.products.catalog.counts(statusFilter !== "all" ? statusFilter : undefined),
    queryFn: () => {
      const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return apiClient.getParsed(`/api/products/catalog/counts${statusParam}`, ProductCatalogCountsSchema);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedSearch(search);
  };

  const handleExcelDownload = async () => {
    // Catalog API caps a single response at limit=200, so we page through until
    // every row in `total` is fetched before writing the workbook.
    const EXPORT_PAGE_SIZE = 200;
    const baseParams = new URLSearchParams();
    if (gradeFilter !== "all") baseParams.set("grade", gradeFilter);
    if (statusFilter !== "all") baseParams.set("status", statusFilter);
    if (submittedSearch) baseParams.set("search", submittedSearch);
    baseParams.set("limit", String(EXPORT_PAGE_SIZE));

    const collected: Product[] = [];
    let page = 1;
    let total = Infinity;
    while (collected.length < total) {
      const params = new URLSearchParams(baseParams);
      params.set("page", String(page));
      const data = await apiClient.getParsed(`/api/products/catalog?${params}`, ProductCatalogListResponseSchema);
      total = data.total;
      collected.push(...data.items);
      if (data.items.length < EXPORT_PAGE_SIZE) break;
      page += 1;
    }

    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        collected.map((p) => ({
          등급: p.abcGrade ?? '',
          상품명: p.name,
          상품코드: p.code,
          // ADR-0022 — source barcode/EAN from kiditem_list. Distinct from option SKU.
          'EAN/자사상품코드': p.barcode ?? '',
          SKU: p.representativeSku ?? '',
          카테고리: p.category ?? '',
          브랜드: p.brand ?? '',
          옵션수: p.optionCount,
          매입가_최소: p.costRange?.min ?? '',
          매입가_최대: p.costRange?.max ?? '',
          판매가_최소: p.priceRange?.min ?? '',
          판매가_최대: p.priceRange?.max ?? '',
          재고: p.totalAvailableStock,
          파이프라인: p.pipelineStep ?? '',
          광고등급: p.adTier ?? '',
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

  const filtered = allProducts.filter(
    (p) => adFilter === "all" || (adFilter === "ad" ? !!p.adTier : !p.adTier)
  );

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const productGroupMap = new Map<string, Product[]>();
  for (const p of filtered) {
    if (!productGroupMap.has(p.name)) productGroupMap.set(p.name, []);
    productGroupMap.get(p.name)!.push(p);
  }
  const productGroups: Product[][] = [...productGroupMap.values()];

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const renderProductCard = (p: Product, key: string, isChild = false) => {
    const badge = getProductStatusBadge(p.pipelineStep ?? 'draft');
    return (
      <div key={key}
        className={`bg-white rounded-xl border border-slate-200 px-6 ${isChild ? "py-4 border-l-[3px] border-l-blue-300" : "py-5"} flex items-start hover:shadow-sm transition-shadow`}>
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={`${isChild ? "w-[72px] h-[72px]" : "w-[88px] h-[88px]"} rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0 relative`}>
            {(p.thumbnailUrl || p.imageUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(p.thumbnailUrl || p.imageUrl)!} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">NO IMG</div>
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <a href={`/products/${p.id}`} className="text-[16px] font-bold text-slate-900 leading-snug line-clamp-2 hover:underline">{p.name}</a>
            <div className="text-[11px] text-slate-400 mt-1.5 space-x-1">
              <span>코드: {p.code}</span>
              {p.representativeSku && <span>&#183; SKU: {p.representativeSku}</span>}
              {p.barcode && <span>&#183; EAN: <span className="font-mono">{p.barcode}</span></span>}
              {p.optionCount > 0 && <span>&#183; 옵션 {p.optionCount}개</span>}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              카테고리: {p.category || "-"}
              {p.brand && <> &#183; 브랜드: {p.brand}</>}
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {p.abcGrade && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(p.abcGrade)}`}>{p.abcGrade}</span>
              )}
              {p.adTier && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">{p.adTier} 광고</span>}
              {badge.label !== "판매중" && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>{badge.label}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start shrink-0">
          <div className="w-[140px] text-center">
            <div className="text-[16px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatRange(p.costRange)}
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>매입가</div>
          </div>
          <div className="w-[140px] text-center">
            <div className="text-[16px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatRange(p.priceRange)}
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>판매가</div>
          </div>
          <div className="w-[120px] text-right">
            <div className="text-[22px] font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
              {p.totalAvailableStock.toLocaleString()}
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>재고</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
            <Package size={20} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>상품관리</h1>
        </div>
        <div className="flex items-center gap-2">
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

      {(() => {
        const cards = [
          { key: "all", label: "전체 상품", value: pipelineCounts.total, color: "var(--primary)", icon: Package },
          { key: "A", label: "A등급", value: pipelineCounts.gradeA, color: "#00c471", icon: TrendingUp },
          { key: "B", label: "B등급", value: pipelineCounts.gradeB, color: "#f59e0b", icon: ArrowRight },
          { key: "C", label: "C등급", value: pipelineCounts.gradeC, color: "#f97316", icon: TrendingDown },
        ];
        return (
          <div className="grid grid-cols-4 gap-3">
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
                  </div>
                  <div className="text-3xl font-black tabular-nums" style={{ color: isActive ? "#fff" : "var(--text-primary)" }}>{card.value}</div>
                  <div className="text-[14px] font-semibold mt-0.5" style={{ color: isActive ? "rgba(255,255,255,0.75)" : "var(--text-tertiary)" }}>{card.label}</div>
                </button>
              );
            })}
          </div>
        );
      })()}

      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명 · 코드 · SKU 검색"
            className="h-10 pl-9 pr-3 text-[14px] rounded-xl w-full"
            style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
        </form>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
          <option value="all">전체 상태</option>
          <option value="draft">초안</option>
          <option value="processing">처리중</option>
          <option value="processed">완료</option>
          <option value="discontinued">단종</option>
        </select>
        <div className="flex items-center rounded-xl p-1" style={{ background: "var(--surface-sunken)" }}>
          {[{ key: "all" as const, label: "전체" }, { key: "ad" as const, label: "광고중" }, { key: "noad" as const, label: "광고없음" }].map((f) => (
            <button key={f.key} onClick={() => setAdFilter(f.key)}
              className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
              style={adFilter === f.key ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-tertiary)" }}>{totalCount}개 표시</span>
      </div>

      <div className="flex items-center px-6 py-2 text-[12px] font-semibold" style={{ color: "var(--text-quaternary)" }}>
        <div className="flex-1">상품</div>
        <div className="flex items-center shrink-0">
          <div className="w-[140px] text-center">매입가</div>
          <div className="w-[140px] text-center">판매가</div>
          <div className="w-[120px] text-right">재고</div>
        </div>
      </div>

      <div className="relative">
        {isLoading && allProducts.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-20 rounded-xl" style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(2px)" }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)" }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>불러오는 중...</span>
            </div>
          </div>
        )}
        {productGroups.length === 0 && !isLoading ? (
          <div className="rounded-xl p-12 text-center" style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
            등록된 상품이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {productGroups.map((group) => {
              if (group.length === 1) {
                return renderProductCard(group[0], group[0].id);
              }

              const groupName = group[0].name;
              const isExpanded = expandedGroups.has(groupName);
              const groupStock = group.reduce((sum, p) => sum + p.totalAvailableStock, 0);

              return (
                <div key={groupName} className="space-y-1.5">
                  <div
                    className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    onClick={() => toggleGroup(groupName)}
                  >
                    <div className="w-7 shrink-0 flex items-center justify-center">
                      <ChevronDown
                        size={16}
                        className="text-slate-400 transition-transform duration-200"
                        style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                    </div>
                    {(group[0].thumbnailUrl || group[0].imageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(group[0].thumbnailUrl || group[0].imageUrl)!}
                        alt={groupName}
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-[15px]">{groupName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-600">
                          {group.length}개 상품
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {group.map((p) => p.representativeSku || p.code).filter(Boolean).slice(0, 4).join(" · ")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[20px] font-black tabular-nums text-slate-900">{groupStock.toLocaleString()}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">합계 재고</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pl-5 space-y-1.5">
                      {group.map((p) => renderProductCard(p, `${groupName}-${p.id}`, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
          onSaved={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: queryKeys.products.catalog.all }); }}
        />
      )}

      {showUploadModal && (
        <ExcelUploadModal
          onClose={() => setShowUploadModal(false)}
          onComplete={() => { setShowUploadModal(false); queryClient.invalidateQueries({ queryKey: queryKeys.products.catalog.all }); }}
        />
      )}
    </div>
  );
}
