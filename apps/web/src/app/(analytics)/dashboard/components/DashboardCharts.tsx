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
  unit: string;
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
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13px] shadow-lg">
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

/**
 * An empty chart keeps its axes. A blank rectangle reads as a broken block;
 * a drawn frame reads as a chart with nothing in it yet, which is what it is.
 */
function EmptyChartFrame() {
  return (
    <div className="relative" style={{ height: CHART_HEIGHT }} aria-hidden="true">
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#eceef3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" y1="100" x2="100" y2="100" stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="0" x2="0" y2="100" stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
        트렌드 데이터가 없습니다
      </p>
    </div>
  );
}

export function DashboardCharts({ chartTab, dailyTrend, adChartData, benchmarkData, hasTrend }: Props) {
  return (
    <>
      {/* Revenue / profit rate chart */}
      {chartTab === 'revenue' && hasTrend && (
        <div className="flex-1 flex flex-col p-5 min-h-0">
          <div className="flex items-center gap-5 mb-3 text-[13px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-600" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-700" />광고비 · 자체 축</span>
            <span className="ml-auto text-slate-400">두 계열의 크기 차이가 커 축을 나눔</span>
          </div>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={CHART_INITIAL_DIMENSION}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.14} /><stop offset="95%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient>
                <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gAdRate" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.08} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              </defs>
              {/* Both axes carry ids, so the grid has to name one — the
                  default `yAxisId="0"` matches neither and draws nothing. */}
              <CartesianGrid yAxisId="rev" stroke="#eceef3" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fill: '#94a3b8' }} interval={4} />
              {/* July measured: revenue peaks at 18,222,165 on one day while ad
                  spend runs 9,649–16,629 every day — about 1,100x apart. On one
                  axis the ad line sits flat on zero and says nothing. */}
              <YAxis yAxisId="rev" fontSize={10} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} domain={[0, 'auto']} />
              <YAxis yAxisId="spend" orientation="right" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} domain={[0, 'auto']} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={<EvidenceTooltip />} contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (v == null) return ['—', name === 'revenue' ? '매출' : name === 'adCost' ? '광고비' : name === 'profitRate' ? '이익률' : '광고비율'];
                if (name === 'revenue') return [`\u20A9${formatKRW(Number(v))}`, '매출'];
                if (name === 'adCost') return [`\u20A9${formatKRW(Number(v))}`, '광고비'];
                return [`${Number(v).toFixed(1)}%`, name === 'profitRate' ? '이익률' : '광고비율'];
              }} />
              <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} fill="url(#gRevenue)" name="revenue" dot={{ r: 2, fill: '#7c3aed', strokeWidth: 0 }} connectNulls={false} />
              <Area yAxisId="spend" type="monotone" dataKey="adCost" stroke="#b54708" strokeWidth={1.5} fill="none" name="adCost" dot={{ r: 2, fill: '#b54708', strokeWidth: 0 }} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* An empty chart still occupies the chart's height. Collapsing it moves
          everything below it on every range change, and makes "no data" look
          like a different kind of block than "data". */}
      {chartTab === 'revenue' && !hasTrend && (
        <EmptyChartFrame />
      )}

      {/* Ad cost / ratio chart */}
      {chartTab === 'rate' && hasTrend && (
        <div className="flex-1 flex flex-col p-5 min-h-0">
          <div className="flex items-center gap-5 mb-3 text-[13px] text-slate-400 shrink-0">
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
              {/* Both axes carry ids, so the grid has to name one — the
                  default `yAxisId="0"` matches neither and draws nothing. */}
              <CartesianGrid yAxisId="pct" stroke="#eceef3" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fill: '#94a3b8' }} interval={4} />
              <YAxis yAxisId="pct" fontSize={10} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={<EvidenceTooltip />} contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (v == null) return ['—', name === 'adRate' ? '광고비율' : name === 'adCost' ? '광고비' : '매출'];
                if (name === 'adRate') return [`${Number(v).toFixed(1)}%`, '광고비율'];
                return [`\u20A9${formatKRW(Number(v))}`, name === 'adCost' ? '광고비' : '매출'];
              }} />
              {/* Rates share a scale honestly — both are percentages of the
                  same revenue, so one axis is the whole point. */}
              <Area yAxisId="pct" type="monotone" dataKey="profitRate" stroke="#067647" strokeWidth={2} fill="url(#gAdRev)" name="profitRate" dot={false} connectNulls={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#b54708" strokeWidth={1.5} fill="none" name="adRate" dot={false} strokeDasharray="5 3" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'rate' && !hasTrend && (
        <EmptyChartFrame />
      )}

      {/* Benchmark chart */}
      {chartTab === 'benchmark' && benchmarkData && (
        <div className="flex-1 flex flex-col p-5 min-h-0">
          <div className="flex items-center gap-5 mb-4 text-[13px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />내 수치</span>
          </div>
          <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={CHART_INITIAL_DIMENSION}>
            <BarChart data={benchmarkData} barGap={4} barCategoryGap="25%">
              <CartesianGrid stroke="#eceef3" vertical={false} />
              <XAxis dataKey="name" fontSize={13} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} fontWeight={600} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 13, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any) => [v == null ? '—' : `${Number(v).toFixed(1)}%`, '내 수치']} />
              <Bar dataKey="my" name="my" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {benchmarkData.map((entry, i) => (
                  <Cell key={i} fill={entry.my === null ? '#cbd5e1' : '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 shrink-0">
            {benchmarkData.map(item => (
              <div key={item.name} className="text-center">
                <div className="text-[13px] font-semibold text-slate-500">{item.name}</div>
                <div className={cn('text-[20px] font-bold tabular-nums mt-0.5', item.my === null ? 'text-slate-300' : 'text-slate-700')}>
                  {item.my === null ? '—' : `${item.my}${item.unit}`}
                </div>
                <div className="text-[13px] mt-0.5 text-slate-400">비교 기준 없음</div>
                {item.basis && <DashboardDataBasis basis={item.basis} className="mt-1 text-left" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
