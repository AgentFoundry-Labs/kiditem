'use client';

import { formatKRW } from '@/lib/utils';

interface PlanData {
  generatedAt: string;
  totalProducts: number;
  summary: {
    scaleUp: number;
    optimize: number;
    reduce: number;
    stop: number;
    newStart: number;
  };
  keyMetrics: {
    totalAdSpend: number;
    totalAdRevenue: number;
    overallRoas: number;
  };
}

export function PlanSummary({ plan }: { plan: PlanData }) {
  const cards = [
    { label: '확대', value: plan.summary.scaleUp, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { label: '최적화', value: plan.summary.optimize, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { label: '축소', value: plan.summary.reduce, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { label: '중단', value: plan.summary.stop, color: 'text-red-600 bg-red-50 border-red-200' },
    { label: '신규', value: plan.summary.newStart, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  ];

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">주간 액션 플랜</h3>
        <span className="text-xs text-slate-400">{plan.totalProducts}개 상품 분석</span>
      </div>

      {/* Action summary */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-lg p-3 border text-center ${c.color}`}>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs font-medium mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Key metrics */}
      <div className="flex gap-6 pt-3 border-t border-slate-100 text-sm">
        <div>
          <span className="text-slate-500">총 광고비:</span>{' '}
          <strong className="text-slate-900">{formatKRW(plan.keyMetrics.totalAdSpend)}원</strong>
        </div>
        <div>
          <span className="text-slate-500">광고 매출:</span>{' '}
          <strong className="text-slate-900">{formatKRW(plan.keyMetrics.totalAdRevenue)}원</strong>
        </div>
        <div>
          <span className="text-slate-500">ROAS:</span>{' '}
          <strong className={plan.keyMetrics.overallRoas >= 300 ? 'text-green-600' : plan.keyMetrics.overallRoas >= 200 ? 'text-orange-500' : 'text-red-600'}>
            {plan.keyMetrics.overallRoas}%
          </strong>
        </div>
      </div>
    </div>
  );
}
