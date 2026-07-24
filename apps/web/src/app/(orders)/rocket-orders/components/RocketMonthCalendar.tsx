'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

export interface MonthDayData {
  count: number;
  qty: number;
  amount: number;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function RocketMonthCalendar({
  monthAnchor,
  data,
  selected,
  onSelect,
  onShiftMonth,
}: {
  monthAnchor: string;
  data: Record<string, MonthDayData>;
  selected: string | null;
  onSelect: (d: string | null) => void;
  onShiftMonth: (delta: number) => void;
}) {
  const anchor = new Date((monthAnchor || '') + 'T00:00:00');
  const year = anchor.getFullYear();
  const month = anchor.getMonth(); // 0-based
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => onShiftMonth(-1)}
          aria-label="이전 달"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-slate-900">
          {year}.{pad(month + 1)}
        </span>
        <button
          type="button"
          onClick={() => onShiftMonth(1)}
          aria-label="다음 달"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WD.map((w, i) => (
          <div
            key={w}
            className={cn(
              'py-1 text-center text-sm font-medium',
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400',
            )}
          >
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const dd = data[date];
          const has = !!dd && dd.count > 0;
          const active = selected === date;
          const future = date > today;
          const isToday = date === today;
          const dow = i % 7;
          return (
            <button
              key={date}
              type="button"
              onClick={() => has && onSelect(active ? null : date)}
              disabled={!has}
              aria-label={`${date} 발주 ${dd?.count ?? 0}건`}
              className={cn(
                'flex min-h-[104px] flex-col items-start rounded-lg border p-2.5 text-left transition',
                future
                  ? active
                    ? 'cursor-pointer border-purple-500 bg-purple-100 ring-1 ring-purple-300'
                    : has
                      ? 'cursor-pointer border-purple-200 bg-purple-50 hover:bg-purple-100/70'
                      : 'border-slate-100 bg-slate-50/30'
                  : isToday
                    ? active
                      ? 'cursor-pointer border-purple-500 bg-purple-100 ring-1 ring-purple-300'
                      : has
                        ? 'cursor-pointer border-purple-300 bg-purple-50 ring-1 ring-inset ring-purple-200 hover:bg-purple-100/70'
                        : 'border-purple-200 bg-purple-50/70 ring-1 ring-inset ring-purple-200'
                    : active
                      ? 'cursor-pointer border-purple-500 bg-white ring-1 ring-purple-300'
                      : has
                        ? 'cursor-pointer border-slate-100 bg-white hover:border-purple-200'
                        : 'border-slate-100 bg-white',
              )}
            >
              <span
                className={cn(
                  'flex items-center gap-1 text-base font-medium',
                  dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-slate-500',
                )}
              >
                {isToday ? (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-purple-600 px-1.5 text-sm font-bold text-white">
                    {Number(date.slice(8))}
                  </span>
                ) : (
                  Number(date.slice(8))
                )}
                {isToday && <span className="text-xs font-bold text-purple-600">오늘</span>}
              </span>
              {has && (
                <span className="mt-auto w-full">
                  <span className="block text-base font-bold tabular-nums text-slate-800">{dd.count}건</span>
                  <span className="block truncate text-xs tabular-nums text-slate-500">{formatNumber(dd.qty)}개</span>
                  <span className="block truncate text-xs tabular-nums text-purple-600">{formatKRW(dd.amount)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
