'use client';

import { Search } from 'lucide-react';

interface ProductPipelineHeaderProps {
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
}

export function ProductPipelineHeader({
  title = '수집 상품',
  subtitle = '1688 수집 상품 · 후보 콘텐츠 관리',
  searchPlaceholder = '상품명 · 상품코드 · 메모 검색',
}: ProductPipelineHeaderProps) {
  return (
    <header className="px-5 h-14 flex items-center justify-between gap-4 border-b border-slate-200">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{subtitle}</span>
        </div>
      </div>

      <div className="relative w-72">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={14}
        />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-3 h-8 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white placeholder:text-slate-400"
        />
      </div>
    </header>
  );
}
