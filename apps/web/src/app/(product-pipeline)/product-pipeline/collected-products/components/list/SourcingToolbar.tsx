'use client';

import Link from 'next/link';
import { ProductInboxToolbar } from '@/app/(product-pipeline)/product-pipeline/_shared/components/inbox/ProductInboxToolbar';
import {
  SOURCING_SOURCE_FILTERS,
  type SourcingSourceFilter,
} from '../../lib/source-filter';

interface Props {
  showScrapeInput: boolean;
  onToggleScrapeInput: () => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  sourceFilter: SourcingSourceFilter;
  onSourceFilterChange: (sourceFilter: SourcingSourceFilter) => void;
}

export default function SourcingToolbar({
  showScrapeInput,
  onToggleScrapeInput,
  pageSize,
  onPageSizeChange,
  sourceFilter,
  onSourceFilterChange,
}: Props) {
  return (
    <ProductInboxToolbar
      tabs={SOURCING_SOURCE_FILTERS}
      activeTab={sourceFilter}
      onTabChange={onSourceFilterChange}
      // 초안 목록은 서버가 최근 수정순 하나로만 준다 — 고를 정렬이 없다.
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      actions={
        <>
          <button
            onClick={onToggleScrapeInput}
            className="h-7 rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300"
          >
            URL 수집
          </button>
          <button className="h-7 rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300">
            엑셀 수집
          </button>
          <Link
            href="/product-pipeline/productgenerate"
            className="ml-1 flex h-7 items-center rounded-md bg-emerald-500 px-3 font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            상품 생성
          </Link>
        </>
      }
    />
  );
}
