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
}

export function InventoryToolbar({
  query,
  latestImportAt,
  busy,
  onQueryChange,
  onSearch,
  onBarcodePrint,
  onExcel,
}: InventoryToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Sellpia 현재 재고</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            KidItem에서 수량을 수정하지 않으며, 마지막 완료 파일의 값을 그대로 표시합니다.
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            마지막 완료: {latestImportAt ? formatDateTime(latestImportAt) : '가져오기 기록 없음'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onBarcodePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Barcode className="h-4 w-4" aria-hidden="true" /> 전체 바코드
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onExcel}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> 엑셀 내보내기
          </button>
        </div>
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
