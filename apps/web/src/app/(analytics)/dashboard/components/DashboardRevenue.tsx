'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowUpRight, LineChart as LineChartIcon, Settings2, X } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { cn, formatKRW } from '@/lib/utils';
import { DashboardCardHeader } from './DashboardCardHeader';
import type { SellpiaSalesDailyPoint, SellpiaSalesSummary } from '@kiditem/shared/dashboard';

/**
 * 매출 추이 — 볼 그래프를 사장님이 고른다.
 *
 * 기본은 총 매출 · 쿠팡 · 쿠팡 외 몰 세 선이다. 쿠팡 외 몰 가운데 따로 보고 싶은 몰은 설정에서
 * 골라 선으로 더한다(사장님 2026-09-18: 다 보여주면 복잡하다, 고르게 해 달라). 선끼리 뜻이
 * 겹치므로(총 매출 = 쿠팡 + 쿠팡 외, 고른 몰은 쿠팡 외의 일부) 쌓지 않고 선으로 둔다 — 쌓으면
 * 같은 매출을 두 번 센다. 큰 선을 끄면 세로 눈금이 남은 선에 맞게 다시 잡혀 작은 몰도 읽힌다.
 *
 * 숫자는 전부 셀피아 판매현황 읽기모델이 낸 것이다. 총 매출 선(`total.daily`)도, 쿠팡과 쿠팡
 * 외(`coupang` · `nonCoupang`)도 서버가 판매처로 나눠 보낸다. 화면은 더하지도 빼지도 않는다.
 *
 * 색은 모든 쌍을 검증했다(선은 어디서든 겹친다). 쿠팡 · 쿠팡 외 두 색은 ΔE 15.5 로 통과하고,
 * 몰은 셋까지다 — 넷째 색부터 분홍과 주황이 정상 시력으로도 구분되지 않는다(ΔE 12.9). 셋 안에서도
 * 청록과 분홍이 색각 이상 기준 경계(6.1)라 몰 선마다 점선 무늬를 달리한다. 총 매출은 합계라
 * 색이 아닌 진한 잉크로 굵게 긋는다. 선택은 이 브라우저에만 기억한다.
 *
 * 보기 방식은 일별(그날의 매출)과 누적(기간 첫날부터 그날까지의 합) 둘이다. 누적은 서버가 낸
 * 일별 값을 이어 더한 것이라 마지막 점이 기간 합계와 같다 — 새 숫자를 만들지 않는다.
 */

const TOTAL = '#334155';
const COUPANG = '#7c3aed';
const NON_COUPANG = '#0ea5e9';
const MALL_SLOTS = [
  { color: '#eda100', dash: '6 3' },
  { color: '#1baf7a', dash: '2 3' },
  { color: '#e87ba4', dash: '8 3 2 3' },
] as const;
const CHART_HEIGHT = 210;
const VIEW_KEY = 'kiditem.dashboard.revenue-view.v1';

type BaseKey = 'total' | 'coupang' | 'nonCoupang';
/** 일별은 그날의 매출, 누적은 기간 첫날부터 그날까지의 합. */
type RevenueMode = 'daily' | 'cumulative';
/** 그래프 모양 — 사장님이 고른다(2026-09-20). 기본은 막대. */
type RevenueShape = 'bar' | 'line';

interface RevenueView {
  mode: RevenueMode;
  shape: RevenueShape;
  base: Record<BaseKey, boolean>;
  /** 고른 몰과 그 몰이 받은 색 자리. 다른 몰을 끄고 켜도 남은 몰의 색이 바뀌지 않는다. */
  malls: Array<{ id: string; slot: number }>;
}

const DEFAULT_VIEW: RevenueView = {
  mode: 'daily',
  shape: 'bar',
  base: { total: true, coupang: true, nonCoupang: true },
  malls: [],
};

