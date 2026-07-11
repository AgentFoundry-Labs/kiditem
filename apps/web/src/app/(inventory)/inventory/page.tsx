'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { InventoryFilterTabs } from './components/InventoryFilterTabs';
import { InventorySummaryCards } from './components/InventorySummaryCards';
import { InventoryTable } from './components/InventoryTable';
import { InventoryToolbar } from './components/InventoryToolbar';
import { useInventoryList } from './hooks/useInventory';
import { printBarcodeWindow } from './lib/barcode-print';
import { fetchAllInventoryForExport, toInventoryExportRows } from './lib/inventory-export';
import type { InventorySkuStockStatus } from '@kiditem/shared/inventory';

const PAGE_SIZE = 50;

const EMPTY_SUMMARY = {
  totalSkus: 0,
  inStockSkus: 0,
  outOfStockSkus: 0,
  totalUnits: 0,
  pricedAssetValue: 0,
  unpricedSkuCount: 0,
};

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const [stockStatus, setStockStatus] = useState<InventorySkuStockStatus>('all');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, error } = useInventoryList({
    page,
    limit: PAGE_SIZE,
    stockStatus,
    query: query || undefined,
  });

  const exportItems = async () => fetchAllInventoryForExport(
    stockStatus,
    query || undefined,
  );

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
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(toInventoryExportRows(await exportItems()));
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sellpia 현재재고');
      XLSX.writeFile(workbook, `Sellpia_현재재고_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (cause) {
      toast.error(isApiError(cause) ? cause.detail : '재고 엑셀 내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <PageSkeleton variant="table" />;

  return (
    <section className="space-y-5">
      <InventoryToolbar
        query={queryDraft}
        latestImportAt={data?.latestImport?.importedAt ?? null}
        busy={exporting}
        onQueryChange={setQueryDraft}
        onSearch={() => {
          setQuery(queryDraft.trim());
          setPage(1);
        }}
        onBarcodePrint={handleBarcodePrint}
        onExcel={handleExcel}
      />
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {isApiError(error) ? error.detail : 'Sellpia 재고를 불러오지 못했습니다.'}
        </div>
      ) : null}
      {isFetching ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> 최신 스냅샷 조회 중
        </div>
      ) : null}
      <InventorySummaryCards summary={data?.summary ?? EMPTY_SUMMARY} />
      <InventoryFilterTabs
        filter={stockStatus}
        summary={data?.summary ?? EMPTY_SUMMARY}
        onFilterChange={(next) => {
          setStockStatus(next);
          setPage(1);
        }}
      />
      <InventoryTable
        items={data?.items ?? []}
        page={data?.page ?? page}
        pageSize={data?.limit ?? PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />
    </section>
  );
}
