'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import type { RocketSavedPoSummary } from '@kiditem/shared/rocket-purchase-preview';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  PackageCheck,
  RefreshCw,
  Rocket,
  Truck,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { RocketPurchasePreviewSection } from '@/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection';
import { listSavedRocketPos } from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import { RocketConfirmFileList } from './RocketConfirmFileList';
import { RocketOrderActivityPanel } from './RocketOrderActivityPanel';
import { RocketMonthCalendar, type MonthDayData } from './RocketMonthCalendar';
import { useRocketOrderActivity } from '../hooks/useRocketOrderActivity';
import type { RocketChartPoint } from './RocketOrdersChart';

const RocketOrdersChart = dynamic(
  () => import('./RocketOrdersChart').then((mod) => mod.RocketOrdersChart),
  {
    ssr: false,
    loading: () => <PageSkeleton variant="cards" />,
  },
);

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: '거래처확인요청', label: '신규 주문 (거래확인서요청)' },
  { value: '발주확정', label: '발주확정' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EMPTY_ROCKET_POS: RocketSavedPoSummary[] = [];

interface RocketCalDay {
  date: string;
  count: number;
  qty: number;
  amount: number;
}

export interface RocketOrderExplorerRenderOptions {
  disabled: boolean;
  onSelectDate: (date: string | null) => void;
  savedDays: Record<string, MonthDayData>;
}

export interface RocketDecisionWorkspaceContext {
  activeMonth: string;
  onOrdersChanged: () => void;
  renderOrderExplorer: (options: RocketOrderExplorerRenderOptions) => ReactNode;
}

// 워크플로 단계 (로켓 물류 발주)
const STAGES = [
  { icon: Rocket, label: '신규 주문', desc: '거래확인서요청 발주' },
  { icon: PackageCheck, label: '납품 판단', desc: 'Sellpia 재고·채널 구성 기반 수량 검토' },
  { icon: Truck, label: '쉽먼트 / 밀크런', desc: '9박스 이하 택배 · 초과 밀크런' },
  { icon: FileText, label: '송장 · 출력', desc: '송장 입력 → 부착/동봉 문서 출력' },
];

function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayYmd() {
  return ymd(new Date());
}
function datesInRange(from: string, to: string): string[] {
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  for (let i = 0; i < 60 && cur <= end; i++) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
function dowOf(date: string): number {
  return new Date(date + 'T00:00:00').getDay();
}
function monthBounds(dateStr: string) {
  const d = new Date((dateStr || todayYmd()) + 'T00:00:00');
  const y = d.getFullYear();
  const m = d.getMonth();
  return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
}
function shiftMonthBounds(dateStr: string, delta: number) {
  const d = new Date((dateStr || todayYmd()) + 'T00:00:00');
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return { start: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

export function RocketOrdersWorkspace({
  decisionWorkspace,
}: {
  decisionWorkspace: (workspace: RocketDecisionWorkspaceContext) => ReactNode;
}) {
  // 입고예정일 기준 (기본: 이번 달 전체) — 월 달력과 차트가 같은 범위를 사용한다.
  const [from, setFrom] = useState(() => monthBounds(todayYmd()).start);
  const [to, setTo] = useState(() => monthBounds(todayYmd()).end);
  const [status, setStatus] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [view, setView] = useState<'month' | 'chart'>('month');
  // 발주 행 키는 `${sourceImportRunId}:${poNumber}` 문자열이다.
  const [openPo, setOpenPo] = useState<string | null>(null);
  // 로켓 채널 계정 선택 / 저장 수집본 재미리보기 (product-centered 재고 매칭)
  const [selectedRocketAccountId, setSelectedRocketAccountId] = useState('');
  const [selectedSavedSourceImportRunId, setSelectedSavedSourceImportRunId] = useState<string | null>(null);
  const { events, record: recordActivity } = useRocketOrderActivity();

  const handleRocketAccountChange = useCallback((account: { id: string }) => {
    setSelectedRocketAccountId(account.id);
  }, []);

  useEffect(() => {
    setSelectedSavedSourceImportRunId(null);
  }, [selectedRocketAccountId]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.orders.rocketSavedPoList({
      channelAccountId: selectedRocketAccountId,
      from,
      to,
      status,
    }),
    queryFn: () => listSavedRocketPos({
      channelAccountId: selectedRocketAccountId,
      from,
      to,
      status: status || undefined,
    }),
    enabled: selectedRocketAccountId.length > 0,
    meta: { suppressGlobalErrorToast: true },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const orders = data ?? EMPTY_ROCKET_POS;

  // 입고예정일별 그룹
  const byDate = useMemo(() => {
    const next = new Map<string, RocketSavedPoSummary[]>();
    for (const order of orders) {
      const key = order.plannedDeliveryDate || '미정';
      const arr = next.get(key);
      if (arr) arr.push(order);
      else next.set(key, [order]);
    }
    return next;
  }, [orders]);
  const calDays: RocketCalDay[] = useMemo(() => datesInRange(from, to).map((date) => {
    const pos = byDate.get(date) ?? [];
    return {
      date,
      count: pos.length,
      qty: pos.reduce((s, o) => s + o.orderQuantity, 0),
      amount: pos.reduce((s, o) => s + o.orderAmount, 0),
    };
  }), [byDate, from, to]);
  const scoped = useMemo(
    () => (selectedDay ? byDate.get(selectedDay) ?? [] : orders),
    [byDate, orders, selectedDay],
  );
  const { totalAmount, totalQty } = useMemo(() => ({
    totalAmount: scoped.reduce((s, o) => s + o.orderAmount, 0),
    totalQty: scoped.reduce((s, o) => s + o.orderQuantity, 0),
  }), [scoped]);

  // 달력/차트용 일자 데이터
  const dayDataRecord: Record<string, MonthDayData> = useMemo(() => {
    const record: Record<string, MonthDayData> = {};
    for (const [date, pos] of byDate) {
      record[date] = {
        count: pos.length,
        qty: pos.reduce((s, o) => s + o.orderQuantity, 0),
        amount: pos.reduce((s, o) => s + o.orderAmount, 0),
      };
    }
    return record;
  }, [byDate]);
  function selectOrderDay(date: string | null, onSelectDate: (date: string | null) => void) {
    setSelectedDay(date);
    setOpenPo(null);
    onSelectDate(date);
  }

  function resetToCurrentMonth(onSelectDate: (date: string | null) => void) {
    const b = monthBounds(todayYmd());
    setFrom(b.start);
    setTo(b.end);
    selectOrderDay(null, onSelectDate);
    setView('month');
  }
  function onShiftMonth(delta: number, onSelectDate: (date: string | null) => void) {
    const b = shiftMonthBounds(from, delta);
    setFrom(b.start);
    setTo(b.end);
    selectOrderDay(null, onSelectDate);
  }

  function renderOrderExplorer({
    disabled,
    onSelectDate,
    savedDays,
  }: RocketOrderExplorerRenderOptions) {
    const selectDate = (date: string | null) => selectOrderDay(date, onSelectDate);
    // 달력/차트: 실시간 조회(dayDataRecord)로 빈 날짜를 저장 발주(savedDays,
    // rocket_purchase_orders)로 보완한다. 실시간이 있으면 실시간 우선.
    const mergedMonthData: Record<string, MonthDayData> = {
      ...savedDays,
      ...dayDataRecord,
    };
    const mergedRangeDays = calDays.map((day) => {
      const saved = savedDays[day.date];
      return day.count > 0 || !saved ? day : { ...day, ...saved };
    });
    const hasRangeOrders = mergedRangeDays.some((day) => day.count > 0);
    const hasMonthOrders = Object.values(mergedMonthData).some((day) => day.count > 0);
    const chartData: RocketChartPoint[] = mergedRangeDays.map((day) => ({
      date: day.date,
      label: day.date.slice(5).replace('-', '/'),
      count: day.count,
      qty: day.qty,
      amount: day.amount,
    }));

    return (
      <div className={cn('space-y-3', disabled && 'pointer-events-none opacity-60')}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
          <span className="text-xs font-medium text-slate-400">입고예정일</span>
          <input
            type="date"
            aria-label="입고예정일 시작"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              selectDate(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            aria-label="입고예정일 종료"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              selectDate(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => resetToCurrentMonth(onSelectDate)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50"
          >
            이번 달
          </button>
          <select
            aria-label="발주 상태"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              selectDate(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-slate-500">
              발주 <b className="tabular-nums text-slate-900">{formatNumber(scoped.length)}</b>건
            </span>
            <span className="text-slate-500">
              수량 <b className="tabular-nums text-slate-900">{formatNumber(totalQty)}</b>개
            </span>
            <span className="text-slate-500">
              금액 <b className="tabular-nums text-purple-700">{formatKRW(totalAmount)}</b>원
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-400">보기</span>
            {(
              [
                ['month', '월 달력'],
                ['chart', '차트'],
              ] as const
            ).map(([nextView, label]) => (
              <button
                key={nextView}
                type="button"
                onClick={() => {
                  if (nextView === 'month') setView('month');
                  else setView('chart');
                }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium',
                  view === nextView
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">수집·저장된 발주 조회 · 확정 발주로 빈 날짜 보완</span>
        </div>

        {isError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-medium text-amber-800">저장된 발주 목록을 불러오지 못했습니다</p>
            <p className="mt-1 text-xs text-amber-600">
              {error instanceof Error ? error.message : '서버에 저장된 로켓 발주 수집본과 채널 계정을 확인하세요.'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              <RefreshCw size={13} /> 다시 시도
            </button>
          </div>
        ) : null}

        {/* 좌: 월 달력/차트 · 우: 이 페이지 작업 알림 패널 */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            {view === 'month' ? (
              <>
                <RocketMonthCalendar
                  monthAnchor={from}
                  data={mergedMonthData}
                  selected={selectedDay}
                  onSelect={selectDate}
                  onShiftMonth={(delta) => onShiftMonth(delta, onSelectDate)}
                />
                {!hasMonthOrders ? (
                  <p className="px-1 text-xs text-slate-400">
                    이 달엔 해당 발주가 없습니다 · 달력의 이전/다음 버튼으로 다른 달을 확인해보세요.
                  </p>
                ) : null}
              </>
            ) : null}
            {view === 'chart' && hasRangeOrders ? <RocketOrdersChart data={chartData} /> : null}

            {!isLoading && view === 'chart' && !hasRangeOrders ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-400">
                차트로 표시할 발주 데이터가 없습니다.
              </div>
            ) : null}
          </div>
          <RocketOrderActivityPanel events={events} />
        </div>

        <p className="px-1 text-xs text-slate-400">
          날짜를 선택하면 해당 날짜의 발주 목록과 재고 매칭 미리보기만 아래에 표시됩니다.
        </p>
      </div>
    );
  }

  function renderPoRow(po: RocketSavedPoSummary) {
    const poKey = `${po.sourceImportRunId}:${po.poNumber}`;
    const open = openPo === poKey;
    const isNew = po.status === '거래처확인요청';
    return (
      <Fragment key={poKey}>
        <div
          className={cn(
            'grid cursor-pointer grid-cols-[110px_minmax(0,1fr)_88px_120px_130px] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm hover:bg-slate-50',
            open && 'bg-purple-50/50',
          )}
          onClick={() => setOpenPo(open ? null : poKey)}
        >
          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
            {open ? (
              <ChevronDown size={13} className="flex-none text-purple-500" />
            ) : (
              <ChevronRight size={13} className="flex-none text-slate-400" />
            )}
            {po.poNumber}
          </div>
          <div className="min-w-0">
            <div className="truncate text-slate-800">
              {po.firstProductName || '—'}
              {po.skuCount > 1 && <span className="text-slate-400"> 외 {po.skuCount - 1}종</span>}
            </div>
            <div className="text-[11px] text-slate-400">
              {po.centerName}
              {po.inboundType && ` · ${po.inboundType}`}
              {po.orderedAt && ` · 발주 ${po.orderedAt}`}
            </div>
          </div>
          <div className="text-right tabular-nums text-slate-600">{formatNumber(po.orderQuantity)}개</div>
          <div className="text-right font-semibold tabular-nums text-slate-800">{formatKRW(po.orderAmount)}원</div>
          <div className="text-center">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium',
                isNew ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
              )}
            >
              {po.status}
            </span>
          </div>
        </div>
        {open && (
          <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-3 pl-9">
            <div className="text-[11px] text-slate-400">
              품목 {formatNumber(po.skuCount)}종 · 아래 납품 판단에서 Sellpia 구성 수량을 검토합니다.
            </div>
            <button
              type="button"
              onClick={() => setSelectedSavedSourceImportRunId(po.sourceImportRunId)}
              className="mt-2 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50"
            >
              저장 수집본으로 미리보기
            </button>
          </div>
        )}
      </Fragment>
    );
  }

  function renderSelectedOrderList() {
    if (!selectedDay) return null;
    const dayPos = byDate.get(selectedDay) ?? [];
    if (!dayPos.length) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-slate-600">{selectedDay} 발주 목록이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">
            저장된 발주만 있는 날짜라면 위 재고 매칭 미리보기에서 내용을 확인할 수 있습니다.
          </p>
        </div>
      );
    }

    const dow = dowOf(selectedDay);
    const dayQty = dayPos.reduce((sum, order) => sum + order.orderQuantity, 0);
    const dayAmount = dayPos.reduce((sum, order) => sum + order.orderAmount, 0);
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn(dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-700')}>
              {selectedDay} ({WEEKDAYS[dow]})
            </span>
            <span className="text-[11px] font-normal text-slate-400">입고예정 · 선택일 발주</span>
          </div>
          <div className="text-xs text-slate-500">
            {dayPos.length}건 · {formatNumber(dayQty)}개 ·{' '}
            <b className="text-purple-600">{formatKRW(dayAmount)}</b>원
          </div>
        </div>
        <div data-testid="rocket-po-table-scroll" className="overflow-x-auto">
          <div className="min-w-[760px]">
            {dayPos.map(renderPoRow)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Rocket size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">쿠팡 로켓 발주</h1>
            <div className="text-sm text-slate-500">수집·저장된 발주 조회 · 입고예정일별 분류</div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> 저장 발주 새로고침
        </button>
      </div>

      {/* 워크플로 단계 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <Icon size={15} />
                </span>
                <span className="text-[11px] font-medium text-slate-400">STEP {i + 1}</span>
              </div>
              <div className="mt-1.5 text-sm font-semibold text-slate-900">{s.label}</div>
              <div className="text-[11px] text-slate-400">{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* 재고 매칭 미리보기 (product-centered) */}
      <RocketPurchasePreviewSection
        from={from}
        to={to}
        savedSourceImportRunId={selectedSavedSourceImportRunId}
        onAccountChange={handleRocketAccountChange}
        onCatalogSaved={() => void refetch()}
        onActivity={recordActivity}
      />

      {decisionWorkspace({
        activeMonth: (from || todayYmd()).slice(0, 7),
        onOrdersChanged: () => void refetch(),
        renderOrderExplorer,
      })}

      {/* 날짜를 선택한 경우에만 해당 날짜의 발주 목록을 표시한다. */}
      {selectedDay && renderSelectedOrderList()}

      {/* 기존 생성 파일 이력 (목록 · 재다운로드 · 삭제) */}
      <RocketConfirmFileList refreshKey={0} />
    </div>
  );
}
