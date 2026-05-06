'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

interface Props {
  showScrapeInput: boolean;
  onToggleScrapeInput: () => void;
}

export default function SourcingToolbar({ showScrapeInput, onToggleScrapeInput }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-12 border-b border-slate-200">
      <div className="flex items-center text-xs">
        <button className="px-3 h-7 font-semibold text-slate-900 border-b-2 border-emerald-500 -mb-[calc(0.75rem+1px)] pb-3">
          콘텐츠 보관함
        </button>
        <button className="px-3 h-7 font-medium text-slate-400 hover:text-slate-600">
          간단 편집
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <button className="h-7 px-2.5 flex items-center gap-1 text-slate-600 hover:bg-slate-100 rounded-md font-medium">
          최신순 <ChevronDown size={12} className="text-slate-400" />
        </button>
        <button className="h-7 px-2.5 flex items-center gap-1 text-slate-600 hover:bg-slate-100 rounded-md font-medium">
          20개씩 <ChevronDown size={12} className="text-slate-400" />
        </button>
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
          href="/generate"
          className="h-7 px-3 ml-1 flex items-center bg-emerald-500 text-white rounded-md font-semibold hover:bg-emerald-600 transition-colors"
        >
          상세페이지 일괄 생성
        </Link>
      </div>
    </div>
  );
}
