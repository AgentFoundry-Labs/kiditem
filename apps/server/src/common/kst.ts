const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Converts a JS Date to the UTC timestamp representing midnight KST (UTC+9).
 * Docker containers run UTC — this helper ensures Korean date bucketing is correct.
 *
 * Example: 2026-03-23T05:19:48Z (KST 14:19:48) → 2026-03-22T15:00:00.000Z (KST midnight)
 */
export function kstDayStart(date: Date): Date {
  const kstMs = date.getTime() + KST_OFFSET_MS;
  const kstMidnightMs = Math.floor(kstMs / 86400000) * 86400000;
  return new Date(kstMidnightMs - KST_OFFSET_MS);
}

/**
 * Converts a JS Date to the UTC-midnight Date for the corresponding KST
 * calendar day. Use this for Prisma/Postgres `@db.Date` equality keys.
 *
 * Example: 2026-05-26T16:00:00Z (KST 2026-05-27 01:00)
 * -> 2026-05-27T00:00:00.000Z.
 */
export function kstBusinessDate(date: Date): Date {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * Returns the UTC Date that equals '{year}-{month}-01 00:00:00+09:00' (KST midnight).
 * month 는 1-12. month === 13 은 다음해 1월로 wrap (reconcile 의 periodEnd 용).
 */
export function kstMonthStart(year: number, month: number): Date {
  const y = month === 13 ? year + 1 : year;
  const m = month === 13 ? 1 : month;
  return new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
}

/**
 * Inclusive rolling business-date window start.
 *
 * `days=7` means "today's KST businessDate plus the 6 prior KST
 * businessDates" — not today plus 7 prior dates. Use with
 * `businessDate >= kstInclusiveDaysStart(days)`.
 */
export function kstInclusiveDaysStart(days: number, now = new Date()): Date {
  const normalizedDays = Math.max(1, Math.floor(days));
  return new Date(
    kstDayStart(now).getTime() - (normalizedDays - 1) * 86400000,
  );
}
