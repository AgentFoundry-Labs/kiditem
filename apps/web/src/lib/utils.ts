import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ProductAbcGrade } from '@kiditem/shared/product-abc';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
}

type DateInput = string | Date | number | null | undefined;

const DEFAULT_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const DEFAULT_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

export function formatDateTime(date: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (date == null) return '-';
  return new Intl.DateTimeFormat('ko-KR', opts ?? DEFAULT_DATETIME_OPTS).format(new Date(date));
}

export function formatDate(date: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (date == null) return '-';
  return new Intl.DateTimeFormat('ko-KR', opts ?? DEFAULT_DATE_OPTS).format(new Date(date));
}

export function formatTime(date: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (date == null) return '-';
  return new Intl.DateTimeFormat('ko-KR', opts ?? DEFAULT_TIME_OPTS).format(new Date(date));
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '-';
  return new Intl.NumberFormat('ko-KR').format(num);
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);
}

export function getModuleColor(module: string): string {
  const colors: Record<string, string> = {
    order: '#3B82F6',
    accounting: '#10B981',
    inventory: '#F59E0B',
    cs: '#EF4444',
    report: '#8B5CF6',
    product: '#EC4899',
    marketing: '#06B6D4',
  };
  return colors[module] || '#6B7280';
}

export function timeAgo(dateString: string | Date, nowInput: string | Date = new Date()): string {
  const date = new Date(dateString);
  const now = new Date(nowInput);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR');
}

export function formatKRW(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(amount));
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${value.toFixed(1)}%`;
}

/** The one ABC grade palette: the product ABC badge and every grade chip use it. */
export const ABC_GRADE_TONE_CLASS = {
  A: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  B: 'bg-amber-100 text-amber-800 ring-amber-300',
  C: 'bg-rose-100 text-rose-800 ring-rose-300',
} as const satisfies Record<ProductAbcGrade, string>;

/** Tone for an unclassified or unknown grade. */
export const ABC_GRADE_NEUTRAL_TONE_CLASS = 'bg-slate-100 text-slate-700 ring-slate-300';

export function getGradeColor(grade: string): string {
  return grade === 'A' || grade === 'B' || grade === 'C'
    ? ABC_GRADE_TONE_CLASS[grade]
    : ABC_GRADE_NEUTRAL_TONE_CLASS;
}

/**
 * The same palette's text tone, for a grade label that carries no chip.
 * Derived from the chip tone so a label can never show a grade in a colour
 * the chip does not use.
 */
export function getGradeTextColor(grade: string): string {
  return getGradeColor(grade)
    .split(' ')
    .find((tone) => tone.startsWith('text-')) ?? ABC_GRADE_NEUTRAL_TEXT_CLASS;
}

const ABC_GRADE_NEUTRAL_TEXT_CLASS = 'text-slate-700';

/**
 * Totals a column that may be unavailable.
 *
 * A total over a set containing an unavailable member is itself unavailable —
 * skipping that member would present a smaller number as if it were the whole.
 * Pair with `formatKRW`/`formatPercent`, which render `null` as '-'.
 */
export function sumOrUnavailable(
  values: readonly (number | null)[],
): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function getProfitColor(rate: number | null | undefined): string {
  if (rate == null) return 'text-slate-400';
  if (rate < 0) return 'text-red-600 font-bold';
  if (rate <= 3) return 'text-orange-500 font-semibold';
  return 'text-green-600';
}

/**
 * Master product lifecycle badge (Phase 5/7, #192).
 *
 * Canonical values come from `PRODUCT_LIFECYCLE_STATES`
 * (`active | paused | discontinued`). Legacy management read-model statuses
 * (`inactive | cleanup | unknown`) remain mapped for the management page,
 * which derives its own discriminator separate from the master's
 * `lifecycleState`.
 */
export function getProductStatusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: '판매중', color: 'bg-green-100 text-green-800' };
    case 'paused': return { label: '중지', color: 'bg-amber-100 text-amber-800' };
    case 'discontinued': return { label: '정리', color: 'bg-red-100 text-red-800' };
    case 'inactive': return { label: '중지', color: 'bg-gray-100 text-gray-800' };
    case 'cleanup': return { label: '정리', color: 'bg-red-100 text-red-800' };
    case 'unknown': return { label: '상태미수집', color: 'bg-slate-100 text-slate-700' };
    default: return { label: status, color: 'bg-gray-100 text-gray-800' };
  }
}
