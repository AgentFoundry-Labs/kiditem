'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search, Sparkles } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { CoupangShipmentDateSummaryItem } from '../lib/coupang-shipment-extension';

interface ShipmentDateCalendarProps {
  summary: CoupangShipmentDateSummaryItem[];
  selectedDate: string;
  onSelect: (date: string) => void;
  loading: boolean;
  loaded: boolean;
  onQuery: () => void;
  onCollect: () => void;
  collecting: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 현재 달을 YYYY-MM 으로. (클라이언트 컴포넌트라 브라우저 로컬 기준) */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** YYYY-MM 키를 delta 개월만큼 이동한 YYYY-MM 을 반환. */
function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
}

export function ShipmentDateCalendar({
  summary,
  selectedDate,
  onSelect,
  loading,
  loaded,
  onQuery,
  onCollect,
  collecting,
}: ShipmentDateCalendarProps) {
  const byDate = useMemo(() => {
    const map = new Map<string, CoupangShipmentDateSummaryItem>();
    for (const item of summary) map.set(item.date, item);
    return map;
  }, [summary]);

  const monthsWithData = useMemo(
    () => [...new Set(summary.map((item) => monthKey(item.date)))].sort(),
    [summary],
  );
  const minMonth = monthsWithData[0];
  const maxMonth = monthsWithData[monthsWithData.length - 1];

  // 기본적으로 이번 달 달력을 항상 그린다(데이터 유무와 무관).
  const [thisMonth] = useState(currentMonthKey);
  const [viewMonth, setViewMonth] = useState(thisMonth);

  // 요약이 로드되면 가장 최근 데이터가 있는 달로 이동(사용자가 아직 이동 전이거나 범위 밖이면).
  useEffect(() => {
    if (!maxMonth) return;
    setViewMonth((current) => (current && current >= (minMonth ?? '') && current <= maxMonth ? current : maxMonth));
  }, [minMonth, maxMonth]);

  const totalCount = summary.reduce((sum, item) => sum + item.count, 0);
  const totalBoxes = summary.reduce((sum, item) => sum + item.boxes, 0);
  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  const hasSummary = summary.length > 0;

  const cells = useMemo(() => {
    if (!viewMonth) return [] as Array<{ day: number; date: string } | null>;
    const [year, month] = viewMonth.split('-').map(Number);
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const list: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push({ day, date: `${year}-${pad(month)}-${pad(day)}` });
    }
    return list;
  }, [viewMonth]);

  // 데이터가 없어도 최대 1년 전까지 자유롭게 넘겨볼 수 있게(달력이 기본으로 살아있도록).
  const lowerBound = useMemo(() => {
    const floor = shiftMonthKey(thisMonth, -11);
    return minMonth && minMonth < floor ? minMonth : floor;
  }, [minMonth, thisMonth]);
  const upperBound = useMemo(
    () => (maxMonth && maxMonth > thisMonth ? maxMonth : thisMonth),
    [maxMonth, thisMonth],
  );
  const canPrev = Boolean(viewMonth && viewMonth > lowerBound);
  const canNext = Boolean(viewMonth && viewMonth < upperBound);

  const shiftMonth = (delta: number) => {
    setViewMonth((current) => (current ? shiftMonthKey(current, delta) : currentMonthKey()));
  };

  const monthLabel = viewMonth
    ? `${viewMonth.split('-')[0]}년 ${Number(viewMonth.split('-')[1])}월`
    : '';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-purple-600" />
          <span className="text-sm font-semibold text-slate-900">발송일 조회</span>
          {hasSummary ? (
            <span className="text-xs text-slate-400">
              총 {formatNumber(totalCount)}건 · {formatNumber(totalBoxes)}박스
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onQuery}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {loaded || hasSummary ? '다시 조회' : '발송일 조회'}
        </button>
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={!canPrev}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
            aria-label="이전 달"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-semibold tabular-nums text-slate-900">{monthLabel}</div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={!canNext}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
            aria-label="다음 달"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((weekday, index) => (
            <div
              key={weekday}
              className={cn(
                'py-1 text-center text-xs font-medium',
                index === 0 ? 'text-rose-400' : index === 6 ? 'text-blue-400' : 'text-slate-400',
              )}
            >
              {weekday}
            </div>
          ))}
          {cells.map((cell, index) => {
            if (!cell) return <div key={`blank-${index}`} />;
            const item = byDate.get(cell.date);
            const isSelected = cell.date === selectedDate;
            const hasData = Boolean(item);
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => hasData && onSelect(cell.date)}
                disabled={!hasData}
                className={cn(
                  'flex min-h-[5.75rem] flex-col items-center justify-start gap-1.5 rounded-lg border px-1 py-2.5 text-center transition-colors',
                  isSelected
                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-300'
                    : hasData
                      ? 'cursor-pointer border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/50'
                      : 'border-slate-100 bg-slate-50/40',
                )}
              >
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    isSelected ? 'font-bold text-purple-700' : hasData ? 'font-semibold text-slate-700' : 'text-slate-400',
                  )}
                >
                  {cell.day}
                </span>
                {item ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                      isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700',
                    )}
                  >
                    {formatNumber(item.count)}건
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {selectedDate ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-slate-600">선택 발송일</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{selectedDate}</span>
              <span className="text-sm font-semibold tabular-nums text-purple-700">
                {selected ? `· ${formatNumber(selected.count)}건 · ${formatNumber(selected.boxes)}박스` : '· 데이터 없음'}
              </span>
            </div>
            <button
              type="button"
              onClick={onCollect}
              disabled={collecting || !selected}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {collecting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              수집·병합
            </button>
          </div>
        ) : !hasSummary ? (
          <p className="mt-4 text-center text-xs text-slate-400">
            {loading
              ? '쿠팡 쉽먼트를 조회하는 중…'
              : loaded
                ? '최근 쉽먼트가 없습니다. 다시 조회해 보세요.'
                : '‘발송일 조회’를 누르면 날짜별 건수가 달력에 채워집니다.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
