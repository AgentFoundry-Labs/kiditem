'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';
import {
  getHistoryCollectionBucket,
  getHistoryOrderCount,
} from '../lib/order-history-count';

interface OrderCollectionDailyPanelProps {
  history: StoredOrderCollectionFile[];
  className?: string;
}

interface DailyCollectionStat {
  key: string;
  label: string;
  orderRows: number;
  latestAt: number;
}

interface DailyCollectionAccumulator {
  key: string;
  label: string;
  orderNumbers: Set<string>;
  fallbackByBucket: Map<string, number>;
  latestAt: number;
}

type ChartRange = '1w' | '1m' | 'all';

const RANGE_OPTIONS: { key: ChartRange; label: string; days: number | null }[] = [
  { key: '1w', label: '1주', days: 7 },
  { key: '1m', label: '1달', days: 30 },
  { key: 'all', label: '전체', days: null },
];

/**
 * 수집 추이: 일자별 주문 막대 차트 + 기간 토글(1주/1달/전체).
 * 요약 지표는 page 상단 히어로 통계로, 몰별 관리는 '주문수집' 섹션으로 분리됨.
 */
export function OrderCollectionDailyPanel({ history, className }: OrderCollectionDailyPanelProps) {
  const [range, setRange] = useState<ChartRange>('1w');
  const stats = buildDailyStats(history);
  const days = RANGE_OPTIONS.find((option) => option.key === range)?.days ?? null;
  const chartStats = (days ? stats.slice(0, days) : [...stats]).reverse();

  return (
    <section
      className={cn(
        'flex h-full min-h-[430px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <TrendingUp size={17} className="text-slate-500" />
          <div className="text-sm font-semibold text-slate-900">수집 추이</div>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                range === option.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 p-5">
        <DailyBarChart stats={chartStats} />
      </div>
    </section>
  );
}

function DailyBarChart({ stats }: { stats: DailyCollectionStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        데이터 없음
      </div>
    );
  }

  const maxOrders = Math.max(1, ...stats.map((stat) => stat.orderRows));
  const { axisMax, ticks } = niceAxis(maxOrders); // 눈금 위쪽 값 + 눈금들(위→아래: max … 0)

  return (
    <div className="flex min-h-[320px] flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50 px-4 pb-4 pt-5">
      <div className="relative min-h-0 flex-1">
        {/* Y축 눈금(건수) + 가로 격자선 */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {ticks.map((tick, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-7 flex-none text-right text-[10px] tabular-nums text-slate-400">
                {formatNumber(tick)}
              </span>
              <span
                className={cn('h-px flex-1', i === ticks.length - 1 ? 'bg-slate-300' : 'bg-slate-200/70')}
              />
            </div>
          ))}
        </div>
        {/* 막대 (Y축 라벨 폭만큼 왼쪽 여백) */}
        <div className="relative flex h-full items-stretch gap-2 pl-9">
          {stats.map((stat, index) => {
            const height = stat.orderRows > 0 ? Math.max(2, Math.round((stat.orderRows / axisMax) * 100)) : 0;
            const latest = index === stats.length - 1;
            return (
              <div key={stat.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div
                  className={cn(
                    'w-full max-w-7 self-center rounded-t-md',
                    latest ? 'bg-purple-600' : 'bg-slate-300',
                  )}
                  style={{ height: `${height}%` }}
                  title={`${stat.label} 주문 ${formatNumber(stat.orderRows)}건`}
                />
              </div>
            );
          })}
        </div>
      </div>
      {/* X축 라벨 (막대와 동일한 왼쪽 여백) */}
      <div className="mt-1.5 flex gap-2 pl-9">
        {stats.map((stat) => (
          <div
            key={stat.key}
            className="min-w-0 flex-1 truncate text-center text-[11px] tabular-nums text-slate-500"
          >
            {chartDayLabel(stat.key)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 건수 축: 정수 눈금(1/2/5/10 단위)으로 위→아래 배열 + 축 상단값 반환. */
function niceAxis(max: number): { axisMax: number; ticks: number[] } {
  const m = Math.max(1, max);
  const rough = m / 4; // 눈금 4칸 기준 대략 간격
  const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const n = rough / pow;
  const base = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(base * pow)); // 주문 건수는 정수
  const axisMax = Math.max(step, Math.ceil(m / step) * step);
  const ticks: number[] = [];
  for (let t = axisMax; t > 0.001; t -= step) ticks.push(Math.round(t));
  ticks.push(0);
  return { axisMax, ticks };
}

function buildDailyStats(items: StoredOrderCollectionFile[]): DailyCollectionStat[] {
  const byDate = new Map<string, DailyCollectionAccumulator>();

  for (const item of items) {
    const key = item.collectionDate || dayKey(item.convertedAt);
    let stat = byDate.get(key);
    if (!stat) {
      stat = {
        key,
        label: dayLabel(key),
        orderNumbers: new Set<string>(),
        fallbackByBucket: new Map<string, number>(),
        latestAt: item.convertedAt,
      };
      byDate.set(key, stat);
    }
    const orderNumbers = item.orderNumbers ?? [];
    if (orderNumbers.length > 0) {
      const prefix = item.mallKey ?? item.mallName ?? item.sourceName;
      for (const orderNo of orderNumbers) {
        const normalized = String(orderNo).trim();
        if (normalized) stat.orderNumbers.add(`${prefix}:${normalized}`);
      }
    } else {
      const bucket = `${item.mallKey ?? item.mallName ?? item.sourceName}:${getHistoryCollectionBucket(item)}`;
      const count = getHistoryOrderCount(item) ?? 0;
      stat.fallbackByBucket.set(bucket, Math.max(stat.fallbackByBucket.get(bucket) ?? 0, count));
    }
    stat.latestAt = Math.max(stat.latestAt, item.convertedAt);
  }

  return [...byDate.values()]
    .map((stat) => ({
      key: stat.key,
      label: stat.label,
      orderRows: stat.orderNumbers.size + sumMapValues(stat.fallbackByBucket),
      latestAt: stat.latestAt,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function sumMapValues(values: Map<string, number>): number {
  let sum = 0;
  for (const value of values.values()) sum += value;
  return sum;
}

function dayKey(timestamp: number): string {
  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-');
  return `${year}. ${month}. ${day}.`;
}

function chartDayLabel(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}
