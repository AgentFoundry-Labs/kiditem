'use client';

import { Barcode, Download } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { SellpiaSyncAction } from '../../_shared/SellpiaSyncAction';

interface InventoryToolbarProps {
  latestImportAt: string | Date | null;
  busy: boolean;
  onBarcodePrint: () => void;
  onExcel: () => void;
  headingLevel?: 1 | 2;
  showHeading?: boolean;
}

export function InventoryToolbar({
  latestImportAt,
  busy,
  onBarcodePrint,
  onExcel,
  headingLevel = 1,
  showHeading = true,
}: InventoryToolbarProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {showHeading ? <Heading className="page-title">재고 관리</Heading> : null}
        <div className="flex flex-wrap gap-2">
          <SellpiaSyncAction />
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
    </div>
  );
}
