'use client';

import { memo, useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type {
  DailyCollectionStat,
  OrderCollectionSummary,
} from '../lib/order-collection-stats';

interface OrderCollectionDailyPanelProps {
  summary: OrderCollectionSummary;
}

const CHART_DAYS = 14;
const MALL_DETAIL_LIMIT = 12;

export const OrderCollectionDailyPanel = memo(function OrderCollectionDailyPanel({
  summary,
}: OrderCollectionDailyPanelProps) {
  const { dailyStats, mallStats, latestAt, totals } = summary;
  const chartStats = useMemo(() => dailyStats.slice(0, CHART_DAYS).reverse(), [dailyStats]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={17} className="text-slate-500" />
          <div className="text-sm font-semibold text-slate-900">수집 현황</div>
        </div>
        <div
          className="rounded-full bg-slate-50 px-2.5 py-1 text-xs tabular-nums text-slate-500"
          title={latestAt > 0 ? formatDateTime(latestAt) : undefined}
        >
          {latestAt > 0 ? shortDateTimeLabel(latestAt) : '-'}
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4">
            <DailyMetric label="주문" value={formatNumber(totals.orders)} />
            <DailyMetric label="상품" value={formatNumber(totals.products)} />
            <DailyMetric label="몰" value={formatNumber(mallStats.length)} />
            <DailyMetric label="업데이트" value={latestAt > 0 ? shortDateTimeLabel(latestAt) : '-'} />
          </div>
          <DailyBarChart stats={chartStats} />
        </div>

        <div className="min-w-0">
          {mallStats.length === 0 ? (
            <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
              데이터 없음
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">몰</th>
                    <th className="px-3 py-2.5 text-right font-medium">주문</th>
                    <th className="px-3 py-2.5 text-right font-medium">상품</th>
                    <th className="px-3 py-2.5 text-left font-medium">업데이트</th>
                  </tr>
                </thead>
                <tbody>
                  {mallStats.slice(0, MALL_DETAIL_LIMIT).map((stat) => (
                    <tr key={stat.key} className="border-t border-slate-100">
                      <td className="max-w-[150px] truncate px-3 py-2.5 text-xs font-medium text-slate-700">
                        {stat.name}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                        {formatNumber(stat.orderRows)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {formatNumber(stat.productRows)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-500">
                        {shortDateTimeLabel(stat.latestAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

function DailyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function DailyBarChart({ stats }: { stats: DailyCollectionStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        데이터 없음
      </div>
    );
  }

  const maxOrders = Math.max(1, ...stats.map((stat) => stat.orderRows));

  return (
    <div className="h-56 rounded-lg border border-slate-200 bg-slate-50 px-4 pb-3 pt-4">
      <div className="flex h-44 items-end gap-2">
        {stats.map((stat, index) => {
          const height = Math.max(stat.orderRows > 0 ? 8 : 3, Math.round((stat.orderRows / maxOrders) * 100));
          const latest = index === stats.length - 1;
          return (
            <div key={stat.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-36 w-full items-end justify-center">
                <div
                  className={latest ? 'w-full max-w-7 rounded-t-md bg-purple-600' : 'w-full max-w-7 rounded-t-md bg-slate-300'}
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

function chartDayLabel(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function shortDateTimeLabel(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}
