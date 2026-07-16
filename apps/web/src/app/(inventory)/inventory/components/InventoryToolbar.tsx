'use client';

import { Barcode, Download, Search } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface InventoryToolbarProps {
  query: string;
  latestImportAt: string | Date | null;
  busy: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onBarcodePrint: () => void;
  onExcel: () => void;
  headingLevel?: 1 | 2;
  showHeading?: boolean;
}

export function InventoryToolbar({
  query,
  latestImportAt,
  busy,
  onQueryChange,
  onSearch,
  onBarcodePrint,
  onExcel,
  headingLevel = 1,
  showHeading = true,
}: InventoryToolbarProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {showHeading ? <Heading className="page-title">재고/발주 관리</Heading> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onBarcodePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            <Barcode className="h-4 w-4" aria-hidden="true" /> 바코드 출력
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onExcel}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> 엑셀
          </button>
        </div>
      </div>
      <div>
        <p className="text-sm text-[var(--text-secondary)]">
          Sellpia가 현재 재고의 기준이며, KidItem에서는 수량을 직접 수정하지 않습니다.
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          마지막 완료: {latestImportAt ? formatDateTime(latestImportAt) : '가져오기 기록 없음'}
        </p>
      </div>
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label className="sr-only" htmlFor="sellpia-inventory-search">재고 검색</label>
        <input
          id="sellpia-inventory-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Sellpia 코드, 상품명, 옵션, 바코드 검색"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
        >
          <Search className="h-4 w-4" aria-hidden="true" /> 검색
        </button>
      </form>
    </div>
  );
}
