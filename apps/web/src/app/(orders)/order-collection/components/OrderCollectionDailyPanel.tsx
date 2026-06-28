'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

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

  return (
    <div className="flex min-h-[320px] flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50 px-4 pb-4 pt-5">
      <div className="flex min-h-0 flex-1 items-end gap-2">
        {stats.map((stat, index) => {
          const height = Math.max(stat.orderRows > 0 ? 8 : 3, Math.round((stat.orderRows / maxOrders) * 100));
          const latest = index === stats.length - 1;
          return (
            <div key={stat.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex min-h-0 flex-1 w-full items-end justify-center">
                <div
                  className={
                    latest
                      ? 'w-full max-w-7 rounded-t-md bg-purple-600'
                      : 'w-full max-w-7 rounded-t-md bg-slate-300'
                  }
                  style={{ height: `${height}%` }}
                  title={`${stat.label} 주문 ${formatNumber(stat.orderRows)}건`}
                />
              </div>
              <div className="w-full truncate text-center text-[11px] tabular-nums text-slate-500">
                {chartDayLabel(stat.key)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildDailyStats(items: StoredOrderCollectionFile[]): DailyCollectionStat[] {
  const byDate = new Map<string, DailyCollectionStat>();

  for (const item of items) {
    const key = item.collectionDate || dayKey(item.convertedAt);
    let stat = byDate.get(key);
    if (!stat) {
      stat = { key, label: dayLabel(key), orderRows: 0, latestAt: item.convertedAt };
      byDate.set(key, stat);
    }
    stat.orderRows += getOrderCount(item);
    stat.latestAt = Math.max(stat.latestAt, item.convertedAt);
  }

  return [...byDate.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function getOrderCount(result: StoredOrderCollectionFile): number {
  if (result.outputRows === null || result.productRows === null) return 0;
  return Math.max(0, result.outputRows - result.productRows);
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
