'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  ChevronRight,
  Loader2,
  Package,
  RefreshCw,
  Rocket,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatDateTime, formatKRW, formatNumber } from '@/lib/utils';
import type { SalesChannelChartPoint } from './SalesChannelTrendChart';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';

const SalesChannelTrendChart = dynamic(
  () => import('./SalesChannelTrendChart').then((module) => ({
    default: module.SalesChannelTrendChart,
  })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center text-sm text-slate-300">
        차트 로딩 중...
      </div>
    ),
  },
);

export type SalesChannelSelection = 'all' | 'rocket' | 'others';

export function buildSalesChannelChartData(
  summary: SellpiaSalesSummary,
): SalesChannelChartPoint[] {
  const points = new Map<string, SalesChannelChartPoint>();
  for (const day of summary.rocket.daily) {
    points.set(day.date, { date: day.date, rocket: day.revenue, others: 0 });
  }
  for (const day of summary.others.daily) {
    const point = points.get(day.date) ?? {
      date: day.date,
      rocket: 0,
      others: 0,
    };
    point.others = day.revenue;
    points.set(day.date, point);
  }
  return [...points.values()].sort((left, right) => left.date.localeCompare(right.date));
}

interface SalesChannelAnalysisProps {
  summary: SellpiaSalesSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSync: () => void;
  syncing: boolean;
  selectedChannel: SalesChannelSelection;
  onChannelChange: (channel: SalesChannelSelection) => void;
  periodControl?: ReactNode;
}

export function SalesChannelAnalysis({
  summary,
  isLoading,
  isError,
  onRetry,
  onSync,
  syncing,
  selectedChannel,
  onChannelChange,
  periodControl,
}: SalesChannelAnalysisProps) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">월별 매출 상세</h2>
          {summary?.range && (
            <span className="text-xs text-slate-400">
              {summary.range.from} ~ {summary.range.to}
            </span>
          )}
          {summary?.lastCapturedAt && (
            <span className="text-xs text-slate-300">
              · 수집 {formatDateTime(summary.lastCapturedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {periodControl}
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {syncing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? '수집 중...' : '지금 수집'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-44 items-center justify-center text-sm text-slate-300">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          매출 불러오는 중...
        </div>
      ) : isError ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <span>몰별 매출을 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-purple-600 hover:underline"
          >
            다시 시도
          </button>
        </div>
      ) : !summary || !summary.hasData ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <span>선택한 기간에 수집된 몰별 매출이 없습니다.</span>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs text-purple-600 hover:underline disabled:opacity-50"
          >
            {syncing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            셀피아 판매현황 지금 수집
          </button>
        </div>
      ) : (
        <SalesChannelAnalysisBody
          summary={summary}
          selectedChannel={selectedChannel}
          onChannelChange={onChannelChange}
        />
      )}
    </section>
  );
}

function SalesChannelAnalysisBody({
  summary,
  selectedChannel,
  onChannelChange,
}: {
  summary: SellpiaSalesSummary;
  selectedChannel: SalesChannelSelection;
  onChannelChange: (channel: SalesChannelSelection) => void;
}) {
  const total = summary.totalRevenue;
  const rocketShare = total > 0
    ? Math.round((summary.rocket.revenue / total) * 100)
    : 0;
  const othersShare = total > 0
    ? Math.round((summary.others.revenue / total) * 100)
    : 0;
  const chartData = buildSalesChannelChartData(summary);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChannelSummaryButton
          selected={selectedChannel === 'rocket'}
          onClick={() => onChannelChange(selectedChannel === 'rocket' ? 'all' : 'rocket')}
          tone="rocket"
          title="쿠팡 로켓"
          subtitle="쿠팡-직배송"
          revenue={summary.rocket.revenue}
          quantity={summary.rocket.qty}
          share={rocketShare}
          icon={Rocket}
        />
        <ChannelSummaryButton
          selected={selectedChannel === 'others'}
          onClick={() => onChannelChange(selectedChannel === 'others' ? 'all' : 'others')}
          tone="others"
          title="쿠팡윙 · 기타몰"
          subtitle={`${summary.others.malls.length}개 몰 합산`}
          revenue={summary.others.revenue}
          quantity={summary.others.qty}
          share={othersShare}
          icon={Package}
        />
      </div>

      {chartData.length > 0 && (
        <div className="mt-5">
          <div className="mb-1 text-xs font-semibold text-slate-400">일별 추이</div>
          <SalesChannelTrendChart data={chartData} />
        </div>
      )}

      {selectedChannel === 'others' && (
        <MallBreakdown summary={summary} />
      )}
      {selectedChannel === 'rocket' && (
        <RocketDailyBreakdown summary={summary} />
      )}
    </>
  );
}

