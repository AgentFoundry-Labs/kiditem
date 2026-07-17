'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GitCompareArrows,
  Calendar,
  Search,
  Info,
  TrendingUp,
} from 'lucide-react';
import { allOrderStatusesKeyParams, fetchOrderListAcrossStatuses } from '../lib/orders-api';
import {
  aggregateOrdersByDay,
  summarizeOrderRange,
} from '../lib/order-projection';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OrderCompare() {
  const [fromDate, setFromDate] = useState(() => isoDateDaysAgo(13));
  const [toDate, setToDate] = useState(() => todayIsoDate());
  const [submittedRange, setSubmittedRange] = useState<{ from: string; to: string } | null>(
    null,
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.orders.compare(allOrderStatusesKeyParams(submittedRange ?? {})),
    queryFn: () => fetchOrderListAcrossStatuses(submittedRange!),
    enabled: !!submittedRange,
  });

  const orders = data?.items ?? [];
  const daily = submittedRange
    ? aggregateOrdersByDay(orders, submittedRange)
    : [];
  const summary = summarizeOrderRange(daily);
  const avgPerDay =
    daily.length > 0
      ? Math.round((summary.totalOrders / daily.length) * 10) / 10
      : 0;

  const handleCompare = () => {
    if (!fromDate || !toDate || fromDate > toDate) return;
    setSubmittedRange({ from: fromDate, to: toDate });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">
          <GitCompareArrows size={24} className="inline mr-2" />
          기간별 DB 주문 요약
        </h2>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          외부 채널 API와 직접 비교하는 기능은 아직 연결되지 않았습니다. 이 화면은 내부 DB의
          주문 데이터만 기간별로 집계해 보여줍니다.
        </p>
      </div>

      {/* 기간 선택 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">조회 기간 설정</h3>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <span className="text-slate-400">~</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleCompare}
              disabled={!fromDate || !toDate || fromDate > toDate || isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              <Search size={16} />
              조회 실행
            </button>
          </div>
          {isError && (
            <p className="text-xs text-red-500 mt-2">주문 데이터를 불러오지 못했습니다.</p>
          )}
        </div>
      </div>

      {submittedRange && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">로딩 중...</div>
          ) : (
            <>
              {/* 요약 KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">총 주문 수</div>
                    <div className="text-2xl font-bold text-purple-600 mt-1">
                      {formatNumber(summary.totalOrders)}건
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">총 매출</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {formatKRW(summary.totalRevenue)}원
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">일평균 주문</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {formatNumber(avgPerDay)}건
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">조회 기간</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {daily.length}일
                    </div>
                  </div>
                </div>
              </div>

              {summary.peakDay && (
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                  <TrendingUp size={16} /> 최다 주문일: {summary.peakDay.date} (
                  {summary.peakDay.orderCount}건)
                </div>
              )}

              {/* 일별 테이블 */}
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700">일별 주문 요약</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                        <th className="px-4 py-3">날짜 (KST)</th>
                        <th className="px-4 py-3 text-right">주문 수</th>
                        <th className="px-4 py-3 text-right">총 수량</th>
                        <th className="px-4 py-3 text-right">매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((row) => (
                        <tr
                          key={row.date}
                          className={
                            row.orderCount === 0
                              ? 'bg-slate-50/50 hover:bg-slate-100/50 text-slate-400'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="px-4 py-3 text-sm font-mono">{row.date}</td>
                          <td
                            className={cn(
                              'px-4 py-3 text-sm text-right',
                              row.orderCount === 0 ? '' : 'font-semibold text-slate-700',
                            )}
                          >
                            {formatNumber(row.orderCount)}건
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatNumber(row.totalQuantity)}개
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatKRW(row.totalRevenue)}원
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!submittedRange && (
        <div className="text-center py-16 text-slate-400">
          <GitCompareArrows size={48} className="mx-auto mb-3 opacity-30" />
          <p>기간을 선택하고 조회를 실행하세요</p>
        </div>
      )}
    </div>
  );
}
