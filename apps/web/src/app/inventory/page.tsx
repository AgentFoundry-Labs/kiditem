"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, AlertTriangle, Truck, Download, RefreshCw, ClipboardCheck, Barcode } from "lucide-react";
import { API_BASE } from "@/lib/api";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { timeAgo } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";

function isUnsynced(item: InventoryItem): boolean {
  return item.currentStock === 0 && item.avgDailySales === 0 && item.optimalStock <= item.safetyStock;
}

interface InventorySummary {
  total: number;
  reorderCount: number;
  outOfStockCount: number;
  unsyncedCount: number;
  overstockCount: number;
}

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  company: string;
  grade: string;
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  avgDailySales: number;
  optimalStock: number;
  daysRemaining: number;
  recommendedOrder: number;
  status: string;
}

interface SyncInfo {
  lastSyncedAt: string | null;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [summary, setSummary] = useState<InventorySummary>({ total: 0, reorderCount: 0, outOfStockCount: 0, unsyncedCount: 0, overstockCount: 0 });
  const PAGE_SIZE = 50;

  const fetchInventory = useCallback(async (p = page, f = filter) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      if (f !== "all") params.set("status", f);
      const res = await fetch(`${API_BASE}/api/inventory?${params}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "재고 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    // Fetch sync info
    fetch(`${API_BASE}/api/coupang-dashboard`)
      .then(r => r.json())
      .then(data => setSyncInfo({ lastSyncedAt: data.lastSyncedAt }))
      .catch(() => setSyncInfo({ lastSyncedAt: null }));
  }, []);

  useEffect(() => {
    fetchInventory(1, filter);
    setPage(1);
  }, [filter]);

  useEffect(() => {
    fetchInventory();
  }, [page]);

  const [syncing, setSyncing] = useState(false);

  const handleExcel = async () => {
    const params = new URLSearchParams({ limit: "10000" });
    if (filter !== "all") params.set("status", filter);
    const res = await fetch(`${API_BASE}/api/inventory?${params}`);
    const data = await res.json();
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        data.items.map((d: InventoryItem) => ({
          등급: d.grade, 상품명: d.productName, SKU: d.sku, 회사: d.company,
          현재고: d.currentStock, 안전재고: d.safetyStock, 발주점: d.reorderPoint,
          "일평균판매": d.avgDailySales, 적정재고: d.optimalStock,
          "남은일수": d.daysRemaining, 추천발주량: d.recommendedOrder, 상태: d.status,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "재고현황");
      XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const handleStockCheck = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/inventory?status=reorder&limit=1`);
      const data = await res.json();
      alert(`재고 부족 상품: ${data.total}건\n발주가 필요한 상품을 확인하세요.`);
      if (data.total > 0) {
        setFilter("reorder");
      }
    } catch {
      alert("재고 부족 체크에 실패했습니다.");
    }
  };

  const handleReceiveStock = async () => {
    const term = prompt('입고할 상품명 또는 SKU:');
    if (!term) return;

    try {
      const res = await fetch(`${API_BASE}/api/products?search=${encodeURIComponent(term)}&limit=5&status=active`);
      const data = await res.json();
      const products: { id: string; name: string; sku: string | null; currentStock: number }[] = data.items ?? [];

      if (products.length === 0) {
        alert('검색 결과가 없습니다.');
        return;
      }

      let selectedProduct = products[0];
      if (products.length > 1) {
        const list = products.map((p, i) => `${i + 1}. ${p.name}${p.sku ? ` (${p.sku})` : ''} [재고: ${p.currentStock}]`).join('\n');
        const choice = prompt(`상품을 선택하세요:\n${list}`);
        if (!choice) return;
        const idx = parseInt(choice, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= products.length) {
          alert('잘못된 선택입니다.');
          return;
        }
        selectedProduct = products[idx];
      }

      const qtyStr = prompt(`"${selectedProduct.name}" 입고 수량:`);
      if (!qtyStr) return;
      const qty = parseInt(qtyStr, 10);
      if (isNaN(qty) || qty <= 0) {
        alert('수량은 1 이상의 숫자를 입력하세요.');
        return;
      }

      const invRes = await fetch(`${API_BASE}/api/inventory/by-product/${selectedProduct.id}`);
      if (!invRes.ok) {
        alert('해당 상품의 재고 항목이 없습니다.');
        return;
      }
      const invData = await invRes.json();

      const patchRes = await fetch(`${API_BASE}/api/inventory/${invData.id}/receive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        alert(`입고 실패: ${err.message ?? '알 수 없는 오류'}`);
        return;
      }

      const result = await patchRes.json();
      alert(`✅ 입고 완료\n상품: ${result.productName}\n입고 수량: ${result.received}개\n현재고: ${result.currentStock}개`);
      fetchInventory();
    } catch {
      alert('입고 처리 중 오류가 발생했습니다.');
    }
  };

  const handleBarcodePrint = () => {
    if (items.length === 0) {
      alert('출력할 상품이 없습니다.');
      return;
    }

    const barcodeItems = items.map((item) => {
      const code = item.sku || item.productId;
      const bars = code
        .split('')
        .map((ch) => {
          const v = ch.charCodeAt(0);
          return (v % 2 === 0 ? '█' : '▌') + (v % 3 === 0 ? '█' : '▐');
        })
        .join('');

      return `
        <div style="display:inline-block; width:280px; padding:20px; margin:10px; border:1px solid #ddd; text-align:center; page-break-inside:avoid; vertical-align:top;">
          <div style="font-family:'Courier New',monospace; font-size:28px; letter-spacing:1px; line-height:1; margin-bottom:6px; overflow:hidden; white-space:nowrap;">${bars}</div>
          <div style="font-family:'Courier New',monospace; font-size:13px; letter-spacing:2px; margin-bottom:4px;">${code}</div>
          <div style="font-size:12px; color:#333; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">${item.productName}</div>
          <div style="font-size:11px; color:#666;">재고: ${item.currentStock.toLocaleString('ko-KR')}개</div>
        </div>`;
    });

    const html = `<!DOCTYPE html>
<html><head><title>바코드 출력 - ${new Date().toISOString().slice(0, 10)}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 10mm; } }
  body { font-family: -apple-system, sans-serif; padding: 20px; }
</style>
</head><body>
<h2 style="margin-bottom:20px;">바코드 출력 (${items.length}건)</h2>
${barcodeItems.join('')}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const handleCoupangSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/api/coupang-sync/products`, { method: "POST" });
      if (!res.ok) throw new Error("동기화 실패");
      const data = await res.json();
      alert(`쿠팡 동기화 완료: ${data.synced ?? 0}건 동기화됨`);
      fetchInventory();
    } catch {
      alert("쿠팡 동기화에 실패했습니다. 설정을 확인하세요.");
    } finally {
      setSyncing(false);
    }
  };



  if (loading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">재고/발주 관리</h1>
          <div className="flex items-center gap-2">
            <button onClick={handleReceiveStock} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
              <ClipboardCheck size={16} /> 검수 입고
            </button>
            <button onClick={handleBarcodePrint} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm font-medium">
              <Barcode size={16} /> 바코드 출력
            </button>
            <button onClick={handleStockCheck} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium">
              <AlertTriangle size={16} /> 재고 부족 체크
            </button>
            <button onClick={handleCoupangSync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 text-sm font-medium disabled:opacity-50">
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "동기화 중..." : "쿠팡 동기화"}
            </button>
            <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <Download size={16} /> 엑셀
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

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-3">
          <Package size={20} className="text-blue-600" />
          <div><div className="text-sm text-slate-500">전체 상품</div><div className="text-xl font-bold">{summary.total}개</div></div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-600" />
          <div><div className="text-sm text-red-600">발주 필요</div><div className="text-xl font-bold text-red-700">{summary.reorderCount}개</div></div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 flex items-center gap-3">
          <Package size={20} className="text-orange-600" />
          <div><div className="text-sm text-orange-600">품절</div><div className="text-xl font-bold text-orange-700">{summary.outOfStockCount}개</div></div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center gap-3">
          <RefreshCw size={20} className="text-amber-600" />
          <div><div className="text-sm text-amber-600">동기화 필요</div><div className="text-xl font-bold text-amber-700">{summary.unsyncedCount}개</div></div>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 flex items-center gap-3">
          <Truck size={20} className="text-yellow-600" />
          <div><div className="text-sm text-yellow-600">과재고</div><div className="text-xl font-bold text-yellow-700">{summary.overstockCount}개</div></div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "전체", count: summary.total },
          { key: "reorder", label: "발주 필요", count: summary.reorderCount },
          { key: "overstock", label: "과재고", count: summary.overstockCount },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === f.key ? "bg-blue-600 text-white" : "bg-white border border-slate-200 hover:bg-slate-50"}`}>
            {f.label} ({f.count.toLocaleString('ko-KR')})
          </button>
        ))}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          재고 데이터가 없습니다.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table>
          <thead>
            <tr className="bg-slate-50">
              <th>상품명</th>
              <th>SKU</th>
              <th>회사</th>
              <th className="text-right">현재고</th>
              <th className="text-right">적정재고</th>
              <th className="text-right">일평균판매</th>
              <th className="text-right">남은일수</th>
              <th className="text-right">추천발주량</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const unsynced = isUnsynced(i);
              const rowStatus = unsynced ? "unsynced" : i.status;
              return (
              <tr key={i.id} className={unsynced ? "bg-amber-50/30" : i.status === "critical" ? "bg-red-50/50" : i.status === "warning" ? "bg-orange-50/30" : ""}>
                <td className="font-medium text-slate-900">{i.productName}</td>
                <td className="text-slate-500 text-xs font-mono">{i.sku}</td>
                <td className="text-slate-500 text-xs">{i.company}</td>
                <td className={`text-right font-semibold ${unsynced ? "text-amber-600" : i.currentStock === 0 ? "text-red-600" : i.currentStock <= i.reorderPoint ? "text-orange-600" : ""}`}>
                  {i.currentStock.toLocaleString('ko-KR')}
                </td>
                <td className="text-right text-slate-500">{i.optimalStock.toLocaleString('ko-KR')}</td>
                <td className="text-right">{i.avgDailySales}</td>
                <td className={`text-right font-semibold ${unsynced ? "" : i.daysRemaining <= 7 ? "text-red-600" : i.daysRemaining <= 14 ? "text-orange-500" : ""}`}>
                  {i.daysRemaining}일
                </td>
                <td className="text-right font-semibold text-blue-600">
                  {i.recommendedOrder > 0 ? `${i.recommendedOrder.toLocaleString('ko-KR')}개` : "-"}
                </td>
                <td>
                  <StatusBadge status={rowStatus} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
      )}

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        다음 정기 재고 점검: <strong>2개월 주기</strong> | 적정재고 = 일평균판매량 x (리드타임 + 안전일수7일)
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    normal: "bg-green-100 text-green-800",
    warning: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
    overstock: "bg-yellow-100 text-yellow-800",
    unsynced: "bg-amber-100 text-amber-700",
  };
  const labels: Record<string, string> = {
    normal: "정상",
    warning: "발주필요",
    critical: "긴급발주",
    overstock: "과재고",
    unsynced: "동기화 필요",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>{labels[status] ?? status}</span>;
}
