"use client";

import { useState } from "react";
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageSkeleton from "@/components/ui/PageSkeleton";
import type { InventoryItem, InventorySummary, SyncInfo } from '@kiditem/shared';
import { InventoryToolbar } from './components/InventoryToolbar';
import { InventorySummaryCards } from './components/InventorySummaryCards';
import { InventoryFilterTabs } from './components/InventoryFilterTabs';
import { InventoryTable } from './components/InventoryTable';
import { printBarcodeWindow } from './lib/barcode-print';

const DEFAULT_SUMMARY: InventorySummary = { total: 0, reorderCount: 0, outOfStockCount: 0, unsyncedCount: 0, overstockCount: 0 };

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data: inventoryData, isLoading: loading, error: inventoryError } = useQuery({
    queryKey: queryKeys.inventory.list({ filter, page: String(page) }),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter !== "all") params.set("status", filter);
      return apiClient.get<{ items: InventoryItem[]; total: number; summary?: InventorySummary }>(`/api/inventory?${params}`);
    },
  });
  const items = inventoryData?.items ?? [];
  const total = inventoryData?.total ?? 0;
  const summary = inventoryData?.summary ?? DEFAULT_SUMMARY;
  const error = inventoryError ? (isApiError(inventoryError) ? inventoryError.detail : "재고 데이터를 불러오지 못했습니다.") : null;

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

  const handleExcel = async () => {
    const params = new URLSearchParams({ limit: "10000" });
    if (filter !== "all") params.set("status", filter);
    const data = await apiClient.get<{ items: InventoryItem[] }>(`/api/inventory?${params}`);
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
      const data = await apiClient.get<{ total: number }>(`/api/inventory?status=reorder&limit=1`);
      toast.info(`재고 부족 상품: ${data.total}건 — 발주가 필요한 상품을 확인하세요.`);
      if (data.total > 0) {
        setFilter("reorder");
        setPage(1);
      }
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : "재고 부족 체크에 실패했습니다.");
    }
  };

  const handleReceiveStock = async () => {
    const term = prompt('입고할 상품명 또는 SKU:');
    if (!term) return;

    try {
      const data = await apiClient.get<{ items: { id: string; name: string; sku: string | null; currentStock: number }[] }>(`/api/products?search=${encodeURIComponent(term)}&limit=5&status=active`);
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

      let invData;
      try {
        invData = await apiClient.get<{ id: string }>(`/api/inventory/by-product/${selectedProduct.id}`);
      } catch {
        alert('해당 상품의 재고 항목이 없습니다.');
        return;
      }

      const result = await apiClient.patch<{ productName: string; received: number; currentStock: number }>(`/api/inventory/${invData.id}/receive`, { quantity: qty });
      toast.success(`입고 완료 — ${result.productName}: ${result.received}개 입고, 현재고 ${result.currentStock}개`);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '입고 처리 중 오류가 발생했습니다.');
    }
  };

  const handleBarcodePrint = () => {
    if (items.length === 0) {
      alert('출력할 상품이 없습니다.');
      return;
    }
    printBarcodeWindow(items);
  };

  const coupangSync = useMutation({
    mutationFn: () => apiClient.post<{ synced?: number }>(`/api/coupang-sync/products`),
    onSuccess: (data) => {
      toast.success(`쿠팡 동기화 완료: ${data.synced ?? 0}건 동기화됨`);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : "쿠팡 동기화에 실패했습니다. 설정을 확인하세요.");
    },
  });
  const syncing = coupangSync.isPending;

  const handleCoupangSync = () => {
    if (syncing) return;
    coupangSync.mutate();
  };

  if (loading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6">
      <InventoryToolbar
        syncing={syncing}
        syncInfo={syncInfo}
        onReceiveStock={handleReceiveStock}
        onBarcodePrint={handleBarcodePrint}
        onStockCheck={handleStockCheck}
        onCoupangSync={handleCoupangSync}
        onExcel={handleExcel}
      />
      {error && <div className="text-center py-8 text-red-500">{error}</div>}
      <InventorySummaryCards summary={summary} />
      <InventoryFilterTabs
        filter={filter}
        summary={summary}
        onFilterChange={(key) => { setFilter(key); setPage(1); }}
      />
      <InventoryTable items={items} page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        다음 정기 재고 점검: <strong>2개월 주기</strong> | 적정재고 = 일평균판매량 x (리드타임 + 안전일수7일)
      </div>
    </div>
  );
}
