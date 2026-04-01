import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatKRW } from '@/lib/utils';
import type { DashboardTrendItem } from '@kiditem/shared';

export type TrendRange = '7d' | '30d' | '90d';

interface TrendChartProps {
  trendData: DashboardTrendItem[];
  monthlyTrend: Array<{ period: string; revenue: number; profit: number; adCost: number }>;
  trendRange: TrendRange;
  trendLoading: boolean;
  onRangeChange: (range: TrendRange) => void;
}

const rangeOptions: { value: TrendRange; label: string }[] = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
];

export default function TrendChart({ trendData, monthlyTrend, trendRange, trendLoading, onRangeChange }: TrendChartProps) {
  const rawData = trendData.length > 0
    ? trendData.map((d) => ({
        period: d.date.slice(5),
        revenue: d.revenue,
        profit: d.profit,
        adCost: d.adCost,
      }))
    : monthlyTrend;
  if (rawData.length === 0) return null;

  const chartData = rawData.map(d => ({
    ...d,
    profitRate: d.revenue > 0 ? Math.round((d.profit / d.revenue) * 1000) / 10 : 0,
    adRate: d.revenue > 0 ? Math.round((d.adCost / d.revenue) * 1000) / 10 : 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">매출 / 광고비 추이</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
            {rangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onRangeChange(opt.value)}
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded-md transition-colors',
                  trendRange === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />매출</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />이익률</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />광고비율</span>
          </div>
        </div>
      </div>
      <div className="px-4 py-4 relative">
        {trendLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        )}
        <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="adCostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f3" vertical={false} />
            <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} stroke="#9ca3af" />
            <YAxis
              yAxisId="left"
              fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af"
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 'auto']}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af"
              tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value: unknown, name: unknown) => {
                const n = String(name);
                if (n === 'revenue') return [`₩${formatKRW(Number(value))}`, '매출'];
                const labels: Record<string, string> = { profitRate: '이익률', adRate: '광고비율' };
                return [`${Number(value).toFixed(1)}%`, labels[n] || n];
              }}
            />
            <Area type="monotone" dataKey="revenue" yAxisId="right" stroke="#3b82f6" strokeWidth={2} fill="url(#revenueGrad)" name="revenue" dot={false} />
            <Area type="monotone" dataKey="profitRate" yAxisId="left" stroke="#10b981" strokeWidth={2} fill="url(#profitGrad)" name="profitRate" dot={false} />
            <Area type="monotone" dataKey="adRate" yAxisId="left" stroke="#f59e0b" strokeWidth={1.5} fill="url(#adCostGrad)" name="adRate" dot={false} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
