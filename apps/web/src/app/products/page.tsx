"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, Upload, Search } from "lucide-react";
import { formatKRW, formatPercent, getGradeColor, getProfitColor, getProductStatusBadge, timeAgo } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  company: string;
  costPrice: number;
  sellPrice: number;
  commissionRate: number;
  shippingCost: number;
  status: string;
  abcGrade: string;
  adTier: string | null;
  currentStock: number;
  reorderPoint: number;
  revenue: number;
  netProfit: number;
  profitRate: number;
  adRate: number;
  reviewCount: number;
  orderCount: number;
  thumbnailCTR: number;
}

interface SyncInfo {
  lastSyncedAt: string | null;
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const PAGE_SIZE = 50;

  const fetchProducts = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (gradeFilter !== "all") params.set("grade", gradeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    try {
      const res = await fetch(`${API_BASE}/api/products?${params}`);
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      const data = await res.json();
      setProducts(data.items);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상품 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [gradeFilter, statusFilter, search, page]);

  useEffect(() => {
    // Fetch sync info
    fetch(`${API_BASE}/api/coupang-dashboard`)
      .then(r => r.json())
      .then(data => setSyncInfo({ lastSyncedAt: data.lastSyncedAt }))
      .catch(() => setSyncInfo({ lastSyncedAt: null }));
  }, []);

  useEffect(() => {
    setPage(1);
    fetchProducts(1);
  }, [gradeFilter, statusFilter]);

  useEffect(() => {
    fetchProducts();
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
    const res = await fetch(`${API_BASE}/api/products?${params}`);
    const data = await res.json();
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

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">로딩 중...</div>;
  if (error) return <div className="flex items-center justify-center h-64 text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">상품 관리</h1>
          <div className="flex gap-2">
             <button onClick={handleExcelDownload} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
               <Download size={16} /> 엑셀 다운로드
             </button>
             <button disabled className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed">
               <Upload size={16} /> 엑셀 업로드 (준비중)
             </button>
             <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
               <Plus size={16} /> 상품 등록
             </button>
           </div>
        </div>
        {syncInfo && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
            <div className={`w-1.5 h-1.5 rounded-full ${syncInfo.lastSyncedAt ? 'bg-green-400' : 'bg-amber-400'}`} />
            {syncInfo.lastSyncedAt 
              ? `최근 동기화: ${timeAgo(syncInfo.lastSyncedAt)}`
              : '동기화 기록 없음 — 설정에서 동기화를 실행하세요'}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1">
          <Search size={18} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 또는 SKU 검색..."
            className="flex-1 border-none outline-none text-sm"
          />
          <button type="submit" className="px-3 py-1.5 bg-slate-100 rounded text-sm hover:bg-slate-200">검색</button>
        </form>
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">전체 등급</option>
          <option value="A">A등급</option>
          <option value="B">B등급</option>
          <option value="C">C등급</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">전체 상태</option>
          <option value="active">판매중</option>
          <option value="inactive">중지</option>
          <option value="discontinued">정리</option>
        </select>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-slate-500">전체 <strong className="text-slate-900">{total}개</strong></span>
      </div>

      {/* Table */}
      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          등록된 상품이 없습니다.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="bg-slate-50">
                <th>등급</th>
                <th>상품명</th>
                <th>SKU</th>
                <th>회사</th>
                <th className="text-right">판매가</th>
                <th className="text-right">매입가</th>
                <th className="text-right">매출</th>
                <th className="text-right">순이익</th>
                <th className="text-right">이익률</th>
                <th className="text-right">광고비율</th>
                <th className="text-right">재고</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const badge = getProductStatusBadge(p.status);
                return (
                  <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} className={`cursor-pointer hover:bg-slate-50 ${p.profitRate < 0 ? "bg-red-50/50" : p.profitRate <= 3 ? "bg-orange-50/30" : ""}`}>
                    <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(p.abcGrade)}`}>{p.abcGrade}</span></td>
                    <td className="font-medium text-slate-900 max-w-[200px] truncate">{p.name}</td>
                    <td className="text-slate-500 text-xs font-mono">{p.sku}</td>
                    <td className="text-slate-500 text-xs">{p.company}</td>
                    <td className="text-right">{formatKRW(p.sellPrice)}</td>
                    <td className="text-right text-slate-500">{formatKRW(p.costPrice)}</td>
                    <td className="text-right">{formatKRW(p.revenue)}</td>
                    <td className={`text-right ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}</td>
                    <td className={`text-right ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</td>
                    <td className={`text-right ${p.adRate > 15 ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                      {p.adRate > 0 ? formatPercent(p.adRate) : "-"}
                    </td>
                    <td className={`text-right ${p.currentStock <= p.reorderPoint ? "text-red-600 font-semibold" : ""}`}>
                      {p.currentStock}
                    </td>
                    <td><span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>{badge.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={handlePageChange} />
      </div>
      )}

      {/* Add Product Modal */}
      {showModal && <AddProductModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchProducts(); }} />}
    </div>
  );
}

function AddProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", sku: "", category: "", costPrice: 0, sellPrice: 0, commissionRate: 10, shippingCost: 3000, companyId: "", currentStock: 0,
  });
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/companies`).then(r => r.json()).then(setCompanies).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`상품 등록 실패: ${res.status} ${msg}`);
        return;
      }
      onSaved();
    } catch (err) {
      alert("상품 등록 중 오류가 발생했습니다.");
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
