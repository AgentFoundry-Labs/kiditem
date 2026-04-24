'use client';

import { useState } from "react";
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from "@/components/ui/PageSkeleton";
import { InventoryToolbar } from './components/InventoryToolbar';
import { InventorySummaryCards } from './components/InventorySummaryCards';
import { InventoryFilterTabs } from './components/InventoryFilterTabs';
import { InventoryTable } from './components/InventoryTable';
import { printBarcodeWindow } from './lib/barcode-print';
import type { InventoryListItem, InventorySummary, SyncInfo } from '@kiditem/shared';

const DEFAULT_SUMMARY: InventorySummary = { total: 0, healthy: 0, low: 0, out: 0 };

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
      return apiClient.get<{ items: InventoryListItem[]; total: number; summary?: InventorySummary }>(`/api/inventory?${params}`);
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
    const data = await apiClient.get<{ items: InventoryListItem[] }>(`/api/inventory?${params}`);
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        data.items.map((d: InventoryListItem) => ({
          상품명: d.masterName,
          옵션: d.optionName ?? '',
          SKU: d.sku,
          종류: d.kind,
          현재고: d.currentStock,
          가용재고: d.availableStock,
          안전재고: d.safetyStock,
          발주시점: d.reorderPoint,
          리드타임_일: d.leadTimeDays ?? '',
          창고: d.warehouseLocation ?? '',
          상태: d.status,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "재고현황");
      XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const handleStockCheck = async () => {
    try {
      const data = await apiClient.get<{ total: number }>(`/api/inventory?status=low&limit=1`);
      toast.info(`재고 부족 상품: ${data.total}건 — 발주가 필요한 상품을 확인하세요.`);
      if (data.total > 0) {
        setFilter('low');
        setPage(1);
      }
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : "재고 부족 체크에 실패했습니다.");
    }
  };

  const handleReceiveStock = async () => {
    toast.info('입고 처리는 재설계 중입니다. 상품 상세 페이지에서 옵션 선택 후 입고하세요.');
  };

  const handleBarcodePrint = () => {
    if (items.length === 0) {
      toast.warning('출력할 상품이 없습니다.');
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
