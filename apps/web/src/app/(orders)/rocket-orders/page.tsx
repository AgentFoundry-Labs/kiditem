'use client';

import { Fragment, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
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
import { RocketConfirmFileList } from './components/RocketConfirmFileList';
import { RocketWeekCalendar, type RocketCalDay } from './components/RocketWeekCalendar';
import { RocketMonthCalendar, type MonthDayData } from './components/RocketMonthCalendar';
import { listRocketPosFromExtension, type RocketPoSummary } from './lib/rocket-confirm-api';
import type { RocketChartPoint } from './components/RocketOrdersChart';

const RocketOrdersChart = dynamic(
  () => import('./components/RocketOrdersChart').then((mod) => mod.RocketOrdersChart),
  {
    ssr: false,
    loading: () => <PageSkeleton variant="cards" />,
  },
);

const STATUS_OPTIONS = [
  { value: '거래처확인요청', label: '신규 주문 (거래확인서요청)' },
  { value: '', label: '전체 상태' },
  { value: '발주확정', label: '발주확정' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EMPTY_ROCKET_POS: RocketPoSummary[] = [];

// 워크플로 단계 (로켓 물류 발주)
const STAGES = [
  { icon: Rocket, label: '신규 주문', desc: '거래확인서요청 발주' },
  { icon: PackageCheck, label: '납품 판단 대기', desc: '재고 매핑 기반 판단은 추후 연동' },
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
function plusDaysYmd(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
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

export default function RocketOrdersPage() {
  // 입고예정일 기준 (기본: 다음 7일) — 신규주문(거래처확인요청)을 실시간 조회
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(plusDaysYmd(6));
  const [status, setStatus] = useState('거래처확인요청');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [view, setView] = useState<'week' | 'month' | 'chart'>('week');
  const [openPo, setOpenPo] = useState<number | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.orders.rocketPoList({ from, to, status }),
    queryFn: () => listRocketPosFromExtension(from, to, status),
    meta: { suppressGlobalErrorToast: true },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const orders = data ?? EMPTY_ROCKET_POS;

  // 입고예정일별 그룹
  const byDate = useMemo(() => {
    const next = new Map<string, RocketPoSummary[]>();
    for (const order of orders) {
      const key = order.eta || '미정';
      const arr = next.get(key);
      if (arr) arr.push(order);
      else next.set(key, [order]);
    }
    return next;
  }, [orders]);
  const calDays: RocketCalDay[] = useMemo(() => datesInRange(from, to).map((date) => {
    const pos = byDate.get(date) ?? [];
    const dow = dowOf(date);
    return {
      date,
      weekday: WEEKDAYS[dow],
      dow,
      count: pos.length,
      qty: pos.reduce((s, o) => s + o.orderQty, 0),
      amount: pos.reduce((s, o) => s + o.orderAmount, 0),
    };
  }), [byDate, from, to]);
  const datesWithOrders = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const visibleDates = useMemo(
    () => (selectedDay ? [selectedDay] : datesWithOrders),
    [datesWithOrders, selectedDay],
  );

  const scoped = useMemo(
    () => (selectedDay ? byDate.get(selectedDay) ?? [] : orders),
    [byDate, orders, selectedDay],
  );
  const { totalAmount, totalQty } = useMemo(() => ({
    totalAmount: scoped.reduce((s, o) => s + o.orderAmount, 0),
    totalQty: scoped.reduce((s, o) => s + o.orderQty, 0),
  }), [scoped]);

  // 달력/차트용 일자 데이터
  const dayDataRecord: Record<string, MonthDayData> = useMemo(() => {
    const record: Record<string, MonthDayData> = {};
    for (const [date, pos] of byDate) {
      record[date] = {
        count: pos.length,
        qty: pos.reduce((s, o) => s + o.orderQty, 0),
        amount: pos.reduce((s, o) => s + o.orderAmount, 0),
      };
    }
    return record;
  }, [byDate]);
  const chartData: RocketChartPoint[] = useMemo(() => calDays.map((d) => ({
    date: d.date,
    label: d.date.slice(5).replace('-', '/'),
    count: d.count,
    qty: d.qty,
    amount: d.amount,
  })), [calDays]);

  function gotoWeek() {
    setView('week');
    setFrom(todayYmd());
    setTo(plusDaysYmd(6));
    setSelectedDay(null);
  }
  function gotoMonth() {
    // 데이터가 있으면 가장 이른 입고예정일의 달로, 없으면 현재 from 의 달로.
    const firstDate = datesWithOrders.find((d) => d !== '미정');
    const b = monthBounds(firstDate || from || todayYmd());
    setFrom(b.start);
    setTo(b.end);
    setSelectedDay(null);
    setView('month');
  }
  function onShiftMonth(delta: number) {
    const b = shiftMonthBounds(from, delta);
    setFrom(b.start);
    setTo(b.end);
    setSelectedDay(null);
  }

  function renderPoRow(po: RocketPoSummary) {
    const open = openPo === po.poSeq;
    const isNew = po.status === '거래처확인요청';
    return (
      <Fragment key={po.poSeq}>
        <div
          className={cn(
            'grid cursor-pointer grid-cols-[110px_minmax(0,1fr)_88px_120px_130px] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm hover:bg-slate-50',
            open && 'bg-purple-50/50',
          )}
          onClick={() => setOpenPo(open ? null : po.poSeq)}
        >
          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
            {open ? (
              <ChevronDown size={13} className="flex-none text-purple-500" />
            ) : (
              <ChevronRight size={13} className="flex-none text-slate-400" />
            )}
            {po.poSeq}
          </div>
          <div className="min-w-0">
            <div className="truncate text-slate-800">
              {po.firstSkuName || '—'}
              {po.skuCount > 1 && <span className="text-slate-400"> 외 {po.skuCount - 1}종</span>}
            </div>
            <div className="text-[11px] text-slate-400">
              {po.centerName}
              {po.inboundType && ` · ${po.inboundType}`}
              {po.orderedAt && ` · 발주 ${po.orderedAt}`}
            </div>
          </div>
          <div className="text-right tabular-nums text-slate-600">{formatNumber(po.orderQty)}개</div>
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
              품목 {formatNumber(po.skuCount)}종 · 납품 가능 수량 판단은 추후 연동합니다.
            </div>
          </div>
        )}
      </Fragment>
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
            <div className="text-sm text-slate-500">신규 주문(거래처확인요청) 실시간 조회 · 입고예정일별 분류</div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> 불러오기
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

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        현재는 주문수집 확장에서 가져온 로켓 PO 목록과 기존 생성 파일 이력만 조회합니다.
        납품 수량 판단은 추후 연동합니다.
      </div>

      {/* 필터 (입고예정일 기준) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-slate-400">입고예정일</span>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setSelectedDay(null);
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <span className="text-slate-400">~</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setSelectedDay(null);
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setFrom(todayYmd());
            setTo(plusDaysYmd(6));
            setSelectedDay(null);
          }}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50"
        >
          다음 7일
        </button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-slate-500">발주 <b className="tabular-nums text-slate-900">{formatNumber(scoped.length)}</b>건</span>
          <span className="text-slate-500">수량 <b className="tabular-nums text-slate-900">{formatNumber(totalQty)}</b>개</span>
          <span className="text-slate-500">금액 <b className="tabular-nums text-purple-700">{formatKRW(totalAmount)}</b>원</span>
        </div>
      </div>

      {isLoading && <PageSkeleton variant="table" />}

      {isError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-800">발주 목록을 불러오지 못했습니다</p>
          <p className="mt-1 text-xs text-amber-600">
            {error instanceof Error ? error.message : '주문수집 확장 + supplier.coupang.com 로그인을 확인하세요.'}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            <RefreshCw size={13} /> 다시 시도
          </button>
        </div>
      )}

      {data && !isError && orders.length === 0 && view !== 'month' && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          <Rocket size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">해당 조건의 신규 발주가 없습니다</p>
          <p className="mt-1 text-xs text-slate-400">입고예정일 범위를 바꾸거나 상태를 전체로 바꿔보세요.</p>
        </div>
      )}

      {/* 보기 토글 (주 달력 / 월 달력 / 차트) + 시각화 */}
      {data && !isError && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-400">보기</span>
            {(
              [
                ['week', '주 달력'],
                ['month', '월 달력'],
                ['chart', '차트'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => (v === 'week' ? gotoWeek() : v === 'month' ? gotoMonth() : setView('chart'))}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium',
                  view === v
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'week' && orders.length > 0 && (
            <RocketWeekCalendar days={calDays} selected={selectedDay} onSelect={setSelectedDay} />
          )}
          {view === 'month' && (
            <>
              <RocketMonthCalendar
                monthAnchor={from}
                data={dayDataRecord}
                selected={selectedDay}
                onSelect={setSelectedDay}
                onShiftMonth={onShiftMonth}
              />
              {data && !isError && orders.length === 0 && (
                <p className="px-1 pt-0.5 text-xs text-slate-400">
                  이 달엔 해당 발주가 없습니다 · 위 <b>‹ ›</b> 로 다른 달을 보거나 상태/기간을 바꿔보세요.
                </p>
              )}
            </>
          )}
          {view === 'chart' && orders.length > 0 && <RocketOrdersChart data={chartData} />}
        </div>
      )}

      {/* 발주 리스트 (입고예정일별 그룹) */}
      {orders.length > 0 &&
        visibleDates.map((date) => {
          const dayPos = byDate.get(date) ?? [];
          if (!dayPos.length) return null;
          const dow = date === '미정' ? -1 : dowOf(date);
          const dQty = dayPos.reduce((s, o) => s + o.orderQty, 0);
          const dAmt = dayPos.reduce((s, o) => s + o.orderAmount, 0);
          return (
            <div key={date} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className={cn(
                      dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-700',
                    )}
                  >
                    {date === '미정' ? '입고예정일 미정' : `${date} (${WEEKDAYS[dow]})`}
                  </span>
                  <span className="text-[11px] font-normal text-slate-400">입고예정</span>
                </div>
                <div className="text-xs text-slate-500">
                  {dayPos.length}건 · {formatNumber(dQty)}개 ·{' '}
                  <b className="text-purple-600">{formatKRW(dAmt)}</b>원
                </div>
              </div>
              {dayPos.map(renderPoRow)}
            </div>
          );
        })}

      {/* 기존 생성 파일 이력 (목록 · 재다운로드 · 삭제) */}
      <RocketConfirmFileList refreshKey={0} />
    </div>
  );
}
