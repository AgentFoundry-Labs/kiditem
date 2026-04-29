// Pure KST business-date helpers extracted from AdSyncService.
//
// `payload.timestamp` 같은 ISO 문자열은 KST (+09:00) 로 shift 후 day slice.
// `YYYY-MM-DD` 형태는 이미 KST business date 로 간주. handler 가 직접
// `new Date(...).slice(0,10)` 하지 않도록 한 곳에서 관리.

/**
 * Convert any payload date string to a KST `@db.Date` Date (UTC midnight of
 * the KST day). Pre-MEDIUM-1 fix: naive `slice(0,10)` of a UTC ISO string
 * dropped the day for KST early-morning timestamps (e.g.,
 * `2026-04-13T15:30:00Z` is 2026-04-14 00:30 KST but used to land as
 * 2026-04-13).
 *
 * Accepts:
 * - `YYYY-MM-DD` / `YYYY-M-D` (treated as already a KST business date)
 * - any longer ISO/parseable string (parsed → shifted to KST → date slice)
 */
export function toBusinessDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const [, year, monthRaw, dayRaw] = ymd;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }
  if (trimmed.includes('T')) {
    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime())) return null;
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const kstDate = new Date(parsed.getTime() + KST_OFFSET_MS);
    const y = kstDate.getUTCFullYear();
    const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstDate.getUTCDate()).padStart(2, '0');
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  return null;
}

export function currentBusinessDate(now: Date = new Date()): Date {
  return (
    toBusinessDate(now.toISOString()) ??
    new Date(now.toISOString().slice(0, 10))
  );
}

export function resolveBusinessDate(
  ...candidates: Array<string | undefined | null>
): Date {
  for (const candidate of candidates) {
    const parsed = toBusinessDate(candidate);
    if (parsed) return parsed;
  }
  return currentBusinessDate();
}
