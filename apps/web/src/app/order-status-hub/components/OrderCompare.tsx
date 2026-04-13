'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GitCompareArrows,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Search,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';

interface CompareResult {
  date: string;
  coupangCount: number;
  dbCount: number;
  countDiff: number;
  coupangAmount: number;
  dbAmount: number;
  amountDiff: number;
  hasMismatch: boolean;
}

interface CompareResponse {
  items: CompareResult[];
  summary: {
    totalCoupang: number;
    totalDb: number;
    mismatchDays: number;
  };
}

export default function OrderCompare() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(Date.now() - 14 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [submittedRange, setSubmittedRange] = useState<{ from: string; to: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.orders.compare({ from: submittedRange?.from ?? '', to: submittedRange?.to ?? '' }),
    queryFn: () =>
      apiClient.get<CompareResponse>(
        `/api/orders?from=${submittedRange!.from}&to=${submittedRange!.to}`
      ),
    enabled: !!submittedRange,
  });

  const results = data?.items ?? [];
  const summary = data?.summary ?? { totalCoupang: 0, totalDb: 0, mismatchDays: 0 };

  const handleCompare = () => {
    setSubmittedRange({ from: fromDate, to: toDate });
  };

  const totalCountDiff = summary.totalCoupang - summary.totalDb;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <GitCompareArrows size={24} className="inline mr-2" />
          판매처 주문비교
        </h1>
      </div>

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        쿠팡 API의 주문 데이터와 내부 DB 주문을 기간별로 비교하여
        누락/불일치를 확인합니다.
      </div>

      {/* 기간 선택 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">비교 기간 설정</h3>
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
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              <Search size={16} />
              비교 실행
            </button>
          </div>
        </div>
      </div>

      {submittedRange && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">로딩 중...</div>
          ) : (
            <>
              {/* 비교 요약 KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">쿠팡 주문</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {formatNumber(summary.totalCoupang)}건
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">DB 주문</div>
                    <div className="page-title">
                      {formatNumber(summary.totalDb)}건
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">건수 차이</div>
                    <div className={cn('text-2xl font-bold', totalCountDiff === 0 ? 'text-green-600' : 'text-red-600')}>
                      {totalCountDiff > 0 ? '+' : ''}
                      {totalCountDiff}건
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 text-center">
                    <div className="text-sm text-slate-500">불일치 일수</div>
                    <div className={cn('text-2xl font-bold', summary.mismatchDays === 0 ? 'text-green-600' : 'text-amber-600')}>
                      {summary.mismatchDays}일
                    </div>
                  </div>
                </div>
              </div>

              {totalCountDiff === 0 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                  <CheckCircle size={16} /> 주문 건수가 일치합니다.
                </div>
              )}

              {/* 일별 비교 테이블 */}
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700">일별 비교</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                        <th className="px-4 py-3">날짜</th>
                        <th className="px-4 py-3 text-right">쿠팡 주문</th>
                        <th className="px-4 py-3 text-right">DB 주문</th>
                        <th className="px-4 py-3 text-right">차이</th>
                        <th className="px-4 py-3">상태</th>
                      </tr>
                    </thead>
                    <tbody >
                      {results.map((row) => (
                        <tr
                          key={row.date}
                          className={
                            row.hasMismatch
                              ? 'bg-red-50/50 hover:bg-red-50'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="px-4 py-3 text-sm font-mono">
                            {row.date}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {row.coupangCount}건
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {row.dbCount}건
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn('text-sm font-medium', row.countDiff === 0 ? 'text-green-600' : 'text-red-600')}>
                              {row.countDiff > 0 ? '+' : ''}
                              {row.countDiff}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {row.hasMismatch ? (
                              <span className="flex items-center gap-1 text-xs text-red-600">
                                <AlertTriangle size={12} /> 불일치
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle size={12} /> 일치
                              </span>
                            )}
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
          <p>기간을 선택하고 비교를 실행하세요</p>
        </div>
      )}
    </div>
  );
}
