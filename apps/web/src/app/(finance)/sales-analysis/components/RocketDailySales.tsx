'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Package, RefreshCw, Rocket } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';

interface RocketDay {
  date: string;
  revenue: number;
  poCount: number;
  itemQty: number;
}

interface RocketMonthly {
  year: number;
  month: number;
  days: RocketDay[];
  total: { revenue: number; poCount: number; itemQty: number };
}

interface RocketItem {
  name: string;
  qty: number;
  amount: number;
}

interface RocketOrder {
  poSeq: number;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
  items: RocketItem[];
}

const YEAR_OPTIONS = [2024, 2025, 2026];

/** 특정 날짜의 발주 목록 + 발주별 품목(SKU) 드릴다운 */
function OrdersPanel({ date }: { date: string }) {
  const [openPo, setOpenPo] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'rocket-orders', date],
    queryFn: () => apiClient.get<RocketOrder[]>(`/api/dashboard/rocket-sales/orders?date=${date}`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500">
        <Loader2 size={13} className="animate-spin text-purple-600" />
        발주 목록 불러오는 중…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <div className="px-4 py-3 text-xs text-slate-400">발주 없음</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {data.map((po) => {
        const open = openPo === po.poSeq;
        return (
          <div key={po.poSeq}>
            <button
              type="button"
              onClick={() => setOpenPo(open ? null : po.poSeq)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-white"
            >
              {open ? (
                <ChevronDown size={14} className="flex-none text-purple-500" />
              ) : (
                <ChevronRight size={14} className="flex-none text-slate-400" />
              )}
              <span className="flex-none font-mono text-[11px] text-slate-400">#{po.poSeq}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {po.firstSkuName}
                {po.skuCount > 1 && <span className="text-slate-400"> 외 {po.skuCount - 1}종</span>}
              </span>
              <span className="flex-none tabular-nums text-slate-500">{formatNumber(po.orderQty)}개</span>
              <span className="flex-none w-28 text-right font-semibold tabular-nums text-slate-800">
                {formatKRW(po.orderAmount)}원
              </span>
              <span className="hidden flex-none rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 sm:inline">
                {po.status}
              </span>
            </button>
            {open && (
              <div className="bg-white px-4 pb-3 pl-9">
                {po.items.length === 0 ? (
                  <div className="py-2 text-[11px] text-slate-400">품목 상세 없음 (대표상품: {po.firstSkuName})</div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-[10px] text-slate-400">
                        <th className="py-1 text-left font-medium">품목 (SKU)</th>
                        <th className="py-1 text-right font-medium">수량</th>
                        <th className="py-1 text-right font-medium">금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.items.map((it, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="py-1 pr-2 text-slate-600">
                            <Package size={11} className="mr-1 inline text-purple-400" />
                            {it.name}
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-500">{formatNumber(it.qty)}</td>
                          <td className="py-1 text-right tabular-nums text-slate-700">{formatKRW(it.amount)}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {po.vendorName && (
                  <div className="pt-1.5 text-[10px] text-slate-400">
                    {po.vendorName}
                    {po.centerName ? ` · ${po.centerName}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RocketDailySales() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const { data, isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ['dashboard', 'rocket-sales', year, month],
    queryFn: () =>
      apiClient.get<RocketMonthly>(`/api/dashboard/rocket-sales?year=${year}&month=${month}`),
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const showLoading = isLoading && !data;
  const maxRevenue = Math.max(1, ...(data?.days.map((d) => d.revenue) ?? []));
  const avgRevenue =
    data && data.days.length > 0 ? Math.round(data.total.revenue / data.days.length) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rocket size={20} className="text-purple-600" />
          <h1 className="page-title">쿠팡 로켓 일별 매출</h1>
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            발주금액 기준
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setExpandedDate(null);
            }}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setExpandedDate(null);
            }}
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
          선택한 월의 로켓 발주 데이터를 불러오는 중입니다.
        </div>
      )}

      {data && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card">
              <div className="card-label">월 발주금액</div>
              <div className="card-value">{formatKRW(data.total.revenue)}원</div>
            </div>
            <div className="card">
              <div className="card-label">발주 건수</div>
              <div className="card-value">{formatNumber(data.total.poCount)}건</div>
            </div>
            <div className="card">
              <div className="card-label">일평균 발주금액</div>
              <div className="card-value">{avgRevenue > 0 ? `${formatKRW(avgRevenue)}원` : '—'}</div>
            </div>
            <div className="card">
              <div className="card-label">발주 수량</div>
              <div className="card-value">{formatNumber(data.total.itemQty)}개</div>
            </div>
          </div>

          {/* 바 차트 */}
          {data.days.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Rocket size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">데이터 없음</p>
              <p className="text-xs mt-1">
                공급사허브(po-web) 발주리스트를 수집하면 발주일 기준 일별 매출이 쌓입니다
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="text-xs font-semibold text-slate-500 mb-4">
                {year}년 {month}월 일별 발주금액 — 쿠팡 로켓(공급사 발주) 기준
              </div>
              <div className="flex items-end gap-1 h-48">
                {data.days.map((d) => {
                  const heightPct = (d.revenue / maxRevenue) * 100;
                  const dayNum = parseInt(d.date.slice(8), 10);
                  const active = expandedDate === d.date;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setExpandedDate(active ? null : d.date)}
                      className="flex-1 flex flex-col items-center gap-1 group relative"
                    >
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 shadow-lg pointer-events-none">
                        <div className="font-semibold">{d.date}</div>
                        <div>{formatKRW(d.revenue)}원</div>
                        <div className="text-slate-300">발주 {formatNumber(d.poCount)}건 · 수량 {formatNumber(d.itemQty)}개</div>
                      </div>
                      <div
                        className={cn(
                          'w-full rounded-t transition-colors',
                          active ? 'bg-purple-700' : 'bg-purple-600 group-hover:bg-purple-500',
                        )}
                        style={{ height: `${Math.max(heightPct, 1.5)}%` }}
                      />
                      {data.days.length <= 31 && <span className="text-[9px] text-slate-400">{dayNum}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 날짜별 테이블 — 행 클릭 시 그날 발주 목록 → 품목까지 드릴다운 */}
          {data.days.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-[12px] font-semibold text-slate-500">날짜 (클릭 → 발주 내역)</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">발주금액</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">발주 건수</th>
                    <th className="text-right px-4 py-3 text-[12px] font-semibold text-slate-500">발주 수량</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.days].reverse().map((d) => {
                    const open = expandedDate === d.date;
                    return (
                      <Fragment key={d.date}>
                        <tr
                          className={cn(
                            'border-b border-slate-100 cursor-pointer hover:bg-slate-50',
                            open && 'bg-purple-50/50',
                          )}
                          onClick={() => setExpandedDate(open ? null : d.date)}
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-700">
                            <span className="inline-flex items-center gap-1.5">
                              {open ? (
                                <ChevronDown size={14} className="text-purple-500" />
                              ) : (
                                <ChevronRight size={14} className="text-slate-400" />
                              )}
                              {d.date}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatKRW(d.revenue)}원</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(d.poCount)}건</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(d.itemQty)}개</td>
                        </tr>
                        {open && (
                          <tr className="border-b border-slate-200 bg-slate-50/60">
                            <td colSpan={4} className="p-0">
                              <OrdersPanel date={d.date} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-2.5 text-slate-700">합계</td>
                    <td className="px-4 py-2.5 text-right text-slate-800">{formatKRW(data.total.revenue)}원</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(data.total.poCount)}건</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(data.total.itemQty)}개</td>
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
