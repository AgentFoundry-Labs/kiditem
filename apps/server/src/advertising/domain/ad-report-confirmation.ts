import { shiftBusinessDateKey } from '../../common/kst';

/**
 * A Coupang ads-center collection's total spend for one business date, or
 * `undefined` for a date it did not observe on its own. A day it observed
 * without any spend row is `0`.
 */
export type ObservedDaySpend = (businessDate: string) => number | undefined;

/**
 * The last business date a Coupang ads-center collection confirms.
 *
 * Coupang keeps reporting a day's spend for hours after KST midnight, and until
 * it has, the day reads as zero. A collection therefore confirms its closed day
 * only once it saw spend on it, or saw no spend on the day before either (the
 * account was not advertising). A zero closed day after a day with spend, a
 * closed day it never observed, or a zero it cannot compare with the day before
 * is held: the confirmed window ends the day before, and a later collection
 * that sees the spend confirms the day. A collection that ends before its
 * closed day is already final, and one that observes only a range total cannot
 * see a single day, so neither is held.
 */
export function confirmedAdReportEnd(input: Readonly<{
  /** The last business date the collection requested (YYYY-MM-DD). */
  requestedEnd: string;
  /** The closed day the collection was admitted on (YYYY-MM-DD). */
  closedDay: string;
  /** Per-day totals, or `null` for a collection that observes only a range total. */
  daySpend: ObservedDaySpend | null;
}>): string {
  if (input.requestedEnd < input.closedDay || input.daySpend === null) return input.requestedEnd;
  const closedDaySpend = input.daySpend(input.requestedEnd);
  if (closedDaySpend !== undefined && closedDaySpend > 0) return input.requestedEnd;
  const dayBefore = shiftBusinessDateKey(input.requestedEnd, -1);
  return closedDaySpend === 0 && input.daySpend(dayBefore) === 0 ? input.requestedEnd : dayBefore;
}

/** The ends one account's newest complete collection requested and confirmed. */
export type AdCollectionEnds = Readonly<{ requestedEnd: string; confirmedEnd: string }>;

/**
 * The latest business date a reader may require the Coupang ads source to have
 * reached on `closedDay`. It is the closed day, unless every active account's
 * newest complete collection requested the closed day and held it; then it is
 * the earliest of their confirmed ends. An account with no complete collection,
 * one whose newest collection predates the closed day, or one that confirmed
 * the closed day keeps the requirement at the closed day.
 */
export function adReportEvidenceCutoff(input: Readonly<{
  closedDay: string;
  /** Each active account's newest complete collection, or `null` for an account with none. */
  collections: readonly (AdCollectionEnds | null)[];
}>): string {
  let cutoff: string | null = null;
  for (const collection of input.collections) {
    if (collection === null
      || collection.requestedEnd < input.closedDay
      || collection.confirmedEnd >= input.closedDay) {
      return input.closedDay;
    }
    if (cutoff === null || collection.confirmedEnd < cutoff) cutoff = collection.confirmedEnd;
  }
  return cutoff ?? input.closedDay;
}
