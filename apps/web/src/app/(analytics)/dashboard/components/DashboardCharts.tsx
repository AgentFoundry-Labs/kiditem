'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, BarChart, Bar, Cell,
} from 'recharts';
import { cn, formatKRW } from '@/lib/utils';
import { basisSummary, DashboardDataBasis, type DashboardMetricBasis } from './DashboardDataBasis';

interface TrendItem {
  date: string;
  revenue: number | null;
  profit: number | null;
  adCost: number | null;
  profitRate: number | null;
  adRate: number | null;
  evidence: {
    revenue: DashboardMetricBasis | null;
    profit: DashboardMetricBasis | null;
    adCost: DashboardMetricBasis | null;
  };
}

interface AdChartItem {
  date: string;
  revenue: number | null;
  adCost: number | null;
  adRate: number | null;
  evidence: TrendItem['evidence'];
}

interface BenchmarkItem {
  name: string;
  my: number | null;
  avg: number | null;
  unit: string;
  invertGood: boolean;
  referenceUnavailable?: boolean;
  basis?: DashboardMetricBasis | null;
}

type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  payload?: TrendItem | AdChartItem;
};

interface Props {
  chartTab: string;
  dailyTrend: TrendItem[];
  adChartData: AdChartItem[];
  benchmarkData: BenchmarkItem[] | null;
  hasTrend: boolean;
}

const CHART_HEIGHT = 360;
const CHART_INITIAL_DIMENSION = { width: 800, height: CHART_HEIGHT };

function formatTooltipValue(key: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (key === 'revenue' || key === 'adCost') return `₩${formatKRW(value)}`;
  return `${value.toFixed(1)}%`;
}

function tooltipLabel(key: string): string {
  if (key === 'revenue') return '매출';
  if (key === 'profitRate') return '이익률';
  if (key === 'adCost') return '광고비';
  return '광고비율';
}

export function EvidenceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-slate-700">{point.date}</div>
      <div className="space-y-0.5 text-slate-500">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? '');
          return (
            <div key={`${key}-${index}`}>
              {tooltipLabel(key)} · {formatTooltipValue(key, entry.value)}
            </div>
          );
        })}
        <div>매출 근거 · {basisSummary(point.evidence.revenue)}</div>
        <div>이익 근거 · {basisSummary(point.evidence.profit)}</div>
        <div>광고비 근거 · {basisSummary(point.evidence.adCost)}</div>
      </div>
    </div>
  );
}

export function DashboardCharts({ chartTab, dailyTrend, adChartData, benchmarkData, hasTrend }: Props) {
  return (
    <>
      {/* Revenue / profit rate chart */}
      {chartTab === 'revenue' && hasTrend && (
        <div className="flex-1 flex flex-col p-5 min-h-0">
          <div className="flex items-center gap-5 mb-3 text-[12px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />이익률</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 opacity-70" />광고비율</span>
          </div>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={CHART_INITIAL_DIMENSION}>
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
              <Tooltip content={<EvidenceTooltip />} contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (v == null) return ['—', name === 'revenue' ? '매출' : name === 'profitRate' ? '이익률' : '광고비율'];
                if (name === 'revenue') return [`\u20A9${formatKRW(Number(v))}`, '매출'];
                return [`${Number(v).toFixed(1)}%`, name === 'profitRate' ? '이익률' : '광고비율'];
              }} />
              <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#gRevenue)" name="revenue" dot={false} connectNulls={false} />
              <Area yAxisId="pct" type="monotone" dataKey="profitRate" stroke="#10b981" strokeWidth={2} fill="url(#gProfit)" name="profitRate" dot={false} connectNulls={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gAdRate)" name="adRate" dot={false} strokeDasharray="4 2" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'revenue' && !hasTrend && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-300">트렌드 데이터가 없습니다</div>
      )}

      {/* Ad cost / ratio chart */}
      {chartTab === 'ad' && hasTrend && (
        <div className="flex-1 flex flex-col p-5 min-h-0">
          <div className="flex items-center gap-5 mb-3 text-[12px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />광고비</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 inline-block" /> 광고비율</span>
          </div>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={CHART_INITIAL_DIMENSION}>
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
              <Tooltip content={<EvidenceTooltip />} contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (v == null) return ['—', name === 'adRate' ? '광고비율' : name === 'adCost' ? '광고비' : '매출'];
                if (name === 'adRate') return [`${Number(v).toFixed(1)}%`, '광고비율'];
                return [`\u20A9${formatKRW(Number(v))}`, name === 'adCost' ? '광고비' : '매출'];
              }} />
              <Area yAxisId="won" type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#gAdRev)" name="revenue" dot={false} connectNulls={false} />
              <Area yAxisId="won" type="monotone" dataKey="adCost" stroke="#f43f5e" strokeWidth={2} fill="url(#gAdCost)" name="adCost" dot={false} connectNulls={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#6366f1" strokeWidth={1.5} fill="none" name="adRate" dot={false} strokeDasharray="5 3" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'ad' && !hasTrend && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-300">트렌드 데이터가 없습니다</div>
      )}

      {/* Benchmark chart */}
      {chartTab === 'benchmark' && benchmarkData && (
        <div className="flex-1 flex flex-col p-5 min-h-0">
          <div className="flex items-center gap-5 mb-4 text-[12px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />내 수치</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />업계 평균</span>
          </div>
          <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={CHART_INITIAL_DIMENSION}>
            <BarChart data={benchmarkData} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" fontSize={13} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} fontWeight={600} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 13, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => [v == null ? '—' : `${Number(v).toFixed(1)}%`, name === 'my' ? '내 수치' : '업계 기준']} />
              <Bar dataKey="my" name="my" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {benchmarkData.map((entry, i) => {
                  const comparisonUnavailable = entry.my === null || entry.avg === null;
                  const isGood = entry.my !== null && entry.avg !== null
                    && (entry.invertGood ? entry.my <= entry.avg : entry.my >= entry.avg);
                  return <Cell key={i} fill={entry.my === null ? '#cbd5e1' : comparisonUnavailable ? '#64748b' : isGood ? '#3182f6' : '#f04452'} />;
                })}
              </Bar>
              <Bar dataKey="avg" name="avg" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={48} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 shrink-0">
            {benchmarkData.map(item => {
              const comparisonUnavailable = item.my === null || item.avg === null;
              const isGood = item.my !== null && item.avg !== null
                && (item.invertGood ? item.my <= item.avg : item.my >= item.avg);
              const diff = item.my !== null && item.avg !== null ? item.my - item.avg : null;
              const diffStr = diff === null ? null : diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
              return (
                <div key={item.name} className="text-center">
                  <div className="text-[13px] font-semibold text-slate-500">{item.name}</div>
                  <div className={cn('text-[20px] font-bold tabular-nums mt-0.5', item.my === null ? 'text-slate-300' : comparisonUnavailable ? 'text-slate-700' : isGood ? 'text-emerald-500' : 'text-red-500')}>
                    {item.my === null ? '—' : `${item.my}${item.unit}`}
                  </div>
                  <div className={cn('text-[12px] mt-0.5', diffStr === null || comparisonUnavailable ? 'text-slate-400' : isGood ? 'text-emerald-500' : 'text-red-500')}>
                    {diffStr === null
                      ? (item.referenceUnavailable || item.avg === null ? '비교 기준 없음' : '내 수치 없음')
                      : `${isGood ? '\u2713' : '\u2717'} ${diffStr}%p vs 기준`}
                  </div>
                  {item.basis && <DashboardDataBasis basis={item.basis} className="mt-1 text-left" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
