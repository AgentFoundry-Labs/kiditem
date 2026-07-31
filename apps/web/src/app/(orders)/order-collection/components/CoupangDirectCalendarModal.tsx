'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { CoupangDirectPo, CoupangTransport } from '../lib/coupang-directship-api';
import {
  buildDirectshipEddCalendar,
  directshipIntakeWindow,
  type DirectshipDayCell,
} from '../lib/coupang-directship-calendar';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function pad(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * 입고예정일 기준 달력. 로켓 발주 달력과 같은 월 그리드를 쓰되, 셀에는
 * "처리해야 할 발주 수"를 앞세운다. 이미 수집한 발주는 지우지 않고 회색으로 내려
 * 남은 건수가 0 이면 그 날짜는 볼 일이 없다는 게 한눈에 보이게 한다.
 */
function EddCalendar({
  monthAnchor,
  cells,
  selected,
  onToggle,
  onShiftMonth,
}: {
  monthAnchor: string;
  cells: Record<string, DirectshipDayCell>;
  selected: ReadonlySet<string>;
  onToggle: (date: string) => void;
  onShiftMonth: (delta: number) => void;
}) {
  const anchor = new Date(`${monthAnchor}T00:00:00`);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid: (string | null)[] = [];
  for (let i = 0; i < startDow; i += 1) grid.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) grid.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (grid.length % 7 !== 0) grid.push(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <button type="button" onClick={() => onShiftMonth(-1)} aria-label="이전 달"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-slate-900">{year}.{pad(month + 1)}</span>
        <button type="button" onClick={() => onShiftMonth(1)} aria-label="다음 달"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WD.map((w, i) => (
          <div key={w} className={cn(
            'py-1 text-center text-xs font-medium',
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400',
          )}>{w}</div>
        ))}
        {grid.map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const cell = cells[date];
          // 전송 여부는 우리가 확인한 사실이 아니라 조작자가 요청한 기록일 뿐이라
          // 화면에서는 빼고, 그 날짜의 발주 총 건수를 그대로 보여준다.
          const total = cell?.poCount ?? 0;
          const actionable = total > 0;
          const active = selected.has(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => actionable && onToggle(date)}
              disabled={!actionable}
              aria-label={`${date} 발주 ${total}건`}
              className={cn(
                'flex min-h-[84px] flex-col items-start rounded-lg border p-2 text-left transition',
                !cell && 'border-slate-100 bg-slate-50/40',
                cell && !actionable && 'border-slate-200 bg-slate-50 text-slate-400',
                actionable && !active && 'border-slate-200 bg-white hover:border-purple-300',
                actionable && !active && (cell?.urgentCount ?? 0) > 0
                  && 'border-red-300 bg-red-50',
                active && 'border-purple-500 bg-purple-50 ring-1 ring-purple-200',
                cell?.inWindow && actionable && !active && 'border-amber-300 bg-amber-50/50',
              )}
            >
              <span className="flex w-full items-center justify-between text-xs font-semibold">
                {Number(date.slice(8))}
                {cell?.urgentCount ? (
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold text-white"
                    style={{ background: '#dc2626' }}>
                    긴급 {cell.urgentCount}
                  </span>
                ) : null}
              </span>
              {cell ? (
                <>
                  <span className={cn(
                    'mt-1 text-sm font-bold tabular-nums',
                    actionable ? 'text-slate-900' : 'text-slate-400',
                  )}>
                    발주 {formatNumber(total)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatNumber(cell.qty)}개
                  </span>
                  <span className="text-[10px] text-slate-400">
                    쉽 {cell.byTransport.SHIPMENT} · 밀 {cell.byTransport.MILKRUN}
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CoupangDirectCalendarModal({
  open,
  loading,
  pos,
  collectedSeqs,
  today,
  onClose,
  onCollect,
}: {
  open: boolean;
  loading: boolean;
  pos: readonly CoupangDirectPo[];
  collectedSeqs: ReadonlySet<string>;
  today: string;
  onClose: () => void;
  onCollect: (eddDates: string[]) => void;
}) {
  const window = useMemo(() => directshipIntakeWindow(today), [today]);
  // 오늘이 아니라 이번 회차가 속한 달로 연다. 07-31 에 열어도 회차가 08-04 면 8월이 보여야
  // 처리할 날짜를 바로 고를 수 있다.
  const [monthAnchor, setMonthAnchor] = useState(window.intakeDate);
  // 쉽먼트·밀크런은 한 달력에서 합쳐 보고, 수집할 때 유형별 파일로 나뉜다.
  const [selected, setSelected] = useState<string[]>([]);
  const cells = useMemo(
    () => buildDirectshipEddCalendar(pos, null, { collectedSeqs, window }),
    [pos, collectedSeqs, window],
  );
  const picked = useMemo(() => new Set(selected), [selected]);
  const totals = useMemo(() => selected.reduce((acc, d) => {
    const c = cells[d];
    return { po: acc.po + (c?.poCount ?? 0), qty: acc.qty + (c?.qty ?? 0) };
  }, { po: 0, qty: 0 }), [selected, cells]);
  const pendingAll = useMemo(
    () => Object.values(cells).reduce((sum, c) => sum + c.poCount, 0),
    [cells],
  );
  const pendingShipment = useMemo(
    () => Object.values(cells).reduce((s2, c) => s2 + c.byTransport.SHIPMENT, 0),
    [cells],
  );
  const pendingMilkrun = useMemo(
    () => Object.values(cells).reduce((s2, c) => s2 + c.byTransport.MILKRUN, 0),
    [cells],
  );

  if (!open) return null;

  const toggle = (date: string) => setSelected((cur) => (cur.includes(date)
    ? cur.filter((d) => d !== date)
    : [...cur, date]));

  const selectWindow = () => setSelected(Object.entries(cells)
    .filter(([, c]) => c.inWindow && c.poCount > 0)
    .map(([d]) => d));

  const shiftMonth = (delta: number) => {
    const a = new Date(`${monthAnchor}T00:00:00`);
    a.setMonth(a.getMonth() + delta);
    setMonthAnchor(`${a.getFullYear()}-${pad(a.getMonth() + 1)}-01`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-label="쿠팡직배송 입고예정일 선택"
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">쿠팡직배송 · 입고예정일</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {window.intakeDate}({window.intakeWeekday}) 접수분 — 입고예정일{' '}
              <b className="text-amber-700">{window.from} ~ {window.to}</b> 까지 처리합니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
          <span className="text-xs text-slate-500">
            발주 <b className="tabular-nums text-slate-900">{formatNumber(pendingAll)}</b>건
            <span className="ml-1 text-slate-400">
              (쉽먼트 {formatNumber(pendingShipment)} · 밀크런 {formatNumber(pendingMilkrun)})
            </span>
          </span>
          <button type="button" onClick={selectWindow}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            이번 회차 전체 선택
          </button>
          <span className="ml-auto text-xs text-slate-500">
            선택 <b className="tabular-nums text-slate-900">{formatNumber(totals.po)}</b>건 ·{' '}
            <b className="tabular-nums text-slate-900">{formatNumber(totals.qty)}</b>개
          </span>
        </div>

        <div className="px-5 py-3">
          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 쿠팡에서 발주를 불러오는 중입니다…
            </div>
          ) : (
            <EddCalendar
              monthAnchor={monthAnchor}
              cells={cells}
              selected={picked}
              onToggle={toggle}
              onShiftMonth={shiftMonth}
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600">
            취소
          </button>
          <button
            type="button"
            disabled={loading || selected.length === 0}
            onClick={() => onCollect(selected)}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            선택한 날짜 수집
          </button>
        </div>
      </div>
    </div>
  );
}
