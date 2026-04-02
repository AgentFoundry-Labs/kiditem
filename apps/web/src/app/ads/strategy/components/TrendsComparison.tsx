'use client';

import { formatKRW } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DailyPoint {
  date: string;
  adSpend: number;
  adRevenue: number;
  roas: number;
}

type Comparison = Record<string, { before: number; after: number; change: number }>;

interface BudgetAllocationItem {
  grade: string;
  spend: number;
  revenue: number;
  pct: number;
  target: number;
  roas: number;
}

interface Props {
  daily: DailyPoint[];
  comparison: Comparison;
  budgetAllocation: BudgetAllocationItem[];
}

const PIE_COLORS = ['#3b82f6', '#94a3b8', '#f97316'];

const METRIC_LABELS: Record<string, string> = {
  roas: 'ROAS',
  adSpend: '광고비',
  spend: '광고비',
  adRevenue: '매출',
  revenue: '매출',
  ctr: 'CTR',
  cvr: 'CVR',
  conversions: '전환수',
};

const MONEY_KEYS = ['adSpend', 'adRevenue', 'spend', 'revenue'];

function formatMetricValue(key: string, value: number): string {
  if (MONEY_KEYS.includes(key)) return formatKRW(value) + '원';
  if (key === 'conversions') return value.toLocaleString();
  return value.toFixed(1) + '%';
}

function formatChangeValue(key: string, value: number): string {
  if (MONEY_KEYS.includes(key)) return formatKRW(value) + '원';
  if (key === 'conversions') return value.toLocaleString();
  return value.toFixed(1) + '%';
}

export function TrendsComparison({ daily, comparison, budgetAllocation }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Trend Chart + Comparison */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-4">전반기 vs 후반기 비교</h3>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={180} minWidth={0} minHeight={0}>
          <AreaChart data={daily}>
            <XAxis dataKey="date" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis fontSize={10} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={(v: any) => formatKRW(v)} />
            <Area type="monotone" dataKey="adRevenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="광고매출" />
            <Area type="monotone" dataKey="adSpend" stroke="#f97316" fill="#f97316" fillOpacity={0.1} name="광고비" />
          </AreaChart>
        </ResponsiveContainer>

        {/* Comparison table */}
        <div className="mt-4 space-y-2">
          {Object.entries(comparison).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-slate-500 w-16">{METRIC_LABELS[key] ?? key}</span>
              <span className="text-slate-600">{formatMetricValue(key, val.before)}</span>
              <span className="text-slate-400">→</span>
              <span className="text-slate-900 font-medium">{formatMetricValue(key, val.after)}</span>
              <span className={`font-bold ${val.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {val.change >= 0 ? '+' : ''}{formatChangeValue(key, val.change)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Budget Allocation Pie */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-4">ABC 등급별 예산 배분</h3>

        <div className="flex items-center gap-4">
          <ResponsiveContainer width={160} height={160} minWidth={0} minHeight={0}>
            <PieChart>
              <Pie
                data={budgetAllocation}
                dataKey="pct"
                nameKey="grade"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
              >
                {budgetAllocation.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left pb-2">등급</th>
                  <th className="text-right pb-2">비중</th>
                  <th className="text-right pb-2">목표</th>
                  <th className="text-right pb-2">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {budgetAllocation.map((item, i) => (
                  <tr key={item.grade} className="border-t border-slate-50">
                    <td className="py-1.5 font-medium">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {item.grade}등급
                    </td>
                    <td className="text-right">{item.pct}%</td>
                    <td className="text-right text-slate-400">{item.target}%</td>
                    <td className={`text-right font-medium ${item.roas >= 300 ? 'text-green-600' : item.roas >= 200 ? 'text-orange-500' : 'text-red-500'}`}>
                      {item.roas}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
