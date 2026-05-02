'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, PackageCheck, RefreshCw } from 'lucide-react';
import {
  SalesAnalysisWingMappedInventorySchema,
  type SalesAnalysisWingMappedInventory,
  type SalesAnalysisWingMappedInventoryItem,
  type SalesAnalysisWingMappedInventoryStockStatus,
} from '@kiditem/shared/finance';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import DataSourceBanner from './DataSourceBanner';

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
const STOCK_STATUS_LABEL: Record<
  SalesAnalysisWingMappedInventoryStockStatus,
  string
> = {
  out: '품절 예상',
  low: '안전재고 이하',
  ok: '정상',
};

export default function WingDailySales() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['traffic', 'monthly', year, month],
    queryFn: () =>
      apiClient.get<MonthlyData>(`/api/traffic/monthly?year=${year}&month=${month}`),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
  const {
    data: mappedInventory,
    isLoading: isMappedInventoryLoading,
    isError: isMappedInventoryError,
    refetch: refetchMappedInventory,
    isFetching: isMappedInventoryFetching,
  } = useQuery({
    queryKey: queryKeys.salesAnalysis.wingMappedInventory(year, month),
    queryFn: () =>
      apiClient.getParsed(
        `/api/sales-analysis/wing/mapped-inventory?year=${year}&month=${month}`,
        SalesAnalysisWingMappedInventorySchema,
      ),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const maxRevenue = Math.max(1, ...(data?.days.map((d) => d.revenue) ?? []));

  return (
    <div className="space-y-6">
      <DataSourceBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-blue-600" />
          <h1 className="page-title">Wing 일별 매출</h1>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => {
              void refetch();
              void refetchMappedInventory();
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            disabled={isFetching || isMappedInventoryFetching}
          >
            <RefreshCw
              size={14}
              className={cn(
                (isFetching || isMappedInventoryFetching) && 'animate-spin',
              )}
            />{' '}
            새로고침
          </button>
        </div>
      </div>

      {isLoading && <PageSkeleton variant="table" />}

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
                Wing 익스텐션 팝업에서 &ldquo;일별 수집&rdquo;을 실행하면 데이터가 쌓입니다
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
                        className="w-full bg-blue-500 hover:bg-blue-400 rounded-t transition-colors cursor-default"
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

          <MappedInventorySection
            data={mappedInventory}
            isLoading={isMappedInventoryLoading}
            isError={isMappedInventoryError}
          />
        </>
      )}
    </div>
  );
}

function MappedInventorySection({
  data,
  isLoading,
  isError,
}: {
  data: SalesAnalysisWingMappedInventory | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <PackageCheck size={18} className="text-emerald-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Wing 매출 연결 재고
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              단일 내부 옵션으로 확정되는 등록상품만 표시
            </p>
          </div>
        </div>
        {data && (
          <div className="text-[11px] text-slate-400">
            {data.year}년 {data.month}월
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-4">
          <PageSkeleton variant="table" />
        </div>
      ) : isError ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          재고 연결 데이터를 불러오지 못했습니다
        </div>
      ) : data ? (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <InventorySummaryCard
              label="연결 상품"
              value={`${formatNumber(data.summary.mappedListings)} / ${formatNumber(data.summary.totalWingListings)}`}
            />
            <InventorySummaryCard
              label="연결 매출"
              value={`${formatKRW(data.summary.totalRevenue)}원`}
            />
            <InventorySummaryCard
              label="판매수량"
              value={`${formatNumber(data.summary.totalSalesQty)}개`}
            />
            <InventorySummaryCard
              label="품절 예상"
              value={`${formatNumber(data.summary.outOfStockCount)}개`}
              tone={data.summary.outOfStockCount > 0 ? 'danger' : 'muted'}
            />
            <InventorySummaryCard
              label="안전재고 이하"
              value={`${formatNumber(data.summary.lowStockCount)}개`}
              tone={data.summary.lowStockCount > 0 ? 'warning' : 'muted'}
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">
                다옵션 등록상품 {formatNumber(data.summary.skippedMultiOption)}개는
                제외되었습니다.
              </div>
              <div className="mt-0.5 text-amber-700">
                옵션 단위 매핑이 생기기 전까지는 내부 재고를 추정 연결하지 않습니다.
              </div>
            </div>
          </div>

          {data.items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              단일 옵션과 재고가 모두 확인된 Wing 등록상품이 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      등록상품
                    </th>
                    <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      내부 SKU
                    </th>
                    <th className="text-right px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      월 매출
                    </th>
                    <th className="text-right px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      주문/판매
                    </th>
                    <th className="text-right px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      현재/예상
                    </th>
                    <th className="text-right px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      안전차이
                    </th>
                    <th className="text-center px-3 py-2.5 text-[12px] font-semibold text-slate-500">
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <MappedInventoryRow key={item.listingId} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-[11px] text-slate-400">
            옵션 없음 {formatNumber(data.summary.skippedNoOption)}개 · 재고 없음{' '}
            {formatNumber(data.summary.skippedMissingInventory)}개
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MappedInventoryRow({
  item,
}: {
  item: SalesAnalysisWingMappedInventoryItem;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-3 py-2.5 align-top">
        <div className="font-medium text-slate-800 max-w-[280px] truncate">
          {item.channelName ?? item.externalId}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {item.externalId}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="font-mono text-xs text-slate-700">{item.sku}</div>
        <div className="text-[11px] text-slate-400 mt-0.5 max-w-[280px] truncate">
          {item.masterCode} · {item.masterName}
          {item.optionName ? ` / ${item.optionName}` : ''}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-semibold text-slate-800 align-top">
        {formatKRW(item.monthRevenue)}원
      </td>
      <td className="px-3 py-2.5 text-right text-slate-600 align-top">
        <div>{formatNumber(item.monthOrders)}건</div>
        <div className="text-[11px] text-slate-400">
          {formatNumber(item.monthSalesQty)}개 · 방문{' '}
          {formatNumber(item.visitors)}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-slate-600 align-top">
        <div>{formatNumber(item.currentStock)}개</div>
        <div className="text-[11px] text-slate-400">
          예상 {formatNumber(item.projectedStock)}개
        </div>
      </td>
      <td
        className={cn(
          'px-3 py-2.5 text-right align-top font-semibold',
          item.safetyGap < 0 ? 'text-rose-600' : 'text-emerald-700',
        )}
      >
        {formatNumber(item.safetyGap)}개
      </td>
      <td className="px-3 py-2.5 text-center align-top">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold',
            item.stockStatus === 'out' && 'bg-rose-50 text-rose-700',
            item.stockStatus === 'low' && 'bg-amber-50 text-amber-700',
            item.stockStatus === 'ok' && 'bg-emerald-50 text-emerald-700',
          )}
        >
          {STOCK_STATUS_LABEL[item.stockStatus]}
        </span>
      </td>
    </tr>
  );
}

function InventorySummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'muted' | 'warning' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div
        className={cn(
          'mt-1 text-base font-semibold',
          tone === 'neutral' && 'text-slate-800',
          tone === 'muted' && 'text-slate-500',
          tone === 'warning' && 'text-amber-700',
          tone === 'danger' && 'text-rose-700',
        )}
      >
        {value}
      </div>
    </div>
  );
}
