'use client';

import { BarChart3, CalendarDays } from 'lucide-react';
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

const CHART_DAYS = 14;
const DETAIL_DAYS = 10;

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
  const chartStats = stats.slice(0, CHART_DAYS).reverse();
  const latest = stats[0] ?? null;
  const totals = stats.reduce(
    (acc, stat) => ({
      files: acc.files + stat.files,
      orders: acc.orders + stat.orderRows,
      products: acc.products + stat.productRows,
      days: acc.days + 1,
    }),
    { files: 0, orders: 0, products: 0, days: 0 },
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={18} className="text-slate-500" />
          <div>
            <div className="text-sm font-semibold text-slate-900">일별 수집 현황</div>
            <div className="text-xs text-slate-500">생성 파일 기준으로 날짜별 주문 데이터를 누적</div>
          </div>
        </div>
        <div className="text-xs tabular-nums text-slate-500">
          {latest ? `최근 수집 ${formatDateTime(latest.latestAt)}` : '수집 이력 없음'}
        </div>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <DailyMetric label="수집일" value={formatNumber(totals.days)} />
            <DailyMetric label="수집 파일" value={formatNumber(totals.files)} />
            <DailyMetric label="주문 수" value={formatNumber(totals.orders)} />
            <DailyMetric label="상품 행" value={formatNumber(totals.products)} />
          </div>
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
              <BarChart3 size={14} />
              최근 {CHART_DAYS}일 주문 수
            </div>
            <DailyBarChart stats={chartStats} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 text-xs font-medium text-slate-500">날짜별 상세</div>
          {stats.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
              아직 쌓인 수집 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">날짜</th>
                    <th className="px-3 py-2.5 text-right font-medium">주문</th>
                    <th className="px-3 py-2.5 text-right font-medium">파일</th>
                    <th className="px-3 py-2.5 text-left font-medium">몰</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.slice(0, DETAIL_DAYS).map((stat) => (
                    <tr key={stat.key} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 text-xs font-medium text-slate-700">{shortDayLabel(stat.key)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                        {formatNumber(stat.orderRows)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {formatNumber(stat.files)}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2.5 text-xs text-slate-500">
                        {stat.malls.length > 0 ? stat.malls.join(', ') : '-'}
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function DailyBarChart({ stats }: { stats: DailyCollectionStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        수집이 완료되면 막대 그래프가 표시됩니다.
      </div>
    );
  }

  const maxOrders = Math.max(1, ...stats.map((stat) => stat.orderRows));

  return (
    <div className="h-56 rounded-lg border border-slate-200 bg-slate-50 px-3 pb-3 pt-4">
      <div className="flex h-40 items-end gap-2">
        {stats.map((stat) => {
          const height = Math.max(stat.orderRows > 0 ? 8 : 3, Math.round((stat.orderRows / maxOrders) * 100));
          return (
            <div key={stat.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-32 w-full items-end justify-center">
                <div
                  className="w-full max-w-8 rounded-t-md bg-purple-600 shadow-sm"
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
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-[11px] text-slate-500">
        <span>주문 수 기준</span>
        <span>최대 {formatNumber(maxOrders)}건</span>
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

    const mallName = item.mallName ?? (item.mallKey ? MALL_LABELS[item.mallKey] : null);
    if (mallName) stat.malls.add(mallName);
  }

  return [...byDate.values()]
    .map((stat) => ({ ...stat, malls: [...stat.malls] }))
    .sort((a, b) => b.key.localeCompare(a.key));
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

function shortDayLabel(key: string): string {
  const [, month, day] = key.split('-');
  return `${month}.${day}`;
}

function chartDayLabel(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}
