'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronRight, Loader2, Package, RefreshCw, Rocket } from 'lucide-react';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';
import { formatKRW, formatNumber, formatDateTime } from '@/lib/utils';
import type { ChannelSalesChartPoint } from './DashboardChannelSalesChart';

const DashboardChannelSalesChart = dynamic(
  () => import('./DashboardChannelSalesChart').then((m) => ({ default: m.DashboardChannelSalesChart })),
  { ssr: false, loading: () => <div className="h-[260px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);

function buildChartData(summary: SellpiaSalesSummary): ChannelSalesChartPoint[] {
  const map = new Map<string, ChannelSalesChartPoint>();
  for (const d of summary.rocket.daily) {
    map.set(d.date, { date: d.date, rocket: d.revenue, others: 0 });
  }
  for (const d of summary.others.daily) {
    const entry = map.get(d.date) ?? { date: d.date, rocket: 0, others: 0 };
    entry.others = d.revenue;
    map.set(d.date, entry);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// 월 매출 카드 클릭 시 하단에 펼쳐지는 몰별 매출 상세.
// 데이터/수집은 useSellpiaChannelSales 훅이 소유하고, 여기는 표시 전용.
export function DashboardChannelSales({
  summary,
  isLoading,
  isError,
  onRetry,
  onSync,
  syncing,
}: {
  summary: SellpiaSalesSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">몰별 매출 상세</h2>
          {summary?.range && (
            <span className="text-xs text-slate-400">
              {summary.range.from} ~ {summary.range.to}
            </span>
          )}
          {summary?.lastCapturedAt && (
            <span className="text-xs text-slate-300">· 수집 {formatDateTime(summary.lastCapturedAt)}</span>
          )}
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {syncing ? '수집 중...' : '지금 수집'}
        </button>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> 매출 불러오는 중...
        </div>
      ) : isError ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <span>매출을 불러오지 못했습니다.</span>
          <button onClick={onRetry} className="text-xs text-purple-600 hover:underline">다시 시도</button>
        </div>
      ) : !summary || !summary.hasData ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <span>아직 수집된 매출이 없습니다.</span>
          <button
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs text-purple-600 hover:underline disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            셀피아 판매현황 지금 수집
          </button>
        </div>
      ) : (
        <ChannelSalesBody summary={summary} />
      )}
    </div>
  );
}

function ChannelSalesBody({ summary }: { summary: SellpiaSalesSummary }) {
  const [expanded, setExpanded] = useState(false);
  const total = summary.totalRevenue || 0;
  const rocketShare = total > 0 ? Math.round((summary.rocket.revenue / total) * 100) : 0;
  const othersShare = total > 0 ? Math.round((summary.others.revenue / total) * 100) : 0;
  const chartData = buildChartData(summary);

  return (
    <>
      {/* 로켓 단독 + 윙·기타 합산 (윙·기타 클릭 시 몰별 세부 내려옴) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">쿠팡 로켓</div>
              <div className="text-xs text-slate-400">쿠팡-직배송</div>
            </div>
            <span className="ml-auto text-xs font-semibold text-violet-600">{rocketShare}%</span>
          </div>
          <div className="text-xl font-extrabold tabular-nums text-slate-900">{formatKRW(summary.rocket.revenue)}</div>
          <div className="text-xs text-slate-400 mt-0.5">판매수량 {formatNumber(summary.rocket.qty)}개</div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 text-left hover:bg-sky-50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">쿠팡윙 · 기타몰</div>
              <div className="text-xs text-slate-400">{summary.others.malls.length}개 몰 합산</div>
            </div>
            <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-sky-600">
              {othersShare}%
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          </div>
          <div className="text-xl font-extrabold tabular-nums text-slate-900">{formatKRW(summary.others.revenue)}</div>
          <div className="text-xs text-slate-400 mt-0.5">판매수량 {formatNumber(summary.others.qty)}개 · 클릭해서 몰별 보기</div>
        </button>
      </div>

      {/* 일별 추이 차트 (먼저 표시) */}
      {chartData.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-400 mb-1">일별 추이</div>
          <DashboardChannelSalesChart data={chartData} />
        </div>
      )}

      {/* 몰별 세부 (쿠팡윙·기타몰 영역 클릭 시 내려옴) */}
      {expanded && (
        <div className="mt-4 rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="text-left font-semibold px-3 py-2">몰</th>
                <th className="text-right font-semibold px-3 py-2">매출</th>
                <th className="text-right font-semibold px-3 py-2">수량</th>
                <th className="text-right font-semibold px-3 py-2">비중</th>
              </tr>
            </thead>
            <tbody>
              {summary.others.malls.map((mall) => {
                const share = summary.others.revenue > 0 ? Math.round((mall.revenue / summary.others.revenue) * 100) : 0;
                return (
                  <tr key={mall.sellerId} className="border-t border-slate-50">
                    <td className="px-3 py-2 text-slate-800">{mall.sellerName}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{formatKRW(mall.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatNumber(mall.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{share}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
