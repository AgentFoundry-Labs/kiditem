'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

interface Props {
  showScrapeInput: boolean;
  onToggleScrapeInput: () => void;
}

export default function SourcingToolbar({ showScrapeInput, onToggleScrapeInput }: Props) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 pb-4 border-b border-slate-100">
      <div className="flex bg-slate-100 p-1 rounded-lg">
        <button className="px-4 py-1.5 text-sm font-bold bg-white text-slate-800 rounded shadow-sm">
          수집 목록
        </button>
        <button className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
          간단 편집
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="border border-slate-300 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm bg-white cursor-pointer hover:bg-slate-50 font-medium">
          최신순 <ChevronDown size={14} className="text-slate-500" />
        </div>
        <div className="border border-slate-300 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm bg-white cursor-pointer hover:bg-slate-50 font-medium">
          20개씩 보기 <ChevronDown size={14} className="text-slate-500" />
        </div>
        <button
          onClick={onToggleScrapeInput}
          className="ml-2 border border-slate-300 bg-white px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          URL 수집
        </button>
        <button className="border border-slate-300 bg-white px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
          엑셀 수집
        </button>
        <Link
          href="/generate"
          className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm"
        >
          상세페이지 일괄 생성
        </Link>
      </div>
    </div>
  );
}
