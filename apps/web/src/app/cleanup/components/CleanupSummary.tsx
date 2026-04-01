'use client';
import { AlertTriangle, MinusCircle } from 'lucide-react';

interface Props {
  minusCount: number;
  lowCount: number;
  total: number;
}

export default function CleanupSummary({ minusCount, lowCount, total }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-red-50 rounded-xl p-5 border border-red-200">
        <div className="flex items-center gap-2 text-red-600"><MinusCircle size={18} /> 적자 상품</div>
        <div className="text-3xl font-bold text-red-700 mt-2">{minusCount}개</div>
        <div className="text-xs text-red-500 mt-1">즉시 아웃 검토 필요</div>
      </div>
      <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
        <div className="flex items-center gap-2 text-orange-600"><AlertTriangle size={18} /> 순이익 0~3%</div>
        <div className="text-3xl font-bold text-orange-700 mt-2">{lowCount}개</div>
        <div className="text-xs text-orange-500 mt-1">개선 또는 정리 판단 필요</div>
      </div>
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
        <div className="text-slate-600">전체 정리 대상</div>
        <div className="text-3xl font-bold text-slate-900 mt-2">{total}개</div>
      </div>
    </div>
  );
}
