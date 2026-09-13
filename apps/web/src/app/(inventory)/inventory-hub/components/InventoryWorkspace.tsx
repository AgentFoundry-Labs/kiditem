'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { InventoryFilters } from '../../inventory/components/InventoryFilters';
import { InventorySummaryCards } from '../../inventory/components/InventorySummaryCards';
import { InventoryTable } from '../../inventory/components/InventoryTable';
import { InventoryToolbar } from '../../inventory/components/InventoryToolbar';
import { printBarcodeWindow } from '../../inventory/lib/barcode-print';
import {
  downloadSellpiaInventoryExport,
  fetchAllInventoryForExport,
} from '../../inventory/lib/inventory-export';
import type {
  InventorySkuSnapshotSummary,
} from '@kiditem/shared/inventory';
import { useInventoryWorkspaceState } from '../hooks/useInventoryWorkspaceState';

const EMPTY_SUMMARY = {
  totalSkus: 0,
  linkedSkus: 0,
  unlinkedSkus: 0,
  inStockSkus: 0,
  outOfStockSkus: 0,
  totalUnits: 0,
  pricedAssetValue: 0,
  unpricedSkuCount: 0,
} satisfies InventorySkuSnapshotSummary;

export function InventoryWorkspace({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const state = useInventoryWorkspaceState();
  const [exporting, setExporting] = useState(false);
  const exportItems = async () => fetchAllInventoryForExport({
    query: state.requestParams.query,
    stockStatus: state.stockStatus,
    activeStatus: state.activeStatus,
    linkStatus: state.linkStatus === 'all' ? undefined : state.linkStatus,
  });

  const handleBarcodePrint = async () => {
    setExporting(true);
    try {
      const result = printBarcodeWindow(await exportItems());
      if (result === 'empty') toast.warning('출력할 Sellpia SKU가 없습니다.');
      if (result === 'popup-blocked') toast.error('팝업이 차단되어 바코드 창을 열 수 없습니다.');
    } catch (cause) {
      toast.error(isApiError(cause) ? cause.detail : '바코드 데이터를 불러오지 못했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const handleExcel = async () => {
    setExporting(true);
    try {
      await downloadSellpiaInventoryExport({
        query: state.requestParams.query,
        stockStatus: state.stockStatus,
        activeStatus: state.activeStatus,
        linkStatus: state.linkStatus === 'all' ? undefined : state.linkStatus,
      });
    } catch (cause) {
      toast.error(isApiError(cause) ? cause.detail : '재고 엑셀 내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  if (state.isLoading) return <PageSkeleton variant="table" />;

  return (
    <section className="space-y-5">
      <InventoryToolbar
        headingLevel={headingLevel}
        latestImportAt={state.data?.latestImport?.importedAt ?? null}
        busy={exporting}
        onBarcodePrint={handleBarcodePrint}
        onExcel={handleExcel}
      />
      {state.error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {isApiError(state.error) ? state.error.detail : 'Sellpia 재고를 불러오지 못했습니다.'}
        </div>
      ) : null}
      {state.isFetching ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> 최신 스냅샷 조회 중
        </div>
      ) : null}
      <InventorySummaryCards
        summary={state.data?.summary ?? EMPTY_SUMMARY}
        hasPublishedSnapshot={Boolean(state.data?.latestImport)}
      />
      <InventoryFilters
        activeStatus={state.activeStatus}
        linkStatus={state.linkStatus}
        search={state.search}
        stockStatus={state.stockStatus}
        onActiveStatusChange={state.setActiveStatus}
        onLinkStatusChange={state.setLinkStatus}
        onSearchChange={state.setSearch}
        onSearchSubmit={(event) => {
          event.preventDefault();
          state.submitSearch();
        }}
        onStockStatusChange={state.setStockStatus}
      />
      <InventoryTable
        items={state.data?.items ?? []}
        page={state.data?.page ?? state.page}
        pageSize={state.data?.limit ?? state.requestParams.limit ?? 50}
        total={state.data?.total ?? 0}
        onPageChange={state.setPage}
      />
    </section>
  );
}
