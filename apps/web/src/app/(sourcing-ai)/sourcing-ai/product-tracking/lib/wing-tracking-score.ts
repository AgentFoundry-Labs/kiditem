import type { WingTrackedSnapshot } from '../../lib/wing-tracking-api';

// 추적 상품의 일별 스냅샷으로 선택한 기간(3일/7일)의 변화량과 모멘텀 점수를 계산하는 순수 헬퍼.
// 점수 가중치는 이 파일 한 곳에서만 조정한다.

export type TrackingWindow = 3 | 7;

export const TRACKING_WINDOWS: TrackingWindow[] = [3, 7];

/** 점수 가중치 — 합이 1이 되도록 유지. */
export const SCORE_WEIGHTS = {
  sales: 0.35,
  revenue: 0.3,
  conversion: 0.2,
  reviews: 0.15,
} as const;

export interface MetricDelta {
  from: number | null;
  to: number | null;
  /** 변화율(%) — 카운트·금액 지표용. from 이 0/누락이면 null. */
  changePct: number | null;
  /** 절대 변화량. */
  changeAbs: number | null;
}

export interface WindowTrend {
  /** from·to 두 시점이 모두 있어 변화량을 낼 수 있는지. */
  hasData: boolean;
  fromDate: string | null;
  toDate: string | null;
  /** from~to 실측 일수(스냅샷이 드물면 요청한 기간보다 짧을 수 있음). */
  spanDays: number;
  pointCount: number;
  sales: MetricDelta;
  revenue: MetricDelta;
  reviews: MetricDelta;
  price: MetricDelta;
  /** 전환율 변화(퍼센트포인트). */
  conversionChangePp: number | null;
  conversionFrom: number | null;
  conversionTo: number | null;
  /** 0~100 모멘텀 점수. 계산 불가면 null. */
  score: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(businessDate: string): number {
  return new Date(businessDate).getTime();
}

/** 최신 스냅샷 기준 최근 `days` 일 안의 스냅샷만 오름차순으로 추린다. */
export function filterWindow(
  points: WingTrackedSnapshot[],
  days: number,
): WingTrackedSnapshot[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => toTime(a.businessDate) - toTime(b.businessDate));
  const latest = toTime(sorted[sorted.length - 1].businessDate);
  const cutoff = latest - days * DAY_MS;
  // cutoff 이후 스냅샷만. 창 안에 시작점이 없으면(첫 스냅샷이 cutoff 이전) 가장 이른 것도 포함해 비교 가능하게 한다.
  const within = sorted.filter((point) => toTime(point.businessDate) >= cutoff);
  if (within.length >= 2) return within;
  // 창 안 스냅샷이 1개뿐이면 그 직전 스냅샷 하나를 붙여 최소 비교쌍을 만든다.
  return sorted.slice(-2);
}

function delta(from: number | null, to: number | null): MetricDelta {
  if (from == null || to == null) return { from, to, changePct: null, changeAbs: null };
  const changeAbs = to - from;
  const changePct = from !== 0 ? (changeAbs / Math.abs(from)) * 100 : null;
  return { from, to, changePct, changeAbs };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 변화율(%)을 0~100 하위점수로. 0% → 50, +100% → 100, -100% → 0. */
function pctToScore(changePct: number | null): number | null {
  if (changePct == null) return null;
  return clamp(50 + changePct * 0.5, 0, 100);
}

/** 전환율 변화(pp)를 0~100 하위점수로. 0pp → 50, +5pp → 100, -5pp → 0. */
function ppToScore(changePp: number | null): number | null {
  if (changePp == null) return null;
  return clamp(50 + changePp * 10, 0, 100);
}

function weightedScore(
  parts: Array<{ sub: number | null; weight: number }>,
): number | null {
  const active = parts.filter((part) => part.sub != null);
  if (active.length === 0) return null;
  const totalWeight = active.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return null;
  const raw = active.reduce((sum, part) => sum + (part.sub as number) * part.weight, 0);
  return Math.round(raw / totalWeight);
}

export function computeWindowTrend(
  points: WingTrackedSnapshot[],
  days: number,
): WindowTrend {
  const window = filterWindow(points, days);
  const empty: WindowTrend = {
    hasData: false,
    fromDate: window[0]?.businessDate ?? null,
    toDate: window[window.length - 1]?.businessDate ?? null,
    spanDays: 0,
    pointCount: window.length,
    sales: delta(null, null),
    revenue: delta(null, null),
    reviews: delta(null, null),
    price: delta(null, null),
    conversionChangePp: null,
    conversionFrom: null,
    conversionTo: null,
    score: null,
  };
  if (window.length < 2) return empty;

  const from = window[0];
  const to = window[window.length - 1];
  const spanDays = Math.max(
    1,
    Math.round((toTime(to.businessDate) - toTime(from.businessDate)) / DAY_MS),
  );

  const sales = delta(from.salesLast28d, to.salesLast28d);
  const revenue = delta(from.estimatedRevenue28d, to.estimatedRevenue28d);
  const reviews = delta(from.ratingCount, to.ratingCount);
  const price = delta(from.salePriceKrw, to.salePriceKrw);
  const conversionFrom = from.conversionRate28d;
  const conversionTo = to.conversionRate28d;
  const conversionChangePp =
    conversionFrom != null && conversionTo != null
      ? (conversionTo - conversionFrom) * 100
      : null;

  const score = weightedScore([
    { sub: pctToScore(sales.changePct), weight: SCORE_WEIGHTS.sales },
    { sub: pctToScore(revenue.changePct), weight: SCORE_WEIGHTS.revenue },
    { sub: ppToScore(conversionChangePp), weight: SCORE_WEIGHTS.conversion },
    { sub: pctToScore(reviews.changePct), weight: SCORE_WEIGHTS.reviews },
  ]);

  return {
    hasData: true,
    fromDate: from.businessDate,
    toDate: to.businessDate,
    spanDays,
    pointCount: window.length,
    sales,
    revenue,
    reviews,
    price,
    conversionChangePp,
    conversionFrom,
    conversionTo,
    score,
  };
}

/** 점수 구간별 라벨·색조. */
export function scoreTone(score: number | null): {
  label: string;
  className: string;
  barClassName: string;
} {
  if (score == null) {
    return {
      label: '데이터 부족',
      className: 'bg-[var(--surface-sunken)] text-[var(--text-tertiary)]',
      barClassName: 'bg-[var(--border)]',
    };
  }
  if (score >= 66) {
    return {
      label: '상승',
      className: 'bg-emerald-50 text-emerald-700',
      barClassName: 'bg-emerald-500',
    };
  }
  if (score >= 45) {
    return {
      label: '유지',
      className: 'bg-amber-50 text-amber-700',
      barClassName: 'bg-amber-500',
    };
  }
  return {
    label: '둔화',
    className: 'bg-rose-50 text-rose-700',
    barClassName: 'bg-rose-500',
  };
}
