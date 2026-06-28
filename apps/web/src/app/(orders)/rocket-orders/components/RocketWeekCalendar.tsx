'use client';

import { cn, formatKRW, formatNumber } from '@/lib/utils';

export interface RocketCalDay {
  date: string; // YYYY-MM-DD
  weekday: string; // 월~일
  dow: number; // 0=일 .. 6=토
  count: number;
  qty: number;
  amount: number;
}

export function RocketWeekCalendar({
  days,
  selected,
  onSelect,
}: {
  days: RocketCalDay[];
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  if (!days.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}
      >
        {days.map((d) => {
          const active = selected === d.date;
          const has = d.count > 0;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(active ? null : d.date)}
              disabled={!has}
              className={cn(
                'flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition',
                active
                  ? 'border-purple-500 bg-purple-100 ring-1 ring-purple-300'
                  : has
                    ? 'cursor-pointer border-purple-200 bg-purple-50 hover:bg-purple-100/70'
                    : 'cursor-default border-slate-200 bg-white opacity-50',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    d.dow === 0 ? 'text-red-500' : d.dow === 6 ? 'text-blue-500' : 'text-slate-400',
                  )}
                >
                  {d.weekday}
                </span>
                <span className="text-xs tabular-nums text-slate-400">
                  {d.date.slice(5).replace('-', '/')}
                </span>
              </div>
              {has ? (
                <>
                  <span className="mt-1 text-lg font-bold tabular-nums text-slate-900">{d.count}건</span>
                  <span className="text-xs tabular-nums text-slate-500">{formatNumber(d.qty)}개</span>
                  <span className="text-xs tabular-nums text-purple-600">{formatKRW(d.amount)}</span>
                </>
              ) : (
                <span className="mt-1 text-lg text-slate-300">—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
