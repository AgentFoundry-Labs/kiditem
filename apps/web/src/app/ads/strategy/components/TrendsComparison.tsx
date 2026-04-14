'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../../lib/status-colors';

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
  key: string; label: string; unit: string; isMoney: boolean; isPositiveGood: boolean; isCount?: boolean; isFloat?: boolean;
}> = [
  { key: 'roas', label: 'ROAS', unit: '%p', isMoney: false, isPositiveGood: true },
  { key: 'revenue', label: '광고전환매출', unit: '%', isMoney: true, isPositiveGood: true },
  { key: 'spend', label: '집행광고비', unit: '%', isMoney: true, isPositiveGood: false },
  { key: 'impressions', label: '노출수', unit: '회', isMoney: false, isPositiveGood: true, isCount: true },
  { key: 'clicks', label: '클릭수', unit: '회', isMoney: false, isPositiveGood: true, isCount: true },
  { key: 'conversions', label: '전환수', unit: '건', isMoney: false, isPositiveGood: true, isCount: true },
  { key: 'ctr', label: '클릭률(CTR)', unit: '%p', isMoney: false, isPositiveGood: true, isFloat: true },
  { key: 'cvr', label: '구매전환율(CVR)', unit: '%p', isMoney: false, isPositiveGood: true, isFloat: true },
];

function fmtVal(key: string, v: number, isMoney: boolean, isCount?: boolean, isFloat?: boolean): string {
  if (isMoney) return formatKRW(v) + '원';
  if (isCount) return formatNumber(v) + (key === 'conversions' ? '건' : '회');
  if (isFloat) return v.toFixed(2) + '%';
  return v + '%';
}

export function TrendsComparison({ daily, comparison, budgetAllocation }: Props) {
  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };
  return (
    <div className="space-y-4">
      {/* 전반 vs 후반 비교 — 6칼럼 카드 그리드 */}
      {comparison && Object.keys(comparison).length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-violet-500" />
            <h2 className="text-lg font-bold text-slate-900">전략 성과 변화</h2>
            <span className="text-[12px] text-slate-400 ml-1">전반기 vs 후반기 비교</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
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
                  <div className="text-[16px] font-extrabold text-slate-900 tabular-nums mb-1">
                    {fmtVal(m.key, val.after, m.isMoney, m.isCount, m.isFloat)}
                  </div>
                  <div className={cn('flex items-center gap-1 text-[11px] font-bold', isNeutral ? 'text-slate-400' : isGood ? 'text-emerald-600' : 'text-red-500')}>
                    {isNeutral ? <Minus size={12} /> : isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {isNeutral ? '변동없음' : `${isUp ? '+' : ''}${change}${m.unit}`}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    이전: {fmtVal(m.key, val.before, m.isMoney, m.isCount, m.isFloat)}
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
          <div className="card p-5">
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
                <Bar dataKey="spend" fill="#f97316" fillOpacity={0.7} name="집행광고비" />
                <Bar dataKey="revenue" fill="#3b82f6" fillOpacity={0.7} name="광고전환매출" />
                <Line type="monotone" dataKey="roas" stroke="#8b5cf6" strokeWidth={2} dot={false} name="ROAS" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 노출수/클릭수/전환수 차트 */}
        {daily.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4">노출/클릭/전환</h3>
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
              <ComposedChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis yAxisId="left" fontSize={10} />
                <YAxis yAxisId="right" orientation="right" fontSize={10} />
                <Tooltip formatter={(v, name) => [formatNumber(Number(v)), name]} />
                <Bar yAxisId="left" dataKey="impressions" fill="#94a3b8" fillOpacity={0.5} name="노출수" />
                <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} name="클릭수" />
                <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#22c55e" strokeWidth={2} dot={false} name="전환수" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ABC 등급별 예산 배분 */}
        {budgetAllocation.length > 0 && (
          <div className="card p-5">
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
                <table className="text-xs">
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
                        <td className={cn('text-right font-medium', roasColor(item.roas, roasT))}>
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
