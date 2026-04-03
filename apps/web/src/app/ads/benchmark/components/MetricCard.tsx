'use client';

import { ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  excellent: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: '우수' },
  good: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', label: '양호' },
  average: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', label: '평균' },
  below: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', label: '미달' },
  poor: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: '부진' },
};

const LOWER_IS_BETTER = ['cpc', 'adRate', 'acos'];

interface ComparisonItem {
  metric: string;
  label: string;
  myValue: number;
  industryAvg: number;
  industryGood: number;
  industryExcellent: number;
  industryPoor: number;
  status: string;
  gap: number;
  gapPercent: number;
  strategy: string;
  actions: string[];
}

interface Props {
  comparison: ComparisonItem;
  isExpanded: boolean;
  onToggle: () => void;
}

export function MetricCard({ comparison: c, isExpanded, onToggle }: Props) {
  const st = STATUS_COLORS[c.status] ?? STATUS_COLORS.average;
  const isLowerBetter = LOWER_IS_BETTER.includes(c.metric);
  const unit = c.metric === 'cpc' ? '원' : '%';

  // Benchmark bar: multi-color gradient with dot indicator
  const maxVal = c.industryExcellent * 1.3;
  const poorPct = (c.industryPoor / maxVal) * 100;
  const avgPct = ((c.industryAvg - c.industryPoor) / maxVal) * 100;
  const goodPct = ((c.industryGood - c.industryAvg) / maxVal) * 100;
  const myDotPos = Math.min(Math.max(
    (isLowerBetter ? (maxVal - c.myValue) : c.myValue) / maxVal * 100,
    2,
  ), 98);

  return (
    <div
      onClick={onToggle}
      className={`rounded-xl border-2 transition-all cursor-pointer ${
        isExpanded
          ? 'col-span-2 lg:col-span-3 border-indigo-300 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 shadow-lg'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
            <span className="text-[13px] font-bold text-slate-700">{c.label}</span>
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${st.bg} ${st.text}`}>{st.label}</span>
        </div>

        {/* Values */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[28px] font-extrabold tabular-nums text-slate-900 leading-none">
              {c.myValue}<span className="text-[16px] text-slate-400 ml-0.5">{unit}</span>
            </div>
            <div className="text-[12px] text-slate-400 mt-1">
              업계 평균 <span className="font-semibold text-slate-500">{c.industryAvg}{unit}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {c.gap > 0 ? (
              <span className="flex items-center gap-0.5 text-[14px] font-bold text-emerald-600">
                <ArrowUp size={14} />
                {Math.abs(c.gapPercent)}%
              </span>
            ) : c.gap < 0 ? (
              <span className="flex items-center gap-0.5 text-[14px] font-bold text-red-500">
                <ArrowDown size={14} />
                {Math.abs(c.gapPercent)}%
              </span>
            ) : (
              <span className="text-slate-400"><Minus size={14} /></span>
            )}
            {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </div>
        </div>

        {/* Benchmark bar — multi-color gradient with dot */}
        <div className="mt-3 relative h-2.5 bg-slate-100 rounded-full overflow-visible">
          <div className="absolute inset-0 flex rounded-full overflow-hidden">
            <div className="bg-red-200/80 h-full" style={{ width: `${poorPct}%` }} />
            <div className="bg-orange-200/80 h-full" style={{ width: `${avgPct}%` }} />
            <div className="bg-yellow-200/80 h-full" style={{ width: `${goodPct}%` }} />
            <div className="bg-emerald-200/80 h-full flex-1" />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-white shadow-md"
            style={{ left: `${myDotPos}%` }}
          />
        </div>
      </div>

      {/* Expanded strategy */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-200/80 mt-1 pt-4 space-y-4">
          <div>
            <div className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">맞춤 전략</div>
            <p className="text-[14px] text-slate-800 font-medium leading-relaxed">{c.strategy}</p>
          </div>
          <div>
            <div className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">구체적 액션 플랜</div>
            <div className="space-y-2">
              {c.actions.map((action, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-extrabold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-slate-700 leading-relaxed">{action}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4 text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            <span>우수: {isLowerBetter ? '≤' : '≥'}{c.industryGood}{unit}</span>
            <span>최우수: {isLowerBetter ? '≤' : '≥'}{c.industryExcellent}{unit}</span>
            <span>위험: {isLowerBetter ? '≥' : '≤'}{c.industryPoor}{unit}</span>
          </div>
        </div>
      )}
    </div>
  );
}
