'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import type { RocketSavedPoSummary } from '@kiditem/shared/rocket-purchase-preview';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { RocketAccountBootstrap } from './RocketAccountBootstrap';
import { listSavedRocketPos } from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import { RocketConfirmFileList } from './RocketConfirmFileList';
import { RocketOrderActivityPanel } from './RocketOrderActivityPanel';
import { RocketMonthCalendar, type MonthDayData } from './RocketMonthCalendar';
import { useRocketOrderActivity } from '../hooks/useRocketOrderActivity';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
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
  onSelectDate: (date: string | null, sourceRunCount: number) => void;
}

export interface RocketDecisionWorkspaceContext {
  activeMonth: string;
  channelAccountId: string;
  channelAccountName: string;
  hasConfiguredVendorId: boolean;
  from: string;
  to: string;
  selectedSourceImportRunId: string | null;
  onActivity: (activity: RocketOrderActivityInput) => void;
  onOrdersChanged: () => void;
  renderOrderExplorer: (options: RocketOrderExplorerRenderOptions) => ReactNode;
}


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
  // 로켓 채널 계정: '발주 미리보기' 카드는 제거했지만, 달력·발주목록·차트가 쓰는 계정 선택은
  // RocketAccountBootstrap 이 활성 로켓 계정으로 백그라운드에서 유지한다.
  const [selectedRocketAccountId, setSelectedRocketAccountId] = useState('');
  const [selectedRocketAccountName, setSelectedRocketAccountName] = useState('');
  const [hasConfiguredVendorId, setHasConfiguredVendorId] = useState(false);
  const [selectedSourceImportRunId, setSelectedSourceImportRunId] = useState<string | null>(null);
  const { events, record: recordActivity } = useRocketOrderActivity();

  const handleRocketAccountChange = useCallback((account: {
    id: string;
    name: string;
    vendorId: string | null;
  } | null) => {
    setSelectedRocketAccountId(account?.id ?? '');
    setSelectedRocketAccountName(account?.name ?? '');
    setHasConfiguredVendorId(Boolean(account?.vendorId?.trim()));
    setSelectedSourceImportRunId(null);
    setSelectedDay(null);
    setOpenPo(null);
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
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
  function selectOrderDay(
    date: string | null,
    onSelectDate: (date: string | null, sourceRunCount: number) => void,
  ) {
    setSelectedDay(date);
    setOpenPo(null);
    const sourceRuns = new Set(
      date ? (byDate.get(date) ?? []).map(({ sourceImportRunId }) => sourceImportRunId) : [],
    );
    if (!date) {
      setSelectedSourceImportRunId(null);
    } else {
      setSelectedSourceImportRunId(sourceRuns.size === 1 ? [...sourceRuns][0]! : null);
    }
    onSelectDate(date, sourceRuns.size);
  }

  function resetToCurrentMonth(onSelectDate: (date: string | null, sourceRunCount: number) => void) {
    const b = monthBounds(todayYmd());
    setFrom(b.start);
    setTo(b.end);
    selectOrderDay(null, onSelectDate);
    setView('month');
  }
  function onShiftMonth(
    delta: number,
    onSelectDate: (date: string | null, sourceRunCount: number) => void,
  ) {
    const b = shiftMonthBounds(from, delta);
    setFrom(b.start);
    setTo(b.end);
    selectOrderDay(null, onSelectDate);
  }

  function renderOrderExplorer({
    disabled,
    onSelectDate,
  }: RocketOrderExplorerRenderOptions) {
    const selectDate = (date: string | null) => selectOrderDay(date, onSelectDate);
    // 달력/차트는 계정 범위 catalog snapshot 요약을 기준으로 렌더한다.
    const mergedMonthData: Record<string, MonthDayData> = dayDataRecord;
    const mergedRangeDays = calDays;
    // 상단 요약(발주 건수·수량·금액)은 달력과 같은 catalog snapshot 소스로 계산한다.
    // 날짜를 고르면 그날만, 아니면 조회 범위 전체를 합산한다.
    const summaryDays = selectedDay
      ? mergedRangeDays.filter((day) => day.date === selectedDay)
      : mergedRangeDays;
    const summaryCount = summaryDays.reduce((sum, day) => sum + day.count, 0);
    const summaryQty = summaryDays.reduce((sum, day) => sum + day.qty, 0);
    const summaryAmount = summaryDays.reduce((sum, day) => sum + day.amount, 0);
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
          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
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
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {selectedDay ? (
              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-600">
                {selectedDay.slice(5).replace('-', '/')} 선택
              </span>
            ) : null}
            <span className="text-slate-500">
              발주 <b className="tabular-nums text-slate-900">{formatNumber(summaryCount)}</b>건
            </span>
            <span className="text-slate-500">
              수량 <b className="tabular-nums text-slate-900">{formatNumber(summaryQty)}</b>개
            </span>
            <span className="text-slate-500">
              금액 <b className="tabular-nums text-purple-700">{formatKRW(summaryAmount)}</b>원
            </span>
          </div>
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

        {/* 좌: 월 달력/차트(3/4) · 우: 작업 알림 패널(1/4 — 상단 '송장 출력' 카드 폭에 맞춤) */}
        <div className="grid items-start gap-4 xl:grid-cols-4">
          <div className="space-y-3 xl:col-span-3">
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
          날짜를 선택하면 해당 날짜의 발주 목록이 아래에 표시됩니다.
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>
                품목 {formatNumber(po.skuCount)}종 · 수집 {po.collectedAt.slice(0, 19).replace('T', ' ')}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedSourceImportRunId(po.sourceImportRunId);
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-semibold',
                  selectedSourceImportRunId === po.sourceImportRunId
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {selectedSourceImportRunId === po.sourceImportRunId
                  ? '선택된 수집본'
                  : '이 수집본으로 납품 판단'}
              </button>
            </div>
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
            저장된 발주만 있는 날짜라면 아래 납품 판단에서 내용을 확인할 수 있습니다.
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
      </div>

      {/* 활성 로켓 계정 백그라운드 선택 (계정은 달력·발주목록·차트의 데이터 기준) */}
      <RocketAccountBootstrap onAccountChange={handleRocketAccountChange} />

      {decisionWorkspace({
        activeMonth: (from || todayYmd()).slice(0, 7),
        channelAccountId: selectedRocketAccountId,
        channelAccountName: selectedRocketAccountName,
        hasConfiguredVendorId,
        from,
        to,
        selectedSourceImportRunId,
        onActivity: recordActivity,
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
