'use client';

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string; label: string }> = {
  excellent: { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500', label: '우수' },
  good: { bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500', label: '양호' },
  average: { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500', label: '평균' },
  below: { bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500', label: '미달' },
  poor: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500', label: '부진' },
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

function calcBarPosition(metric: string, myValue: number, poor: number, excellent: number): number {
  const isLower = LOWER_IS_BETTER.includes(metric);
  if (isLower) {
    const range = poor - excellent;
    return range > 0 ? Math.min(100, Math.max(0, ((poor - myValue) / range) * 100)) : 50;
  }
  const range = excellent - poor;
  return range > 0 ? Math.min(100, Math.max(0, ((myValue - poor) / range) * 100)) : 50;
}

function calcAvgPosition(metric: string, avg: number, poor: number, excellent: number): number {
  const isLower = LOWER_IS_BETTER.includes(metric);
  if (isLower) {
    const range = poor - excellent;
    return range > 0 ? Math.min(100, Math.max(0, ((poor - avg) / range) * 100)) : 50;
  }
  const range = excellent - poor;
  return range > 0 ? Math.min(100, Math.max(0, ((avg - poor) / range) * 100)) : 50;
}

function formatValue(metric: string, value: number): string {
  if (metric === 'cpc') return `${Math.round(value)}원`;
  return `${value.toFixed(1)}%`;
}

export function MetricCard({ comparison: c, isExpanded, onToggle }: Props) {
  const style = STATUS_COLORS[c.status] ?? STATUS_COLORS.average;
  const myPos = calcBarPosition(c.metric, c.myValue, c.industryPoor, c.industryExcellent);
  const avgPos = calcAvgPosition(c.metric, c.industryAvg, c.industryPoor, c.industryExcellent);

  return (
    <div
      onClick={onToggle}
      className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-700">{c.label}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${style.bg} ${style.text}`}>
          {style.label}
        </span>
      </div>

      {/* My value vs avg */}
      <div className="flex items-end gap-2 mb-2">
        <span className="text-2xl font-bold text-slate-900">{formatValue(c.metric, c.myValue)}</span>
        <span className="text-sm text-slate-400">vs {formatValue(c.metric, c.industryAvg)} (평균)</span>
      </div>

      {/* Comparison bar */}
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
        <div
          className="absolute h-full w-0.5 bg-slate-400 z-10"
          style={{ left: `${avgPos}%` }}
        />
        <div
          className={`h-full rounded-full ${style.bar}`}
          style={{ width: `${myPos}%` }}
        />
      </div>

      {/* Gap */}
      <div className={`text-xs mt-1 ${c.gapPercent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        업계 평균 대비 {c.gapPercent >= 0 ? '+' : ''}{c.gapPercent.toFixed(1)}%
      </div>

      {/* Expanded strategy + actions */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-sm font-medium text-slate-700 mb-2">{c.strategy}</p>
          <ul className="space-y-1">
            {c.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="text-slate-400 mt-0.5">-</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
