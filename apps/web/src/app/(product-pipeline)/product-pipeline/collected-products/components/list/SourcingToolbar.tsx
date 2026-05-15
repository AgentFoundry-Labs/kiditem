'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { SourcingSort } from '../../lib/sourcing-api';

interface Props {
  showScrapeInput: boolean;
  onToggleScrapeInput: () => void;
  sort: SourcingSort;
  pageSize: number;
  onSortChange: (sort: SourcingSort) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export default function SourcingToolbar({
  showScrapeInput,
  onToggleScrapeInput,
  sort,
  pageSize,
  onSortChange,
  onPageSizeChange,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-12 border-b border-slate-200">
      <div className="flex items-center gap-1 text-xs">
        <span className="rounded-md bg-emerald-50 px-3 py-2 font-semibold text-emerald-700 ring-1 ring-emerald-200">
          1688 수집함
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <label className="relative">
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SourcingSort)}
            className="h-7 appearance-none rounded-md bg-transparent px-2.5 pr-6 font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-300"
            aria-label="상품 정렬"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="name_asc">상품명순</option>
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
        </label>
        <label className="relative">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-7 appearance-none rounded-md bg-transparent px-2.5 pr-6 font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-300"
            aria-label="페이지당 상품 개수"
          >
            <option value={20}>20개씩</option>
            <option value={50}>50개씩</option>
            <option value={100}>100개씩</option>
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
        </label>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button
          onClick={onToggleScrapeInput}
          className="h-7 px-3 border border-slate-200 bg-white text-slate-700 rounded-md font-medium hover:bg-slate-50 hover:border-slate-300"
        >
          URL 수집
        </button>
        <button className="h-7 px-3 border border-slate-200 bg-white text-slate-700 rounded-md font-medium hover:bg-slate-50 hover:border-slate-300">
          엑셀 수집
        </button>
        <Link
          href="/product-pipeline/detail-template-generation"
          className="h-7 px-3 ml-1 flex items-center bg-emerald-500 text-white rounded-md font-semibold hover:bg-emerald-600 transition-colors"
        >
          상세페이지 일괄 생성
        </Link>
      </div>
    </div>
  );
}
