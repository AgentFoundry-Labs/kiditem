'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import type { ReadinessResponse } from '@kiditem/shared/readiness';
import { apiClient } from '@/lib/api-client';
import { formatKRW, formatNumber } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useReadinessCollection } from '@/components/readiness/useReadinessCollection';

interface DayRevenue {
  date: string;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
}

interface MonthlyData {
  year: number;
  month: number;
  days: DayRevenue[];
  total: { revenue: number; orders: number; salesQty: number; visitors: number };
}

const YEAR_OPTIONS = [2024, 2025, 2026];

export default function WingDailySales() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ['traffic', 'monthly', year, month],
    queryFn: () =>
      apiClient.get<MonthlyData>(`/api/traffic/monthly?year=${year}&month=${month}`),
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
  const readinessQuery = useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiClient.get<ReadinessResponse>('/api/readiness'),
    staleTime: 15_000,
  });
  const salesCheck = readinessQuery.data?.checks.find((check) => check.key === 'wing_sales') ?? null;
  const missingSalesDays = salesCheck?.missingDates?.length ?? 0;
  const { pendingKey, handleCollect } = useReadinessCollection({
    refetchReadiness: async () => {
      await readinessQuery.refetch();
      await refetch();
    },
  });
  const collectingSales = pendingKey === 'wing_sales';

  const showLoading = isLoading && !data;
  const maxRevenue = Math.max(1, ...(data?.days.map((d) => d.revenue) ?? []));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-purple-600" />
          <h1 className="page-title">Wing 일별 매출</h1>
        </div>
        <div className="flex items-center gap-2">
          {salesCheck && missingSalesDays > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              누락 {missingSalesDays}일
            </span>
          )}
          <button
            onClick={() => {
              if (salesCheck) void handleCollect(salesCheck);
            }}
            disabled={!salesCheck || collectingSales || readinessQuery.isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {collectingSales ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            매출 받기
          </button>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
      </div>

      {showLoading && <PageSkeleton variant="table" />}

      {isPlaceholderData && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin text-purple-600" />
          선택한 월의 매출 데이터를 계산하는 중입니다.
        </div>
      )}

      {data && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card">
              <div className="card-label">월 총매출</div>
              <div className="card-value">{formatKRW(data.total.revenue)}원</div>
            </div>
            <div className="card">
              <div className="card-label">월 주문수</div>
              <div className="card-value">{formatNumber(data.total.orders)}건</div>
            </div>
            <div className="card">
              <div className="card-label">일평균 매출</div>
              <div className="card-value">
                {data.days.length > 0
                  ? `${formatKRW(Math.round(data.total.revenue / data.days.length))}원`
                  : '—'}
              </div>
            </div>
            <div className="card">
              <div className="card-label">월 방문자</div>
              <div className="card-value">{formatNumber(data.total.visitors)}명</div>
            </div>
          </div>

          {/* 바 차트 */}
          {data.days.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <BarChart3 size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">데이터 없음</p>
              <p className="text-xs mt-1">
                상단의 매출 받기로 누락 날짜를 수집하면 데이터가 쌓입니다
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="text-xs font-semibold text-slate-500 mb-4">
                {year}년 {month}월 일별 매출 — Wing 매출분석 기준
              </div>
              <div className="flex items-end gap-1 h-48">
                {data.days.map((d) => {
                  const heightPct = (d.revenue / maxRevenue) * 100;
                  const dayNum = parseInt(d.date.slice(8), 10);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* 툴팁 */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 shadow-lg pointer-events-none">
                        <div className="font-semibold">{d.date}</div>
                        <div>{formatKRW(d.revenue)}원</div>
                        <div className="text-slate-300">주문 {formatNumber(d.orders)}건 · 판매 {formatNumber(d.salesQty)}개</div>
                      </div>
                      <div
                        className="w-full bg-purple-600 hover:bg-purple-500 rounded-t transition-colors cursor-default"
                        style={{ height: `${Math.max(heightPct, 1.5)}%` }}
                      />
                      {data.days.length <= 31 && (
                        <span className="text-[9px] text-slate-400">{dayNum}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 날짜별 테이블 */}
          {data.days.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-[12px] font-semibold text-slate-500">날짜</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">매출</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">주문</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">판매수량</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">방문자</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.date} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{d.date}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                        {formatKRW(d.revenue)}원
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(d.orders)}건</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(d.salesQty)}개</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(d.visitors)}명</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-2.5 text-slate-700">합계</td>
                    <td className="px-4 py-2.5 text-right text-slate-800">{formatKRW(data.total.revenue)}원</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(data.total.orders)}건</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(data.total.salesQty)}개</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(data.total.visitors)}명</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
