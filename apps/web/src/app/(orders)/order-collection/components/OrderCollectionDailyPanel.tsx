'use client';

import { memo, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type {
  DailyCollectionStat,
  MallCollectionStat,
  OrderCollectionSummary,
} from '../lib/order-collection-stats';

interface OrderCollectionDailyPanelProps {
  summary: OrderCollectionSummary;
}

const CHART_DAYS = 14;
const MALL_DETAIL_LIMIT = 12;

interface CollectionTabStat {
  key: string;
  name: string;
  orderRows: number;
  productRows: number;
  latestAt: number;
}

export const OrderCollectionDailyPanel = memo(function OrderCollectionDailyPanel({
  summary,
}: OrderCollectionDailyPanelProps) {
  const [activeTab, setActiveTab] = useState('all');
  const { dailyStats, mallStats, latestAt, totals } = summary;
  const chartStats = useMemo(() => dailyStats.slice(0, CHART_DAYS).reverse(), [dailyStats]);
  const tabs = useMemo<CollectionTabStat[]>(
    () => [
      {
        key: 'all',
        name: '전체',
        orderRows: totals.orders,
        productRows: totals.products,
        latestAt,
      },
      ...mallStats,
    ],
    [latestAt, mallStats, totals.orders, totals.products],
  );
  const activeStat = tabs.find((tab) => tab.key === activeTab) ?? tabs[0]!;
  const visibleMallStats =
    activeStat.key === 'all'
      ? mallStats.slice(0, MALL_DETAIL_LIMIT)
      : mallStats.filter((stat) => stat.key === activeStat.key);

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

      <div className="grid items-stretch gap-4 p-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(380px,0.7fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4">
            <DailyMetric label="주문" value={formatNumber(totals.orders)} />
            <DailyMetric label="상품" value={formatNumber(totals.products)} />
            <DailyMetric label="몰" value={formatNumber(mallStats.length)} />
            <DailyMetric label="업데이트" value={latestAt > 0 ? shortDateTimeLabel(latestAt) : '-'} />
          </div>
          <DailyBarChart stats={chartStats} />
        </div>

        <RealtimeProcessingPanel
          activeStat={activeStat}
          activeTab={activeTab}
          rows={visibleMallStats}
          tabs={tabs}
          onTabChange={setActiveTab}
        />
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
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        데이터 없음
      </div>
    );
  }

  const maxOrders = Math.max(1, ...stats.map((stat) => stat.orderRows));

  return (
    <div className="h-72 rounded-lg border border-slate-200 bg-slate-50 px-4 pb-4 pt-5">
      <div className="flex h-60 items-end gap-2">
        {stats.map((stat, index) => {
          const height = Math.max(stat.orderRows > 0 ? 8 : 3, Math.round((stat.orderRows / maxOrders) * 100));
          const latest = index === stats.length - 1;
          return (
            <div key={stat.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-52 w-full items-end justify-center">
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

function RealtimeProcessingPanel({
  activeStat,
  activeTab,
  rows,
  tabs,
  onTabChange,
}: {
  activeStat: CollectionTabStat;
  activeTab: string;
  rows: MallCollectionStat[];
  tabs: CollectionTabStat[];
  onTabChange: (key: string) => void;
}) {
  return (
    <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">실시간 처리</div>
        <div className="text-xs tabular-nums text-slate-400">
          {activeStat.latestAt > 0 ? shortDateTimeLabel(activeStat.latestAt) : '-'}
        </div>
      </div>

      <div className="border-b border-slate-100 px-3 py-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={
                  active
                    ? 'whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm'
                    : 'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800'
                }
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-slate-100">
        <ProcessingMetric label="주문" value={formatNumber(activeStat.orderRows)} />
        <ProcessingMetric label="상품" value={formatNumber(activeStat.productRows)} />
        <ProcessingMetric label="업데이트" value={activeStat.latestAt > 0 ? timeLabel(activeStat.latestAt) : '-'} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">데이터 없음</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">몰</th>
                <th className="px-3 py-2.5 text-right font-medium">주문</th>
                <th className="px-3 py-2.5 text-right font-medium">업데이트</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((stat) => (
                <tr key={stat.key} className="border-t border-slate-100">
                  <td className="max-w-[150px] truncate px-4 py-3 text-xs font-medium text-slate-700">
                    {stat.name}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900">
                    {formatNumber(stat.orderRows)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-slate-500">
                    {shortDateTimeLabel(stat.latestAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProcessingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-slate-100 px-4 py-3 last:border-r-0">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-1 truncate text-base font-semibold tabular-nums text-slate-900">{value}</div>
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

function timeLabel(timestamp: number): string {
  const value = new Date(timestamp);
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
