'use client';

import { CalendarDays } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

interface OrderCollectionDailyPanelProps {
  history: StoredOrderCollectionFile[];
}

interface DailyCollectionStat {
  key: string;
  label: string;
  files: number;
  orderRows: number;
  productRows: number;
  outputRows: number;
  browserFiles: number;
  manualFiles: number;
  latestAt: number;
  malls: string[];
}

interface MallCollectionStat {
  key: string;
  name: string;
  files: number;
  orderRows: number;
  productRows: number;
  latestAt: number;
}

const CHART_DAYS = 14;
const MALL_DETAIL_LIMIT = 12;

const MALL_LABELS: Record<string, string> = {
  'one-polaris': '원폴라리스',
  'icecream-mall': '아이스크림몰',
  kidkids: '키드키즈',
  kidsnote: '키즈노트',
  'haebub-mall': '해법몰',
  onch: '온채널',
  kkomangse: '꼬망세',
  art09: '아트공구',
  'tekville-edu': '테크빌교육',
  'benepia-mul': '베네피아물',
};

export function OrderCollectionDailyPanel({ history }: OrderCollectionDailyPanelProps) {
  const stats = buildDailyStats(history);
  const mallStats = buildMallStats(history);
  const chartStats = stats.slice(0, CHART_DAYS).reverse();
  const latestAt = history.reduce((latest, item) => Math.max(latest, item.convertedAt), 0);
  const totals = stats.reduce(
    (acc, stat) => ({
      orders: acc.orders + stat.orderRows,
      products: acc.products + stat.productRows,
    }),
    { orders: 0, products: 0 },
  );

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
}

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

function buildDailyStats(items: StoredOrderCollectionFile[]): DailyCollectionStat[] {
  const byDate = new Map<
    string,
    Omit<DailyCollectionStat, 'malls'> & {
      malls: Set<string>;
    }
  >();

  for (const item of items) {
    const key = item.collectionDate || dayKey(item.convertedAt);
    let stat = byDate.get(key);
    if (!stat) {
      stat = {
        key,
        label: dayLabel(key),
        files: 0,
        orderRows: 0,
        productRows: 0,
        outputRows: 0,
        browserFiles: 0,
        manualFiles: 0,
        latestAt: item.convertedAt,
        malls: new Set<string>(),
      };
      byDate.set(key, stat);
    }

    stat.files += 1;
    stat.orderRows += getOrderCount(item);
    stat.productRows += item.productRows ?? 0;
    stat.outputRows += item.outputRows ?? 0;
    stat.latestAt = Math.max(stat.latestAt, item.convertedAt);
    if (item.collectionMode === 'manual-upload') stat.manualFiles += 1;
    else stat.browserFiles += 1;

    const mallKey = resolveMallKey(item);
    const mallName = item.mallName ?? (mallKey ? MALL_LABELS[mallKey] : null);
    if (mallName) stat.malls.add(mallName);
  }

  return [...byDate.values()]
    .map((stat) => ({ ...stat, malls: [...stat.malls] }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function buildMallStats(items: StoredOrderCollectionFile[]): MallCollectionStat[] {
  const byMall = new Map<string, MallCollectionStat>();

  for (const item of items) {
    const mallKey = resolveMallKey(item);
    const mallName = item.mallName ?? (mallKey ? MALL_LABELS[mallKey] : null) ?? '기타';
    const key = mallKey ?? `unknown-${mallName}`;
    let stat = byMall.get(key);

    if (!stat) {
      stat = {
        key,
        name: mallName,
        files: 0,
        orderRows: 0,
        productRows: 0,
        latestAt: item.convertedAt,
      };
      byMall.set(key, stat);
    }

    stat.files += 1;
    stat.orderRows += getOrderCount(item);
    stat.productRows += item.productRows ?? 0;
    stat.latestAt = Math.max(stat.latestAt, item.convertedAt);
  }

  return [...byMall.values()].sort((a, b) => b.latestAt - a.latestAt || b.orderRows - a.orderRows);
}

function getOrderCount(result: StoredOrderCollectionFile): number {
  if (result.outputRows === null || result.productRows === null) return 0;
  return Math.max(0, result.outputRows - result.productRows);
}

function resolveMallKey(item: StoredOrderCollectionFile): string | null {
  if (item.mallKey) return item.mallKey;

  const searchable = `${item.mallName ?? ''} ${item.sourceName} ${item.fileName}`.toLowerCase();
  for (const [key, label] of Object.entries(MALL_LABELS)) {
    if (searchable.includes(key.toLowerCase()) || searchable.includes(label.toLowerCase())) {
      return key;
    }
  }

  return null;
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

function shortDateTimeLabel(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}
