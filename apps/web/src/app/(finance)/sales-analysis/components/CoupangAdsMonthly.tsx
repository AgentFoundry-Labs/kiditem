'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, RefreshCw, AlertTriangle } from 'lucide-react';
import { SalesAnalysisAdsMonthlySchema } from '@kiditem/shared/finance';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, formatPercent } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import DataSourceBanner from './DataSourceBanner';

const YEAR_OPTIONS = [2024, 2025, 2026];

export default function CoupangAdsMonthly() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.salesAnalysis.adsMonthly(year, month),
    queryFn: () =>
      apiClient.getParsed(
        `/api/sales-analysis/ads/monthly?year=${year}&month=${month}`,
        SalesAnalysisAdsMonthlySchema,
      ),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const maxSpend = Math.max(1, ...(data?.days.map((d) => d.adSpend) ?? []));

  return (
    <div className="space-y-6">
      <DataSourceBanner />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone size={20} className="text-rose-500" />
          <h1 className="page-title">쿠팡 광고 일별 KPI</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />{' '}
            새로고침
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageSkeleton variant="table" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="월 광고비"
              value={`${formatKRW(data.total.adSpend)}원`}
            />
            <SummaryCard
              label="월 광고매출"
              value={`${formatKRW(data.total.adRevenue)}원`}
            />
            <SummaryCard
              label="ROAS"
              value={`${formatPercent(data.total.roas)}`}
              tone={data.total.roas >= 200 ? 'positive' : data.total.roas > 0 ? 'neutral' : 'muted'}
            />
            <SummaryCard
              label="월 광고 주문"
              value={`${formatNumber(data.total.orders)}건`}
              subtext={`${formatNumber(data.total.clicks)} 클릭 · ${formatNumber(data.total.impressions)} 노출`}
            />
          </div>

          {data.missingDates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">
                  Wing 트래픽이 있는 날 중 {data.missingDates.length}일은 쿠팡
                  광고 daily 가 비어 있어요.
                </div>
                <div className="mt-0.5 text-amber-700 break-words">
                  누락일: {data.missingDates.join(', ')}
                </div>
                <div className="mt-1 text-amber-700">
                  쿠팡 익스텐션 ‘광고 일별 수집’을 다시 돌려 보시면 채워집니다.
                </div>
              </div>
            </div>
          )}

          {data.days.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Megaphone size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">해당 월 광고 데이터 없음</p>
              <p className="text-xs mt-1">
                쿠팡 익스텐션 ‘광고 일별 수집’으로 채울 수 있습니다
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="text-xs font-semibold text-slate-500 mb-4">
                  {year}년 {month}월 일별 광고비 — 쿠팡 광고센터 daily 기준
                </div>
                <div className="flex items-end gap-1 h-40">
                  {data.days.map((d) => {
                    const heightPct = (d.adSpend / maxSpend) * 100;
                    const dayNum = parseInt(d.date.slice(8), 10);
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center gap-1 group relative"
                      >
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 shadow-lg pointer-events-none">
                          <div className="font-semibold">{d.date}</div>
                          <div>광고비 {formatKRW(d.adSpend)}원</div>
                          <div>광고매출 {formatKRW(d.adRevenue)}원</div>
                          <div className="text-slate-300">
                            ROAS {formatPercent(d.roas)} · CTR{' '}
                            {formatPercent(d.ctr * 100)} · CVR{' '}
                            {formatPercent(d.cvr * 100)}
                          </div>
                        </div>
                        <div
                          className="w-full bg-rose-500 hover:bg-rose-400 rounded-t transition-colors cursor-default"
                          style={{ height: `${Math.max(heightPct, 1.5)}%` }}
                        />
                        {data.days.length <= 31 && (
                          <span className="text-[9px] text-slate-400">
                            {dayNum}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-[12px] font-semibold text-slate-500">
                        날짜
                      </th>
                      <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">
                        광고비
                      </th>
                      <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">
                        광고매출
                      </th>
                      <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">
                        ROAS
                      </th>
                      <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">
                        클릭
                      </th>
                      <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">
                        노출
                      </th>
                      <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">
                        주문
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.days].reverse().map((d) => (
                      <tr
                        key={d.date}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5 text-slate-700 font-medium">
                          {d.date}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">
                          {formatKRW(d.adSpend)}원
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">
                          {formatKRW(d.adRevenue)}원
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">
                          {formatPercent(d.roas)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {formatNumber(d.clicks)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {formatNumber(d.impressions)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {formatNumber(d.orders)}건
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                      <td className="px-4 py-2.5 text-slate-700">합계</td>
                      <td className="px-4 py-2.5 text-right text-slate-800">
                        {formatKRW(data.total.adSpend)}원
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {formatKRW(data.total.adRevenue)}원
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {formatPercent(data.total.roas)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {formatNumber(data.total.clicks)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {formatNumber(data.total.impressions)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {formatNumber(data.total.orders)}건
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {data.campaigns.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="text-sm font-semibold text-slate-700">
                      캠페인 TOP {data.campaigns.length}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      ChannelAdTargetDailySnapshot · targetType=campaign · 광고비
                      내림차순
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-[12px] font-semibold text-slate-500">
                          캠페인
                        </th>
                        <th className="text-right px-4 py-2.5 text-[12px] font-semibold text-slate-500">
                          광고비
                        </th>
                        <th className="text-right px-4 py-2.5 text-[12px] font-semibold text-slate-500">
                          광고매출
                        </th>
                        <th className="text-right px-4 py-2.5 text-[12px] font-semibold text-slate-500">
                          ROAS
                        </th>
                        <th className="text-right px-4 py-2.5 text-[12px] font-semibold text-slate-500">
                          클릭
                        </th>
                        <th className="text-right px-4 py-2.5 text-[12px] font-semibold text-slate-500">
                          전환
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campaigns.map((c) => (
                        <tr
                          key={c.targetKey}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="px-4 py-2 text-slate-700">
                            <div className="font-medium">
                              {c.campaignName ?? c.targetKey}
                            </div>
                            <div className="text-[11px] text-slate-400 break-all">
                              {c.targetKey}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 font-semibold tabular-nums">
                            {formatKRW(c.adSpend)}원
                          </td>
                          <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                            {formatKRW(c.adRevenue)}원
                          </td>
                          <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                            {formatPercent(c.roas)}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
                            {formatNumber(c.clicks)}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
                            {formatNumber(c.conversions)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: 'positive' | 'neutral' | 'muted';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'muted'
        ? 'text-slate-400'
        : 'text-slate-800';
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={cn('card-value', valueClass)}>{value}</div>
      {subtext && (
        <div className="text-[11px] text-slate-400 mt-1">{subtext}</div>
      )}
    </div>
  );
}
