'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { fetchWingTrackedHistory, type WingTrackedSnapshot } from '../../lib/wing-tracking-api';
import { filterWindow } from '../lib/wing-tracking-score';

type MetricKey =
  | 'salesLast28d'
  | 'estimatedRevenue28d'
  | 'pvLast28Day'
  | 'conversionRate28d'
  | 'salePriceKrw'
  | 'ratingCount';

const METRICS: Array<{ key: MetricKey; label: string; format: (value: number) => string }> = [
  { key: 'salesLast28d', label: '판매량', format: (v) => `${formatNumber(v)}개` },
  { key: 'estimatedRevenue28d', label: '매출', format: (v) => `${formatKRW(v)}원` },
  { key: 'pvLast28Day', label: '클릭수', format: (v) => `${formatNumber(v)}회` },
  { key: 'conversionRate28d', label: '전환율', format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'salePriceKrw', label: '판매가', format: (v) => `${formatKRW(v)}원` },
  { key: 'ratingCount', label: '리뷰수', format: (v) => `${formatNumber(v)}개` },
];

export function WingTrackedHistoryChart({
  trackedProductId,
  windowDays,
}: {
  trackedProductId: string;
  windowDays?: number;
}) {
  const [metric, setMetric] = useState<MetricKey>('salesLast28d');
  const { data, isLoading } = useQuery({
    queryKey: ['wing-tracked-history', trackedProductId],
    queryFn: () => fetchWingTrackedHistory(trackedProductId, 30),
  });

  const config = METRICS.find((option) => option.key === metric) ?? METRICS[0];
  const points = useMemo(() => {
    const source = windowDays ? filterWindow(data?.points ?? [], windowDays) : data?.points ?? [];
    return buildPoints(source, metric);
  }, [data, metric, windowDays]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {METRICS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMetric(option.key)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-black transition',
              metric === option.key
                ? 'bg-[#ff5a1f] text-white'
                : 'bg-[var(--surface)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[var(--text-tertiary)]">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : points.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-center text-xs font-bold text-[var(--text-tertiary)]">
          아직 추이 데이터가 없습니다. 날짜가 지나거나 지표를 갱신하면 그래프가 쌓입니다.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 700 }} stroke="var(--text-tertiary)" />
            <YAxis
              tick={{ fontSize: 11, fontWeight: 700 }}
              stroke="var(--text-tertiary)"
              width={52}
              tickFormatter={(value: number) => compactAxis(value, metric)}
            />
            <Tooltip
              formatter={(value) => [config.format(Number(value)), config.label]}
              contentStyle={{ borderRadius: 12, fontSize: 12, fontWeight: 700 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#ff5a1f"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** 카드에 상시 노출하는 작은 추이 스파크라인(축·툴팁 없음). 이미 받아온 points 를 그대로 그린다. */
export function TrendSparkline({
  points,
  windowDays,
  metric = 'estimatedRevenue28d',
}: {
  points: WingTrackedSnapshot[];
  windowDays: number;
  metric?: MetricKey;
}) {
  const data = useMemo(
    () =>
      filterWindow(points, windowDays)
        .map((snapshot) => ({ v: snapshot[metric] }))
        .filter((point): point is { v: number } => point.v != null),
    [points, windowDays, metric],
  );

  if (data.length < 2) {
    return (
      <div className="flex h-full min-h-[56px] w-full items-center justify-center text-[11px] font-bold text-[var(--text-quaternary)]">
        추이 데이터 부족
      </div>
    );
  }

  const rising = data[data.length - 1].v >= data[0].v;
  const color = rising ? '#10b981' : '#f43f5e';
  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function buildPoints(snapshots: WingTrackedSnapshot[], metric: MetricKey) {
  return snapshots
    .map((snapshot) => ({ date: snapshot.businessDate.slice(5, 10), value: snapshot[metric] }))
    .filter((point): point is { date: string; value: number } => point.value != null);
}

function compactAxis(value: number, metric: MetricKey): string {
  if (metric === 'conversionRate28d') return `${Math.round(value * 100)}%`;
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}
