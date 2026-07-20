'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCcwDot,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Database,
  Search,
  Info,
} from 'lucide-react';
import { allOrderStatusesKeyParams, fetchOrderListAcrossStatuses } from '../lib/orders-api';
import {
  aggregateOrdersByDay,
  summarizeOrderRange,
} from '../lib/order-projection';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SyncCheck() {
  const [fromDate, setFromDate] = useState(() => isoDateDaysAgo(13));
  const [toDate, setToDate] = useState(() => todayIsoDate());
  const [submittedRange, setSubmittedRange] = useState<{ from: string; to: string } | null>(
    null,
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.orders.sync(allOrderStatusesKeyParams(submittedRange ?? {})),
    queryFn: () => fetchOrderListAcrossStatuses(submittedRange!),
    enabled: !!submittedRange,
  });

  const orders = data?.items ?? [];
  const daily = submittedRange
    ? aggregateOrdersByDay(orders, submittedRange)
    : [];
  const summary = summarizeOrderRange(daily);

  const handleCheck = () => {
    if (!fromDate || !toDate || fromDate > toDate) return;
    setSubmittedRange({ from: fromDate, to: toDate });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">
          <RefreshCcwDot size={24} className="inline mr-2" />
          내부 DB 주문 커버리지
        </h2>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          외부 채널 API와의 동기화 누락 비교는 아직 연결되지 않았습니다. 이 화면은 내부 DB의
          일별 주문 수를 집계해 비어 있는 날짜만 안내합니다. 실제 누락 여부는 별도 동기화 잡
          + 채널 API 응답 비교가 필요합니다.
        </p>
      </div>

      {/* 기간 선택 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">기간 설정</h3>
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
              onClick={handleCheck}
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
              {/* KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-slate-500">
                      <Database size={14} /> 내부 DB 주문
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {formatNumber(summary.totalOrders)}건
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
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">주문 있는 날</div>
                    <div className="text-2xl font-bold text-green-600 mt-1">
                      {summary.daysWithOrders}일
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">주문 0인 날</div>
                    <div
                      className={cn(
                        'text-2xl font-bold mt-1',
                        summary.daysWithoutOrders === 0 ? 'text-green-600' : 'text-amber-600',
                      )}
                    >
                      {summary.daysWithoutOrders}일
                    </div>
                  </div>
                </div>
              </div>

              {summary.daysWithoutOrders === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                  <CheckCircle size={16} /> 모든 날짜에 내부 DB 주문이 존재합니다. 단, 외부
                  채널 누락 여부는 이 화면으로 판단할 수 없습니다.
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <AlertTriangle size={16} /> {summary.daysWithoutOrders}일 동안 내부 DB
                  주문이 0건입니다. 정상 휴무일일 수도 있고, 채널 동기화가 누락됐을 수도
                  있어 별도 확인이 필요합니다.
                </div>
              )}

              {/* 일별 비교 */}
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700">일별 주문 커버리지</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                        <th className="px-4 py-3">날짜 (KST)</th>
                        <th className="px-4 py-3 text-right">DB 주문 수</th>
                        <th className="px-4 py-3 text-right">총 수량</th>
                        <th className="px-4 py-3">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((row) => {
                        const empty = row.orderCount === 0;
                        return (
                          <tr
                            key={row.date}
                            className={
                              empty
                                ? 'bg-amber-50/40 hover:bg-amber-50'
                                : 'hover:bg-slate-50'
                            }
                          >
                            <td className="px-4 py-3 text-sm font-mono">{row.date}</td>
                            <td
                              className={cn(
                                'px-4 py-3 text-sm text-right',
                                empty ? 'text-slate-400' : 'font-semibold text-slate-700',
                              )}
                            >
                              {formatNumber(row.orderCount)}건
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-slate-500">
                              {formatNumber(row.totalQuantity)}개
                            </td>
                            <td className="px-4 py-3">
                              {empty ? (
                                <span className="flex items-center gap-1 text-xs text-amber-600">
                                  <AlertTriangle size={12} /> 주문 0
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle size={12} /> 주문 있음
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
          <RefreshCcwDot size={48} className="mx-auto mb-3 opacity-30" />
          <p>기간을 선택하고 조회를 실행하세요</p>
        </div>
      )}
    </div>
  );
}