function ChannelSummaryButton({
  selected,
  onClick,
  tone,
  title,
  subtitle,
  revenue,
  quantity,
  share,
  icon: Icon,
}: {
  selected: boolean;
  onClick: () => void;
  tone: 'rocket' | 'others';
  title: string;
  subtitle: string;
  revenue: number;
  quantity: number;
  share: number;
  icon: LucideIcon;
}) {
  const rocket = tone === 'rocket';
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 text-left transition-all',
        rocket
          ? 'border-violet-100 bg-violet-50/50 hover:bg-violet-50'
          : 'border-sky-100 bg-sky-50/50 hover:bg-sky-50',
        selected && (rocket
          ? 'border-violet-400 ring-2 ring-violet-100'
          : 'border-sky-400 ring-2 ring-sky-100'),
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          rocket ? 'bg-violet-600' : 'bg-sky-600',
        )}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="text-xs text-slate-400">{subtitle}</div>
        </div>
        <span className={cn(
          'ml-auto flex items-center gap-1 text-xs font-semibold',
          rocket ? 'text-violet-600' : 'text-sky-600',
        )}>
          {share}%
          <ChevronRight className={cn('h-4 w-4 transition-transform', selected && 'rotate-90')} />
        </span>
      </div>
      <div className="text-xl font-extrabold tabular-nums text-slate-900">
        {formatKRW(revenue)}원
      </div>
      <div className="mt-0.5 text-xs text-slate-400">
        판매수량 {formatNumber(quantity)}개 · 클릭해서 상세 보기
      </div>
    </button>
  );
}

function MallBreakdown({ summary }: { summary: SellpiaSalesSummary }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        쿠팡윙 · 기타몰 상세
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-slate-50/70 text-xs text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">몰</th>
              <th className="px-3 py-2 text-right font-semibold">매출</th>
              <th className="px-3 py-2 text-right font-semibold">수량</th>
              <th className="px-3 py-2 text-right font-semibold">비중</th>
            </tr>
          </thead>
          <tbody>
            {summary.others.malls.map((mall) => {
              const share = summary.others.revenue > 0
                ? Math.round((mall.revenue / summary.others.revenue) * 100)
                : 0;
              return (
                <tr key={mall.sellerId} className="border-t border-slate-50">
                  <td className="px-3 py-2 text-slate-800">{mall.sellerName}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatKRW(mall.revenue)}원
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {formatNumber(mall.qty)}개
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{share}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RocketDailyBreakdown({ summary }: { summary: SellpiaSalesSummary }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
        쿠팡 로켓 일별 상세
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="sticky top-0 bg-slate-50/95">
            <tr className="text-xs text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">일자</th>
              <th className="px-3 py-2 text-right font-semibold">매출</th>
              <th className="px-3 py-2 text-right font-semibold">수량</th>
              <th className="px-3 py-2 text-right font-semibold">월 비중</th>
            </tr>
          </thead>
          <tbody>
            {summary.rocket.daily.map((day) => {
              const share = summary.rocket.revenue > 0
                ? Math.round((day.revenue / summary.rocket.revenue) * 100)
                : 0;
              return (
                <tr key={day.date} className="border-t border-slate-50">
                  <td className="px-3 py-2 text-slate-700">{day.date}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatKRW(day.revenue)}원
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {formatNumber(day.qty)}개
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{share}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
