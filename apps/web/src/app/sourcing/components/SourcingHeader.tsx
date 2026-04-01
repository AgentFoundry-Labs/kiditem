'use client';

import { Search } from 'lucide-react';

export default function SourcingHeader() {
  return (
    <header className="px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 bg-white">
      <div className="flex items-baseline gap-4">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          수집상품
        </h1>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>수집 서버 속도</span>
          <span className="flex items-center gap-1 text-emerald-600 px-2 py-0.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            아주 원활
          </span>
        </div>
      </div>

      <div className="relative w-full sm:w-80">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <input
          type="text"
          placeholder="상품명 · 상품코드 · 메모 검색"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
        />
      </div>
    </header>
  );
}