function readView(): RevenueView {
  const raw = safeStorageGet('local', VIEW_KEY);
  if (!raw) return DEFAULT_VIEW;
  try {
    const parsed = JSON.parse(raw) as Partial<RevenueView>;
    const base = parsed.base ?? DEFAULT_VIEW.base;
    const malls = Array.isArray(parsed.malls)
      ? parsed.malls.filter((mall): mall is { id: string; slot: number } =>
        typeof mall?.id === 'string'
        && Number.isInteger(mall.slot)
        && mall.slot >= 0
        && mall.slot < MALL_SLOTS.length)
      : [];
    return {
      mode: parsed.mode === 'cumulative' ? 'cumulative' : 'daily',
      shape: parsed.shape === 'line' ? 'line' : 'bar',
      base: { total: base.total !== false, coupang: base.coupang !== false, nonCoupang: base.nonCoupang !== false },
      malls: malls.slice(0, MALL_SLOTS.length),
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

interface Series {
  key: string;
  label: string;
  color: string;
  dash: string | undefined;
  width: number;
  total: number;
  /** 서버가 낸 전체 대비 비중. 모르면 null — 화면이 계산하지 않는다. */
  share: number | null;
  daily: ReadonlyMap<string, number>;
}

/**
 * 차트의 날짜별 점. 모르는 날은 그 선의 점을 비워 둔다 — 셀피아가 확인한 날만 0 을 낸다(서버의
 * 커버리지 규칙). 누적은 확인된 날만 더하고, 모르는 날을 건너 그 뒤로 이어 간다. 그래서 누적의
 * 마지막 점은 기간 합계(범례의 금액)와 같다.
 */
export function revenuePoints(
  dates: readonly string[],
  series: readonly Pick<Series, 'key' | 'daily'>[],
  mode: RevenueMode,
): Record<string, number | string>[] {
  const running = new Map<string, number>();
  return dates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const item of series) {
      const value = item.daily.get(date);
      if (value === undefined) continue;
      if (mode === 'cumulative') {
        const sum = (running.get(item.key) ?? 0) + value;
        running.set(item.key, sum);
        row[item.key] = sum;
      } else {
        row[item.key] = value;
      }
    }
    return row;
  });
}

function byDate(daily: readonly SellpiaSalesDailyPoint[]): Map<string, number> {
  return new Map(daily.map((point) => [point.date, point.revenue]));
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** `2026-09-01` → `['월', '09-01']`. 날짜 문자열만 읽는다(표준시 계산 없이). */
export function dayTick(date: string): [string, string] {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return ['', date.slice(5)];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
  return [weekday, date.slice(5)];
}

/** 요일 · 날짜 두 줄. 주말은 옅게 — 장사 흐름이 요일을 탄다. */
function DayTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const [weekday, date] = dayTick(String(payload?.value ?? ''));
  const weekend = weekday === '토' || weekday === '일';
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" fontSize={12} fontWeight={600} fill={weekend ? '#cbd5e1' : '#64748b'} dy={14}>{weekday}</text>
      <text textAnchor="middle" fontSize={11} fill="#94a3b8" dy={29}>{date}</text>
    </g>
  );
}

