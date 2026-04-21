import { format, subDays, parseISO, isValid } from 'date-fns';
import type { DateRange } from 'react-day-picker';

/**
 * Coupang dashboard URL state util — parses + builds `?preset=N` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * Used by `coupang/orders/page.tsx` and `coupang/returns/page.tsx` to share one URL contract.
 */

export const PRESETS = [7, 30, 90] as const;
export type Preset = (typeof PRESETS)[number] | 0;  // 0 = custom range

export function toParam(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function presetToRange(days: number): DateRange {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

/**
 * Parse URL search params → (preset, dateRange). Fallback rules:
 * - If `preset` is 7|30|90 → use that.
 * - Else if `from` and `to` are valid yyyy-MM-dd → custom range (preset=0).
 * - Else default to preset=30.
 */
export function parseUrlState(sp: URLSearchParams): { preset: Preset; range: DateRange } {
  const presetStr = sp.get('preset');
  const presetNum = presetStr ? Number(presetStr) : NaN;
  if ((PRESETS as readonly number[]).includes(presetNum)) {
    return { preset: presetNum as Preset, range: presetToRange(presetNum) };
  }
  const fromStr = sp.get('from');
  const toStr = sp.get('to');
  if (fromStr && toStr) {
    const from = parseISO(fromStr);
    const to = parseISO(toStr);
    if (isValid(from) && isValid(to)) {
      return { preset: 0, range: { from, to } };
    }
  }
  return { preset: 30, range: presetToRange(30) };
}
