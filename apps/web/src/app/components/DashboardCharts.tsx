'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, BarChart, Bar, Cell,
} from 'recharts';
import { formatKRW } from '@/lib/utils';

interface TrendItem {
  date: string;
  revenue: number;
  profit: number;
  adCost: number;
  profitRate: number;
  adRate: number;
}

interface AdChartItem {
  date: string;
  revenue: number;
  adCost: number;
  adRate: number;
}

interface BenchmarkItem {
  name: string;
  my: number;
  avg: number;
  unit: string;
  invertGood: boolean;
}

interface Props {
  chartTab: string;
  dailyTrend: TrendItem[];
  adChartData: AdChartItem[];
  benchmarkData: BenchmarkItem[] | null;
  hasTrend: boolean;
}

export function DashboardCharts({ chartTab, dailyTrend, adChartData, benchmarkData, hasTrend }: Props) {
  return (
    <>
      {/* Revenue / profit rate chart */}
      {chartTab === 'revenue' && hasTrend && (
        <div className="p-5">
          <div className="flex items-center gap-5 mb-3 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />이익률</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 opacity-70" />광고비율</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gAdRate" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.08} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} interval={4} />
              <YAxis yAxisId="pct" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
              <YAxis yAxisId="rev" orientation="right" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} domain={[0, 'auto']} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (name === 'revenue') return [`\u20A9${formatKRW(Number(v))}`, '매출'];
                return [`${Number(v).toFixed(1)}%`, name === 'profitRate' ? '이익률' : '광고비율'];
              }} />
              <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#gRevenue)" name="revenue" dot={false} />
              <Area yAxisId="pct" type="monotone" dataKey="profitRate" stroke="#10b981" strokeWidth={2} fill="url(#gProfit)" name="profitRate" dot={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gAdRate)" name="adRate" dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'revenue' && !hasTrend && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-300">트렌드 데이터가 없습니다</div>
      )}

      {/* Ad cost / ratio chart */}
      {chartTab === 'ad' && hasTrend && (
        <div className="p-5">
          <div className="flex items-center gap-5 mb-3 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />광고비</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 inline-block" /> 광고비율</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={adChartData}>
              <defs>
                <linearGradient id="gAdCost" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.12} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                <linearGradient id="gAdRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} interval={4} />
              <YAxis yAxisId="won" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} domain={[0, 'auto']} />
              <YAxis yAxisId="pct" orientation="right" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (name === 'adRate') return [`${Number(v).toFixed(1)}%`, '광고비율'];
                return [`\u20A9${formatKRW(Number(v))}`, name === 'adCost' ? '광고비' : '매출'];
              }} />
              <Area yAxisId="won" type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#gAdRev)" name="revenue" dot={false} />
              <Area yAxisId="won" type="monotone" dataKey="adCost" stroke="#f43f5e" strokeWidth={2} fill="url(#gAdCost)" name="adCost" dot={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#6366f1" strokeWidth={1.5} fill="none" name="adRate" dot={false} strokeDasharray="5 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'ad' && !hasTrend && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-300">트렌드 데이터가 없습니다</div>
      )}

      {/* Benchmark chart */}
      {chartTab === 'benchmark' && benchmarkData && (
        <div className="p-5">
          <div className="flex items-center gap-5 mb-4 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />내 수치</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />업계 평균</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={benchmarkData} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" fontSize={13} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} fontWeight={600} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 13, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name === 'my' ? '내 수치' : '업계 평균']} />
              <Bar dataKey="my" name="my" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {benchmarkData.map((entry, i) => {
                  const isGood = entry.invertGood ? entry.my <= entry.avg : entry.my >= entry.avg;
                  return <Cell key={i} fill={isGood ? '#3182f6' : '#f04452'} />;
                })}
              </Bar>
              <Bar dataKey="avg" name="avg" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={48} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {benchmarkData.map(item => {
              const isGood = item.invertGood ? item.my <= item.avg : item.my >= item.avg;
              const diff = item.my - item.avg;
              const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
              return (
                <div key={item.name} className="text-center">
                  <div className="text-[13px] font-semibold text-slate-500">{item.name}</div>
                  <div className={`text-[20px] font-bold tabular-nums mt-0.5 ${isGood ? 'text-emerald-500' : 'text-red-500'}`}>
                    {item.my}{item.unit}
                  </div>
                  <div className={`text-[12px] mt-0.5 ${isGood ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isGood ? '\u2713' : '\u2717'} {diffStr}%p vs 평균
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
