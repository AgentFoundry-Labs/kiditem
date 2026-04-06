'use client'

import { Zap } from 'lucide-react';

interface Props {
  totalProducts: number;
}

export default function DashboardHeader({ totalProducts }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">운영 대시보드</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-slate-400">{totalProducts}개 상품</span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