function manwon(value: number): string {
  if (value === 0) return '0';
  return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만`;
}

export function DashboardRevenue({
  summary,
  isLoading,
  isError,
  salesHref,
  className,
}: {
  className?: string;
  summary: SellpiaSalesSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  salesHref: string;
}) {
  // 서버 렌더와 첫 화면이 같도록 기본으로 시작하고, 기억해 둔 선택은 마운트 뒤에 읽는다.
  const [view, setView] = useState<RevenueView>(DEFAULT_VIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => { setView(readView()); }, []);
  const updateView = (next: RevenueView) => {
    setView(next);
    safeStorageSet('local', VIEW_KEY, JSON.stringify(next));
  };

  const total = summary?.total;
  const coupang = summary?.coupang;
  const nonCoupang = summary?.nonCoupang;
  const ready = Boolean(summary?.hasData && coupang && nonCoupang);

  /** 쿠팡 외 몰 전부, 큰 몰부터. 설정의 고르기 목록이다. */
  const mallChoices = useMemo(
    () => [...(nonCoupang?.malls ?? [])].sort((a, b) => b.revenue - a.revenue),
    [nonCoupang],
  );

  const series = useMemo<Series[]>(() => {
    if (!coupang || !nonCoupang) return [];
    const list: Series[] = [];
    if (view.base.total && total) {
      list.push({ key: 'total', label: '총 매출', color: TOTAL, dash: undefined, width: 2.5, total: total.revenue, share: null, daily: byDate(total.daily) });
    }
    if (view.base.coupang) {
      list.push({ key: 'coupang', label: '쿠팡', color: COUPANG, dash: undefined, width: 2, total: coupang.revenue, share: coupang.revenueShare, daily: byDate(coupang.daily) });
    }
    if (view.base.nonCoupang) {
      list.push({ key: 'nonCoupang', label: '쿠팡 외 몰', color: NON_COUPANG, dash: undefined, width: 2, total: nonCoupang.revenue, share: nonCoupang.revenueShare, daily: byDate(nonCoupang.daily) });
    }
    for (const pick of view.malls) {
      const mall = nonCoupang.malls.find((candidate) => candidate.sellerId === pick.id);
      // 이 기간에 판 적이 없는 몰은 선을 그리지 않는다. 고른 것은 남겨 두어 기간을 바꾸면 돌아온다.
      if (!mall) continue;
      const slot = MALL_SLOTS[pick.slot]!;
      list.push({ key: `mall_${pick.slot}`, label: mall.sellerName, color: slot.color, dash: slot.dash, width: 2, total: mall.revenue, share: null, daily: byDate(mall.daily) });
    }
    return list;
  }, [coupang, nonCoupang, total, view]);

  const points = useMemo(() => {
    if (!coupang || !nonCoupang) return [];
    const dates = [...new Set([...coupang.daily, ...nonCoupang.daily].map((point) => point.date))].sort();
    return revenuePoints(dates, series, view.mode);
  }, [coupang, nonCoupang, series, view.mode]);

  const seriesByKey = useMemo(() => new Map(series.map((item) => [item.key, item])), [series]);
  const range = summary?.range;

  const toggleBase = (key: BaseKey) =>
    updateView({ ...view, base: { ...view.base, [key]: !view.base[key] } });
  const toggleMall = (id: string) => {
    const picked = view.malls.find((mall) => mall.id === id);
    if (picked) {
      updateView({ ...view, malls: view.malls.filter((mall) => mall.id !== id) });
      return;
    }
    const used = new Set(view.malls.map((mall) => mall.slot));
    const slot = MALL_SLOTS.findIndex((_, index) => !used.has(index));
    if (slot === -1) return;
    updateView({ ...view, malls: [...view.malls, { id, slot }] });
  };
  const mallsFull = view.malls.length >= MALL_SLOTS.length;

  return (
    <section aria-label="매출 추이" className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} data-testid="dashboard-revenue">
      <DashboardCardHeader
        icon={LineChartIcon}
        tone="violet"
        title="매출 추이"
        meta={range ? (
          <span className="truncate text-xs font-normal tabular-nums text-slate-400">{range.from} ~ {range.to} · 셀피아 판매현황 · {view.mode === 'cumulative' ? '누적' : '일별'}</span>
        ) : null}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-controls="dashboard-revenue-settings"
          className={cn(
            'inline-flex flex-none items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            settingsOpen
              ? 'border-violet-200 bg-violet-50 text-violet-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          )}
        >
          <Settings2 size={12} aria-hidden />
          설정
        </button>
      </DashboardCardHeader>

      {/* 설정 — 볼 선을 고른다. 쿠팡 외 몰은 셋까지 따로 볼 수 있다. */}
      {settingsOpen && typeof document !== 'undefined' ? createPortal((
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={() => setSettingsOpen(false)}
        >
        <div
          id="dashboard-revenue-settings"
          role="dialog"
          aria-modal="true"
          aria-label="매출 추이 설정"
          onClick={(event) => event.stopPropagation()}
          className="max-h-[80vh] w-[28rem] max-w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">매출 추이 설정</h3>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="설정 닫기"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>
          <fieldset>
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">보기 방식</legend>
            <div className="mt-1.5 inline-flex overflow-hidden rounded-md border border-slate-200 bg-white" role="radiogroup" aria-label="보기 방식">
              {([
                ['daily', '일별', '그날의 매출'],
                ['cumulative', '누적', '기간 첫날부터 그날까지의 합'],
              ] as const).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={view.mode === mode}
                  title={hint}
                  onClick={() => updateView({ ...view, mode })}
                  className={cn(
                    'border-l border-slate-200 px-3 py-1 text-xs font-semibold transition-colors first:border-l-0',
                    view.mode === mode ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">그래프 모양</legend>
            <div className="mt-1.5 inline-flex overflow-hidden rounded-md border border-slate-200 bg-white" role="radiogroup" aria-label="그래프 모양">
              {([
                ['bar', '막대', '날마다 얼마였는지 크기로 견준다'],
                ['line', '선', '오르내림을 이어서 본다'],
              ] as const).map(([shape, label, hint]) => (
                <button
                  key={shape}
                  type="button"
                  role="radio"
                  aria-checked={view.shape === shape}
                  title={hint}
                  onClick={() => updateView({ ...view, shape })}
                  className={cn(
                    'border-l border-slate-200 px-3 py-1 text-xs font-semibold transition-colors first:border-l-0',
                    view.shape === shape ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">표시할 그래프</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {([
                ['total', '총 매출', TOTAL],
                ['coupang', '쿠팡', COUPANG],
                ['nonCoupang', '쿠팡 외 몰', NON_COUPANG],
              ] as const).map(([key, label, color]) => (
                <label key={key} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={view.base[key]}
                    onChange={() => toggleBase(key)}
                    className="h-3.5 w-3.5 accent-violet-600"
                  />
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              쿠팡 외 몰에서 따로 보기 <span className="font-normal normal-case tracking-normal">· 최대 {MALL_SLOTS.length}개 ({view.malls.length}/{MALL_SLOTS.length})</span>
            </legend>
            <ul className="mt-1.5 grid max-h-40 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {mallChoices.map((mall) => {
                const picked = view.malls.find((pick) => pick.id === mall.sellerId);
                const disabled = !picked && mallsFull;
                const slot = picked ? MALL_SLOTS[picked.slot] : null;
                return (
                  <li key={mall.sellerId}>
                    <label className={cn('flex items-center gap-1.5 text-xs', disabled ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700')}>
                      <input
                        type="checkbox"
                        checked={Boolean(picked)}
                        disabled={disabled}
                        onChange={() => toggleMall(mall.sellerId)}
                        className="h-3.5 w-3.5 flex-none accent-violet-600"
                      />
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-sm border border-slate-200"
                        style={slot ? { backgroundColor: slot.color, borderColor: slot.color } : undefined}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{mall.sellerName}</span>
                      <span className="flex-none tabular-nums text-slate-400">{manwon(mall.revenue)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </div>
        </div>
      ), document.body) : null}

      {isLoading ? (
        <p className="px-4 py-16 text-center text-sm text-slate-400">매출을 불러오는 중입니다.</p>
      ) : isError ? (
        <p className="px-4 py-16 text-center text-sm text-red-600">셀피아 판매현황을 읽지 못했습니다.</p>
      ) : !ready ? (
        // 모름은 0 이 아니다. 비어 있는 차트를 그리지 않고 왜 비었는지 말한다.
        <p className="px-4 py-16 text-center text-sm text-slate-400">이 기간의 셀피아 판매현황이 아직 없습니다.</p>
      ) : series.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-slate-400">설정에서 볼 그래프를 고르세요.</p>
      ) : (
        <div className="flex flex-1 flex-col px-4 py-3">
          {/* 범례 — 선마다 이름과 금액. 올리면 그 선만 또렷해진다. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="표시 중인 그래프">
            {series.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseEnter={() => setFocused(item.key)}
                  onMouseLeave={() => setFocused(null)}
                  onFocus={() => setFocused(item.key)}
                  onBlur={() => setFocused(null)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded text-xs transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300',
                    focused && focused !== item.key && 'opacity-40',
                  )}
                >
                  <svg width="16" height="8" aria-hidden className="flex-none">
                    <line x1="0" y1="4" x2="16" y2="4" stroke={item.color} strokeWidth={item.width} strokeDasharray={item.dash} />
                  </svg>
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatKRW(item.total)}원{item.share !== null ? ` · ${item.share}%` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* 줄 높이에 맞춰 차트가 자란다 — 옆 칸(에이전트 · 긴급)과 아래 선이 맞는다. */}
          <div className="mt-3 flex-1" style={{ minHeight: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: CHART_HEIGHT }}>
              <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
                <defs>
                  <linearGradient id="dashboardBarCoupang" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                  <linearGradient id="dashboardBarNonCoupang" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c4b5fd" />
                    <stop offset="100%" stopColor="#ddd6fe" />
                  </linearGradient>
                  <linearGradient id="dashboardBarOther" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#c7d2fe" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={<DayTick />}
                  height={38}
                  interval={0}
                  minTickGap={0}
                />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#94a3b8' }}
                  tickFormatter={manwon}
                  width={56}
                />
                <Tooltip
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                        <p className="mb-1 font-medium text-slate-500">{label}{view.mode === 'cumulative' ? ' · 누적' : ''}</p>
                        {payload.map((entry) => {
                          const item = seriesByKey.get(String(entry.dataKey));
                          if (!item) return null;
                          return (
                            <p key={item.key} className="flex items-center justify-between gap-4">
                              <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                                <span className="h-2 w-2 flex-none rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />
                                <span className="truncate">{item.label}</span>
                              </span>
                              <span className="font-semibold tabular-nums text-slate-900">
                                {typeof entry.value === 'number' ? `${formatKRW(entry.value)}원` : '—'}
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                {series.map((item, index) => {
                  const dimmed = focused !== null && focused !== item.key;
                  if (view.shape === 'bar') {
                    // 총 매출은 쌓은 막대 자체가 말한다 — 따로 그리면 같은 돈을 두 번 세운다.
                    if (item.key === 'total') return null;
                    const stacked = item.key === 'coupang' || item.key === 'nonCoupang';
                    const top = stacked && index === series.length - 1;
                    return (
                      <Bar
                        key={item.key}
                        dataKey={item.key}
                        stackId={stacked ? 'revenue' : undefined}
                        fill={item.key === 'coupang'
                          ? 'url(#dashboardBarCoupang)'
                          : item.key === 'nonCoupang'
                            ? 'url(#dashboardBarNonCoupang)'
                            : 'url(#dashboardBarOther)'}
                        fillOpacity={dimmed ? 0.15 : 1}
                        radius={stacked && !top ? undefined : [6, 6, 0, 0]}
                        maxBarSize={44}
                        isAnimationActive={false}
                      />
                    );
                  }
                  return (
                    <Line
                      key={item.key}
                      type="monotone"
                      dataKey={item.key}
                      stroke={item.color}
                      strokeWidth={item.width}
                      strokeDasharray={item.dash}
                      strokeOpacity={dimmed ? 0.2 : 1}
                      connectNulls={false}
                      dot={points.length === 1}
                      activeDot={{ r: 3.5, strokeWidth: 2, stroke: '#ffffff' }}
                      isAnimationActive={false}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <Link
            href={salesHref}
            className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 hover:text-violet-700"
          >
            몰별 전체 목록은 매출 분석에서
            <ArrowUpRight size={11} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}
