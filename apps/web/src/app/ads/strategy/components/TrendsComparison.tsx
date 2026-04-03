'use client';

import { formatKRW } from '@/lib/utils';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface DailyPoint {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
  [key: string]: string | number;
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

const METRIC_DEFS: Array<{
  key: string; label: string; unit: string; isMoney: boolean; isPositiveGood: boolean;
}> = [
  { key: 'roas', label: 'ROAS', unit: '%p', isMoney: false, isPositiveGood: true },
  { key: 'revenue', label: '전환 매출', unit: '%', isMoney: true, isPositiveGood: true },
  { key: 'spend', label: '광고비', unit: '%', isMoney: true, isPositiveGood: false },
  { key: 'ctr', label: 'CTR', unit: '', isMoney: false, isPositiveGood: true },
  { key: 'cvr', label: '전환율', unit: '', isMoney: false, isPositiveGood: true },
  { key: 'conversions', label: '전환수', unit: '건', isMoney: false, isPositiveGood: true },
];

function fmtVal(key: string, v: number, isMoney: boolean): string {
  if (isMoney) return formatKRW(v) + '원';
  if (key === 'conversions') return v.toLocaleString() + '건';
  if (key === 'ctr' || key === 'cvr') return (v / 100).toFixed(2) + '%';
  return v + '%';
}

export function TrendsComparison({ daily, comparison, budgetAllocation }: Props) {
  return (
    <div className="space-y-4">
      {/* 전반 vs 후반 비교 — 6칼럼 카드 그리드 */}
      {comparison && Object.keys(comparison).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-violet-500" />
            <h2 className="text-lg font-bold text-slate-900">전략 성과 변화</h2>
            <span className="text-[12px] text-slate-400 ml-1">전반기 vs 후반기 비교</span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {METRIC_DEFS.map((m) => {
              const val = comparison[m.key] ?? comparison[m.key === 'revenue' ? 'adRevenue' : m.key === 'spend' ? 'adSpend' : m.key];
              if (!val) return null;

              const change = m.isMoney && val.before > 0
                ? Math.round(((val.after - val.before) / val.before) * 100)
                : val.change;
              const isUp = change > 0;
              const isGood = m.isPositiveGood ? isUp : !isUp;
              const isNeutral = change === 0;

              return (
                <div key={m.key} className="rounded-lg border border-slate-100 p-3">
                  <div className="text-[12px] font-medium text-slate-500 mb-2">{m.label}</div>
                  <div className="text-[18px] font-extrabold text-slate-900 tabular-nums mb-1">
                    {fmtVal(m.key, val.after, m.isMoney)}
                  </div>
                  <div className={`flex items-center gap-1 text-[12px] font-bold ${
                    isNeutral ? 'text-slate-400' : isGood ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {isNeutral ? <Minus size={12} /> : isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {isNeutral ? '변동 없음' : `${isUp ? '+' : ''}${change}${m.unit}`}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    이전: {fmtVal(m.key, val.before, m.isMoney)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ROAS 추이 차트 */}
        {daily.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4">ROAS 추이</h3>
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
              <ComposedChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis fontSize={10} />
                <Tooltip
                  formatter={(v, name) =>
                    name === 'roas' ? `${v}%` : formatKRW(Number(v)) + '원'
                  }
                />
                <Bar dataKey="spend" fill="#f97316" fillOpacity={0.7} name="광고비" />
                <Bar dataKey="revenue" fill="#3b82f6" fillOpacity={0.7} name="매출" />
                <Line type="monotone" dataKey="roas" stroke="#8b5cf6" strokeWidth={2} dot={false} name="ROAS" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ABC 등급별 예산 배분 */}
        {budgetAllocation.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-slate-200">
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
                  <Tooltip formatter={(v) => `${v}%`} />
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
                        <td className={`text-right font-medium ${
                          item.roas >= 300 ? 'text-green-600' : item.roas >= 200 ? 'text-orange-500' : 'text-red-500'
                        }`}>
                          {item.roas}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
