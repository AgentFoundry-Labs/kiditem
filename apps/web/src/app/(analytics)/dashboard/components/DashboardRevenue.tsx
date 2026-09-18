'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, LineChart as LineChartIcon, Settings2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SellpiaSalesDailyPoint, SellpiaSalesSummary } from '@kiditem/shared/dashboard';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { cn, formatKRW } from '@/lib/utils';

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
const CHART_HEIGHT = 360;
const VIEW_KEY = 'kiditem.dashboard.revenue-view.v1';

type BaseKey = 'total' | 'coupang' | 'nonCoupang';
/** 일별은 그날의 매출, 누적은 기간 첫날부터 그날까지의 합. */
type RevenueMode = 'daily' | 'cumulative';

interface RevenueView {
  mode: RevenueMode;
  base: Record<BaseKey, boolean>;
  /** 고른 몰과 그 몰이 받은 색 자리. 다른 몰을 끄고 켜도 남은 몰의 색이 바뀌지 않는다. */
  malls: Array<{ id: string; slot: number }>;
}

const DEFAULT_VIEW: RevenueView = {
  mode: 'daily',
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

function manwon(value: number): string {
  if (value === 0) return '0';
  return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만`;
}

export function DashboardRevenue({
  summary,
  isLoading,
  isError,
  salesHref,
}: {
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
    <section aria-label="매출 추이" className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="dashboard-revenue">
      <header className="flex items-center justify-between gap-2 h-10 border-b border-slate-100 px-4">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-800">
          <LineChartIcon size={14} className="flex-none text-slate-500" aria-hidden />
          매출 추이
          {range ? (
            <span className="truncate text-xs font-normal tabular-nums text-slate-400">{range.from} ~ {range.to} · 셀피아 판매현황 · {view.mode === 'cumulative' ? '누적' : '일별'}</span>
          ) : null}
        </h2>
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
      </header>

      {/* 설정 — 볼 선을 고른다. 쿠팡 외 몰은 셋까지 따로 볼 수 있다. */}
      {settingsOpen ? (
        <div id="dashboard-revenue-settings" className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
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
      ) : null}

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
        <div className="px-4 py-3">
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

          <div className="mt-3" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={{ width: 800, height: CHART_HEIGHT }}>
              <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#94a3b8' }}
                  tickFormatter={(value: string) => value.slice(5)}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  fontSize={11}
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
                {series.map((item) => {
                  const dimmed = focused !== null && focused !== item.key;
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
              </LineChart>
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
