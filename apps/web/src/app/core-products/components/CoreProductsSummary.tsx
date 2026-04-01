'use client';
import { formatKRW } from '@/lib/utils';

interface Props {
  totalRevenue: number;
  totalProfit: number;
  totalAdSpend: number;
}

export default function CoreProductsSummary({ totalRevenue, totalProfit, totalAdSpend }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
        <div className="text-sm text-blue-600">A등급 총 매출</div>
        <div className="text-2xl font-bold text-blue-800 mt-1">{formatKRW(totalRevenue)}원</div>
      </div>
      <div className="bg-green-50 rounded-xl p-5 border border-green-200">
        <div className="text-sm text-green-600">A등급 총 순이익</div>
        <div className="text-2xl font-bold text-green-800 mt-1">{formatKRW(totalProfit)}원</div>
      </div>
      <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
        <div className="text-sm text-purple-600">A등급 총 광고비 (추정)</div>
        <div className="text-2xl font-bold text-purple-800 mt-1">
          {formatKRW(Math.round(totalAdSpend))}원
        </div>
      </div>
    </div>
  );
}
