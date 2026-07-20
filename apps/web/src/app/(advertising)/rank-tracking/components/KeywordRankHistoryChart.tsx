'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { fetchKeywordRankHistory, type RankHistorySeries } from '../lib/rank-api';

const HISTORY_DAYS = 30;

type RankMetric = 'overallRank' | 'organicRank';

const METRIC_OPTIONS: Array<{ key: RankMetric; label: string }> = [
  { key: 'overallRank', label: '전체 순위 (광고 포함)' },
  { key: 'organicRank', label: '자연 순위' },
];

/** 경쟁 타깃 시리즈 색상 팔레트 — 자사(isOwn)는 항상 보라색 고정. */
const COMPETITOR_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];
const OWN_COLOR = '#7c3aed';

function seriesLabel(series: RankHistorySeries): string {
  return series.productName ?? series.vendorItemId;
}

/** 키워드 순위 추이 라인 차트 — Y축 반전(1위가 위), null 구간 = 순위권 밖(끊김). */
export default function KeywordRankHistoryChart({ keyword }: { keyword: string }) {
  const [metric, setMetric] = useState<RankMetric>('overallRank');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ads.keywordRankHistory(keyword, HISTORY_DAYS),
    queryFn: () => fetchKeywordRankHistory(keyword, HISTORY_DAYS),
  });

  const series = useMemo(() => data?.series ?? [], [data?.series]);

  const { rows, maxRank } = useMemo(() => {
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.businessDate)))].sort();
    let max = 0;
    const chartRows = dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const entry of series) {
        const point = entry.points.find((p) => p.businessDate === date);
        const value = point?.[metric];
        if (value != null) {
          row[entry.vendorItemId] = value;
          if (value > max) max = value;
        }
      }
      return row;
    });
    return { rows: chartRows, maxRank: max };
  }, [series, metric]);

  const colorByVendorItemId = useMemo(() => {
    const map = new Map<string, string>();
    let competitorIndex = 0;
    for (const entry of series) {
      if (entry.isOwn) {
        map.set(entry.vendorItemId, OWN_COLOR);
      } else {
        map.set(
          entry.vendorItemId,
          COMPETITOR_COLORS[competitorIndex % COMPETITOR_COLORS.length],
        );
        competitorIndex += 1;
      }
    }
    return map;
  }, [series]);

  const labelByVendorItemId = useMemo(
    () => new Map(series.map((entry) => [entry.vendorItemId, seriesLabel(entry)])),
    [series],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            &lsquo;{keyword}&rsquo; 순위 추이 <span className="font-medium text-slate-400">최근 {HISTORY_DAYS}일</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">끊긴 구간 = 스캔 범위 내 미노출(순위권 밖)</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMetric(option.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                metric === option.key
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-10 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin text-purple-600" />
          순위 이력 불러오는 중…
        </div>
      ) : series.length === 0 ? (
        <div className="px-5 py-12 text-center text-slate-400">
          <TrendingUp size={28} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium">수집된 순위 데이터가 없습니다</p>
          <p className="mt-1 text-xs">순위 체크를 실행하면 일별 순위가 쌓입니다</p>
        </div>
      ) : (
        <>
          <div className="h-[300px] px-2 pb-2 pt-5 sm:px-4">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height: 300 }}>
              <LineChart data={rows} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(value: string) => value.slice(5)}
                  dy={8}
                />
                <YAxis
                  reversed
                  domain={[1, Math.max(maxRank + 2, 10)]}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  width={44}
                  tickFormatter={(value: number) => `${value}위`}
                />
                <Tooltip
                  cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                  contentStyle={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    `${Number(value)}위`,
                    labelByVendorItemId.get(String(name)) ?? String(name),
                  ]}
                />
                {series.map((entry) => (
                  <Line
                    key={entry.vendorItemId}
                    type="monotone"
                    dataKey={entry.vendorItemId}
                    stroke={colorByVendorItemId.get(entry.vendorItemId)}
                    strokeWidth={entry.isOwn ? 3 : 2}
                    connectNulls={false}
                    dot={{ r: 3, fill: colorByVendorItemId.get(entry.vendorItemId), strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 px-5 py-3">
            {series.map((entry) => (
              <span key={entry.vendorItemId} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: colorByVendorItemId.get(entry.vendorItemId) }}
                />
                <span className={cn('max-w-[220px] truncate', entry.isOwn && 'font-semibold text-purple-800')}>
                  {seriesLabel(entry)}
                </span>
                {entry.isOwn && (
                  <span className="rounded bg-purple-600 px-1 py-px text-[9px] font-bold text-white">자사</span>
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
