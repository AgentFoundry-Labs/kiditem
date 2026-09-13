'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { useRocketPoSource } from '@/hooks/use-rocket-po-source';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { listSavedRocketPos } from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import { useRocketOrderActivity } from '../hooks/useRocketOrderActivity';
import { useRocketOrdersViewState } from '../hooks/useRocketOrdersViewState';
import { sumRocketOrderAmounts } from '../lib/rocket-order-amount';
import { RocketAccountBootstrap } from './RocketAccountBootstrap';
import { RocketOrderActivityPanel } from './RocketOrderActivityPanel';
import { RocketMonthCalendar, type MonthDayData } from './RocketMonthCalendar';
import type { RocketSavedPoSummary } from '@kiditem/shared/rocket-purchase-preview';
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
  { value: '거래처확인요청', label: '거래처확인요청' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EMPTY_ROCKET_POS: RocketSavedPoSummary[] = [];

interface RocketCalDay {
  date: string;
  count: number;
  qty: number;
  amount: number | null;
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
  // 선택 날짜와 그 날짜의 수집본 수는 워크스페이스가 소유한다. 패널이 클릭 콜백으로만 알던 시절에는
  // URL 복원(새로고침·링크 공유)에서 값이 비어 안내 배너가 통째로 사라졌다.
  selectedDate: string | null;
  selectedDateSourceRunCount: number;
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
  const [viewState, setViewState, viewStateReady] = useRocketOrdersViewState();
  const {
    account: selectedRocketAccountId,
    from,
    to,
    status,
    view,
  } = viewState;
  const selectedDay = viewState.date || null;
  // 발주 행 키는 `${sourceImportRunId}:${poNumber}` 문자열이다.
  // 로켓 채널 계정: '발주 미리보기' 카드는 제거했지만, 달력·발주목록·차트가 쓰는 계정 선택은
  // RocketAccountBootstrap 이 익스텐션에서 확보한 내부 로켓 식별자를 유지한다.
  const [selectedRocketAccountName, setSelectedRocketAccountName] = useState('');
  const [hasConfiguredVendorId, setHasConfiguredVendorId] = useState(false);
  const rocketSource = useRocketPoSource(selectedRocketAccountId, viewStateReady);
  const selectedSourceImportRunId = rocketSource.data?.latestComplete?.attemptId ?? null;
  const { events, record: recordActivity } = useRocketOrderActivity();

  const handleRocketAccountChange = useCallback((account: {
    id: string;
    name: string;
    vendorId: string | null;
  } | null) => {
    const nextAccountId = account?.id ?? '';
    setViewState((current) => current.account === nextAccountId
      ? current
      : {
          ...current,
          account: nextAccountId,
          date: current.account ? '' : current.date,
        });
    setSelectedRocketAccountName(account?.name ?? '');
    setHasConfiguredVendorId(Boolean(account?.vendorId?.trim()));
  }, [setViewState]);

  const handleRocketAccountSelection = useCallback((accountId: string) => {
    setViewState((current) => current.account === accountId
      ? current
      : { ...current, account: accountId, date: current.account ? '' : current.date });
  }, [setViewState]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.orders.rocketSavedPoList({
      channelAccountId: selectedRocketAccountId,
      from,
      to,
      status,
    }), selectedSourceImportRunId],
    queryFn: () => listSavedRocketPos({
      channelAccountId: selectedRocketAccountId,
      from,
      to,
      status: status || undefined,
    }),
    enabled: viewStateReady && selectedRocketAccountId.length > 0 && Boolean(selectedSourceImportRunId),
    meta: { suppressGlobalErrorToast: true },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const orders = data ?? EMPTY_ROCKET_POS;
  const latestSourceImportRunId = selectedSourceImportRunId;

  // 과거 원본이 정리되기 전에도 운영 화면은 최신 정상 수집본 하나만 사용한다.
  const latestOrders = useMemo(
    () => latestSourceImportRunId
      ? orders.filter(({ sourceImportRunId }) => sourceImportRunId === latestSourceImportRunId)
      : EMPTY_ROCKET_POS,
    [latestSourceImportRunId, orders],
  );

  // 입고예정일별 그룹
  const byDate = useMemo(() => {
    const next = new Map<string, RocketSavedPoSummary[]>();
    for (const order of latestOrders) {
      const key = order.plannedDeliveryDate || '미정';
      const arr = next.get(key);
      if (arr) arr.push(order);
      else next.set(key, [order]);
    }
    return next;
  }, [latestOrders]);
  const calDays: RocketCalDay[] = useMemo(() => datesInRange(from, to).map((date) => {
    const pos = byDate.get(date) ?? [];
    return {
      date,
      count: pos.length,
      qty: pos.reduce((s, o) => s + o.orderQuantity, 0),
      amount: sumRocketOrderAmounts(pos.map((o) => o.orderAmount)),
    };
  }), [byDate, from, to]);

  // 달력/차트용 일자 데이터
  const dayDataRecord: Record<string, MonthDayData> = useMemo(() => {
    const record: Record<string, MonthDayData> = {};
    for (const [date, pos] of byDate) {
      record[date] = {
        count: pos.length,
        qty: pos.reduce((s, o) => s + o.orderQuantity, 0),
        amount: sumRocketOrderAmounts(pos.map((o) => o.orderAmount)),
      };
    }
    return record;
  }, [byDate]);

  const selectedDayOrders = useMemo(() => {
    if (!selectedDay) return EMPTY_ROCKET_POS;
    return latestOrders.filter(({ plannedDeliveryDate }) => plannedDeliveryDate === selectedDay);
  }, [latestOrders, selectedDay]);
  const selectedDaySourceRunCount = new Set(
    selectedDayOrders.map(({ sourceImportRunId }) => sourceImportRunId),
  ).size;

  function selectOrderDay(
    date: string | null,
    onSelectDate: (date: string | null, sourceRunCount: number) => void,
  ) {
    setViewState((current) => ({ ...current, date: date ?? '' }));
    const rowsForDate = date
      ? latestOrders.filter(({ plannedDeliveryDate }) => plannedDeliveryDate === date)
      : [];
    const sourceRuns = new Set(rowsForDate.map(({ sourceImportRunId }) => sourceImportRunId));
    onSelectDate(date, sourceRuns.size);
  }

  function resetToCurrentMonth(onSelectDate: (date: string | null, sourceRunCount: number) => void) {
    const b = monthBounds(todayYmd());
    setViewState((current) => ({
      ...current,
      from: b.start,
      to: b.end,
      date: '',
      view: 'month',
    }));
    onSelectDate(null, 0);
  }
  function onShiftMonth(
    delta: number,
    onSelectDate: (date: string | null, sourceRunCount: number) => void,
  ) {
    const b = shiftMonthBounds(from, delta);
    setViewState((current) => ({ ...current, from: b.start, to: b.end, date: '' }));
    onSelectDate(null, 0);
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
    const summaryAmount = sumRocketOrderAmounts(summaryDays.map((day) => day.amount));
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
              setViewState((current) => ({ ...current, from: e.target.value, date: '' }));
              onSelectDate(null, 0);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            aria-label="입고예정일 종료"
            value={to}
            onChange={(e) => {
              setViewState((current) => ({ ...current, to: e.target.value, date: '' }));
              onSelectDate(null, 0);
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
              setViewState((current) => ({ ...current, status: e.target.value, date: '' }));
              onSelectDate(null, 0);
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
                setViewState((current) => ({ ...current, view: nextView }));
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
              {summaryAmount === null ? (
                <>금액 <b className="text-slate-500" title="확정 전 발주 라인이 있어 금액을 알 수 없습니다">미확정</b></>
              ) : (
                <>금액 <b className="tabular-nums text-purple-700">{formatKRW(summaryAmount)}</b>원</>
              )}
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
          날짜를 선택하면 아래 미리보기가 해당 날짜의 발주로 좁혀집니다.
        </p>
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

      {/* 내부 로켓 식별자 자동 연결 (달력·발주목록·차트의 데이터 기준) */}
      <RocketAccountBootstrap
        selectedAccountId={selectedRocketAccountId}
        onSelectedAccountIdChange={handleRocketAccountSelection}
        onAccountChange={handleRocketAccountChange}
      />

      <div role="status" aria-label="로켓 수집 상태" className="text-sm text-slate-500">
        {rocketSource.isError ? '로켓 수집 상태를 불러오지 못했습니다.' : (
          <>
            {rocketSource.data?.ready ? 'COMPLETE 수집본' :
              rocketSource.data?.latestComplete ? '이전 COMPLETE 수집본 · 최신 수집 필요' : '완료된 로켓 수집본 없음'}
            {rocketSource.data?.latestComplete?.actualCutoffAt && (
              <span> · 실제 수집 기준 <time dateTime={rocketSource.data.latestComplete.actualCutoffAt}>{rocketSource.data.latestComplete.actualCutoffAt}</time></span>
            )}
            {rocketSource.data?.latestAttempt?.state === 'RUNNING' && <span> · 수집 진행 중</span>}
            {rocketSource.data?.latestAttempt?.state === 'FAILED' && (
              <span className="text-amber-700"> · 수집 실패: {rocketSource.data.latestAttempt.errorMessage ?? rocketSource.data.latestAttempt.errorCode ?? '다시 수집해주세요.'}</span>
            )}
          </>
        )}
      </div>

      {decisionWorkspace({
        activeMonth: (from || todayYmd()).slice(0, 7),
        channelAccountId: selectedRocketAccountId,
        channelAccountName: selectedRocketAccountName,
        hasConfiguredVendorId,
        from,
        to,
        selectedSourceImportRunId,
        selectedDate: selectedDay || null,
        selectedDateSourceRunCount: selectedDaySourceRunCount,
        onActivity: recordActivity,
        onOrdersChanged: () => { void refetch(); void rocketSource.refetch(); },
        renderOrderExplorer,
      })}

    </div>
  );
}
