'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { InventoryToolbar } from './components/InventoryToolbar';
import { InventorySummaryCards } from './components/InventorySummaryCards';
import { InventoryFilterTabs } from './components/InventoryFilterTabs';
import { InventoryTable } from './components/InventoryTable';
import { StockOperationDialog } from './components/StockOperationDialog';
import { printBarcodeWindow } from './lib/barcode-print';
import { useInventoryList } from './hooks/useInventory';
import { fetchAllInventoryForExport, toInventoryExportRows } from './lib/inventory-export';
import type { StockOperationMode } from './components/StockOperationDialog';
import type { SyncInfo } from '@kiditem/shared';
import type { InventoryFilterKey } from './lib/inventory-api';
import type { InventoryListItem, InventorySummary } from '@kiditem/shared';

const DEFAULT_SUMMARY: InventorySummary = { total: 0, healthy: 0, low: 0, out: 0 };

const SyncResponseSchema = z.object({ synced: z.number().int().optional() });
const CoupangDashboardSyncSchema = z.object({
  lastSyncedAt: z.string().nullable().optional(),
  lastModifiedAt: z.string().nullable().optional(),
}).passthrough();

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InventoryFilterKey>('all');
  const [page, setPage] = useState(1);
  const [operationItem, setOperationItem] = useState<InventoryListItem | null>(null);
  const [operationMode, setOperationMode] = useState<StockOperationMode | null>(null);
  const PAGE_SIZE = 50;

  const openOperation = (item: InventoryListItem, mode: StockOperationMode) => {
    setOperationItem(item);
    setOperationMode(mode);
  };

  const closeOperation = (open: boolean) => {
    if (!open) {
      setOperationItem(null);
      setOperationMode(null);
    }
  };

  const { data: inventoryData, isLoading: loading, error: inventoryError } = useInventoryList({
    page,
    limit: PAGE_SIZE,
    status: filter === 'all' ? undefined : filter,
  });
  const items = inventoryData?.items ?? [];
  const total = inventoryData?.total ?? 0;
  const summary = inventoryData?.summary ?? DEFAULT_SUMMARY;
  const error = inventoryError
    ? isApiError(inventoryError) ? inventoryError.detail : '재고 데이터를 불러오지 못했습니다.'
    : null;

  const { data: syncInfo } = useQuery({
    queryKey: queryKeys.syncInfo(),
    queryFn: async () => {
      try {
        const raw = await apiClient.get<unknown>('/api/coupang-dashboard');
        const data = CoupangDashboardSyncSchema.parse(raw);
        return {
          lastSyncedAt: data.lastSyncedAt ?? data.lastModifiedAt ?? null,
        } satisfies SyncInfo;
      } catch {
        return { lastSyncedAt: null } satisfies SyncInfo;
      }
    },
  });

  const handleExcel = async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const data = await fetchAllInventoryForExport(status);
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(toInventoryExportRows(data));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '재고현황');
      XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '재고 엑셀 내보내기에 실패했습니다.');
    }
  };

  const handleStockCheck = async () => {
    try {
      const data = await apiClient.getParsed(
        '/api/inventory?status=low&limit=1',
        SyncResponseSchema.extend({ total: z.number() }),
      );
      toast.info(`재고 부족 상품: ${data.total}건 — 발주가 필요한 상품을 확인하세요.`);
      if (data.total > 0) {
        setFilter('low');
        setPage(1);
      }
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '재고 부족 체크에 실패했습니다.');
    }
  };

  const handleReceiveStock = async () => {
    toast.info('입고 처리는 재설계 중입니다. 상품 상세 페이지에서 옵션 선택 후 입고하세요.');
  };

  const handleBarcodePrint = () => {
    const result = printBarcodeWindow(items);
    if (result === 'empty') toast.warning('출력할 상품이 없습니다.');
    if (result === 'popup-blocked') toast.error('팝업이 차단되어 바코드 출력 창을 열 수 없습니다.');
  };

  const coupangSync = useMutation({
    mutationFn: async () => {
      const raw = await apiClient.post<unknown>('/api/coupang-sync/products');
      return SyncResponseSchema.parse(raw);
    },
    onSuccess: (data) => {
      toast.success(`쿠팡 동기화 완료: ${data.synced ?? 0}건 동기화됨`);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '쿠팡 동기화에 실패했습니다. 설정을 확인하세요.');
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
      {error && <div className="text-center py-8 text-destructive">{error}</div>}
      <InventorySummaryCards summary={summary} />
      <InventoryFilterTabs
        filter={filter}
        summary={summary}
        onFilterChange={(key) => { setFilter(key); setPage(1); }}
      />
      <InventoryTable
        items={items}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onOpenOperation={openOperation}
      />
      <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-4 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
        다음 정기 재고 점검: <strong>2개월 주기</strong> | 적정재고 = 일평균판매량 x (리드타임 + 안전일수7일)
      </div>
      <StockOperationDialog
        item={operationItem}
        mode={operationMode}
        open={operationItem !== null && operationMode !== null}
        onOpenChange={closeOperation}
      />
    </div>
  );
}
