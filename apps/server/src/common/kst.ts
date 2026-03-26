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
