/**
 * Dashboard evidence algebra — the single constructor set for the calculation
 * bases declared in `schemas/dashboard.ts`.
 *
 * Every displayed value exposes an unambiguous basis: the selected range, the
 * dates actually measured, which sources answered, and whether a required read
 * failed. Everything else a reader wants to say about it — the status word,
 * the missing dates, the day count, whether a snapshot is stale or partial —
 * is a function of those facts.
 *
 * Those functions live here, once, and the wire carries only the facts. A
 * producer supplies what it observed through `buildPeriodBasis` /
 * `buildSnapshotBasis`, which normalise it; a consumer, server or web, asks
 * `periodBasisStatus` and friends rather than re-deriving the word beside a
 * value. There is no second place the word is computed and so no second place
 * for it to drift.
 *
 * This computes the contract, not business policy: which dates a source
 * covers is decided by the owner domain that read it.
 */
import type {
  DashboardPeriodBasis,
  DashboardPeriodBasisStatusSchema,
  DashboardSnapshotBasis,
  DashboardSnapshotBasisStatusSchema,
} from './dashboard.js';
import type { z } from 'zod';
import { businessDateKey, datesInclusive, parseBusinessDate } from '../common.js';

export type DashboardPeriodBasisStatus = z.infer<typeof DashboardPeriodBasisStatusSchema>;
export type DashboardSnapshotBasisStatus = z.infer<typeof DashboardSnapshotBasisStatusSchema>;

/** Evidence one producer measured for one metric over one selected range. */
export interface DashboardPeriodBasisInput {
  /** Selected range start, `YYYY-MM-DD`. */
  from: string;
  /** Selected range end, `YYYY-MM-DD`, inclusive. */
  to: string;
  /**
   * Dates carrying usable evidence, including explicitly collected zeroes.
   * Order, duplicates and out-of-range values do not matter; a date also
   * listed as invalid never counts as included.
   */
  includedDates?: Iterable<string>;
  /** Dates whose evidence was read but rejected. Always part of `missing`. */
  invalidDates?: Iterable<string>;
  /** Source names behind the value. At least one; caller order is preserved. */
  sources: Iterable<string>;
  /**
   * Sources whose required read threw. A failure with no usable date makes
   * the basis `unverified`; a failure that still left valid dates stays
   * `partial` and names the failed source.
   */
  queryFailedSources?: Iterable<string>;
}

/**
 * Strict `YYYY-MM-DD` parse to a UTC-midnight timestamp. Rolled-over inputs
 * such as `2026-02-30` are not calendar dates and return null.
 */
function calendarTimestamp(value: string): number | null {
  return parseBusinessDate(value)?.getTime() ?? null;
}

/**
 * Keep only a real `YYYY-MM-DD`. A snapshot's as-of is published on the wire
 * against `DashboardCalendarDateSchema`, so anything else must become `null`
 * — an unparseable as-of is an unknown as-of, not a parse failure of the card.
 */
function calendarDateOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return calendarTimestamp(value) === null ? null : value;
}

/** Contiguous ascending calendar dates in `[from, to]`; empty when inverted. */
export function enumerateDashboardDates(from: string, to: string): string[] {
  const start = calendarTimestamp(from);
  const end = calendarTimestamp(to);
  if (start === null || end === null || start > end) return [];
  return datesInclusive(new Date(start), new Date(end)).map(businessDateKey);
}

function uniqueInOrder(values: Iterable<string> | undefined): string[] {
  if (!values) return [];
  return [...new Set(values)];
}

function sortedInside(values: Iterable<string> | undefined, target: ReadonlySet<string>): string[] {
  return uniqueInOrder(values)
    .filter((value) => target.has(value))
    .sort();
}

/**
 * Source names are contract identity, so an empty list is a producer bug
 * rather than a data state. Failing here — in one place, at construction —
 * keeps a nameless basis from reaching a consumer.
 */
function requireSources(values: Iterable<string>): string[] {
  const sources = uniqueInOrder(values);
  if (sources.length === 0) {
    throw new TypeError('A dashboard basis requires at least one source name');
  }
  return sources;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * The status word for a period basis, a function of the measured evidence:
 * - no included date + a failed required read → `unverified`;
 * - no included date otherwise → `empty` (an empty computable subset);
 * - every selected date included → `complete`;
 * - anything else → `partial`.
 */
export function periodBasisStatus(
  basis: Pick<DashboardPeriodBasis, 'includedDates' | 'targetDays' | 'queryFailedSources'>,
): DashboardPeriodBasisStatus {
  const includedDays = basis.includedDates.length;
  if (includedDays === 0) return (basis.queryFailedSources?.length ?? 0) > 0 ? 'unverified' : 'empty';
  return includedDays === basis.targetDays ? 'complete' : 'partial';
}

/** The selected dates that carry no measurement, ascending. Invalid dates are among them. */
export function periodBasisMissingDates(
  basis: Pick<DashboardPeriodBasis, 'from' | 'to' | 'includedDates'>,
): string[] {
  const included = new Set(basis.includedDates);
  return enumerateDashboardDates(basis.from, basis.to).filter((date) => !included.has(date));
}

/** Build one period basis from the dates a producer actually measured. */
export function buildPeriodBasis(input: DashboardPeriodBasisInput): DashboardPeriodBasis {
  const targetDates = enumerateDashboardDates(input.from, input.to);
  const target = new Set(targetDates);
  const invalidDates = sortedInside(input.invalidDates, target);
  const invalid = new Set(invalidDates);
  // Evidence that was read and rejected is never usable, so an invalid date
  // cannot also be included. That is what keeps `invalid ⊆ missing` true.
  const includedDates = sortedInside(input.includedDates, target)
    .filter((date) => !invalid.has(date));
  const queryFailedSources = uniqueInOrder(input.queryFailedSources);

  return {
    kind: 'period',
    from: input.from,
    to: input.to,
    targetDays: targetDates.length,
    includedDates,
    invalidDates,
    sources: requireSources(input.sources),
    ...(queryFailedSources.length > 0 ? { queryFailedSources } : {}),
  };
}

/**
 * The amendment's exact date intersection for a two-source metric: the value
 * exists only on dates both required sources covered. Sources and
 * query failures union so a failed input stays visible, the selected range
 * narrows to the overlap of the inputs' ranges, and any date rejected by one
 * source stays rejected for the combination.
 */
export function intersectBases(
  left: DashboardPeriodBasis,
  right: DashboardPeriodBasis,
): DashboardPeriodBasis {
  const rightIncluded = new Set(right.includedDates);

  return buildPeriodBasis({
    from: left.from > right.from ? left.from : right.from,
    to: left.to < right.to ? left.to : right.to,
    includedDates: left.includedDates.filter((date) => rightIncluded.has(date)),
    invalidDates: [...left.invalidDates, ...right.invalidDates],
    sources: [...left.sources, ...right.sources],
    queryFailedSources: [
      ...(left.queryFailedSources ?? []),
      ...(right.queryFailedSources ?? []),
    ],
  });
}

/** Evidence behind one stored-owner-result value read at one point in time. */
export interface DashboardSnapshotBasisInput {
  /**
   * The as-of calendar date of the owner result actually read. A live
   * current-state count is as-of the business date it was read on; a stored
   * evaluation is as-of the cutoff the owner really reached, which the
   * historical-evidence amendment requires to stay separate from the desired
   * cutoff. `null` (or a non-calendar string) when the owner publishes none.
   */
  asOf?: string | null;
  /**
   * The as-of the reader needed — normally the request anchor's business
   * date, or the cutoff the reader asked the owner to evaluate through. A
   * stored result that stops short of it is `stale`, i.e. "latest data not
   * applied", which is a retained valid value and not an error.
   */
  requiredAsOf?: string | null;
  /** When the owner result behind the value was captured. */
  observedAt?: Date | string | null;
  /** Source names behind the value. At least one; caller order is preserved. */
  sources: Iterable<string>;
  /**
   * Whether an owner result backs the value at all. A counted zero is still
   * measured — only a genuinely absent owner result is `unavailable`, and an
   * absent result has no as-of to publish. Defaults to `true` because a
   * producer that read something is the normal case.
   */
  measured?: boolean;
  /**
   * Members of the population this value names that could not be measured and
   * were therefore left out of it — the snapshot counterpart of a period's
   * missing dates. A count over a population with a hole in it is a real
   * number over a smaller set, not a smaller number, so the hole travels
   * beside the value rather than silently shrinking it. Defaults to `0`: a
   * producer that withheld nothing counted everything.
   */
  withheldCount?: number;
}

/**
 * The age word for a snapshot basis, a function of the evidence exactly as the
 * period word is:
 * - nothing the owner published → `unavailable`;
 * - published, but no comparable pair of as-of dates → `unknown`;
 * - the result reaches the as-of the reader needed → `current`;
 * - it stops short of it → `stale`.
 *
 * `unknown` is deliberately not `unavailable`: the value is real and stays
 * displayed, and only the confidence in its age is missing.
 */
export function snapshotBasisStatus(
  basis: Pick<DashboardSnapshotBasis, 'asOf' | 'requiredAsOf' | 'measured'>,
): DashboardSnapshotBasisStatus {
  if (!basis.measured) return 'unavailable';
  if (basis.asOf === null || basis.requiredAsOf === null) return 'unknown';
  return basis.asOf >= basis.requiredAsOf ? 'current' : 'stale';
}

/**
 * Whether a snapshot counted only part of the population it names. A value
 * that does not exist is never called partly counted, so an unmeasured basis
 * with withheld members reads as the reason there is no value instead.
 */
export function snapshotBasisPartial(
  basis: Pick<DashboardSnapshotBasis, 'measured' | 'withheldCount'>,
): boolean {
  return basis.measured && basis.withheldCount > 0;
}

/** A withheld population is a count of members, so anything else is none. */
function withheldMembers(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Build one snapshot basis for a value that reads a stored owner result.
 *
 * Inventory, product counts and ABC stay out of period aggregation: they
 * carry their actual as-of and the as-of the reader needed instead of an
 * included/missing date partition they never had. This is that constructor —
 * the snapshot counterpart of `buildPeriodBasis`, normalising what a producer
 * measured rather than taking a status.
 */
export function buildSnapshotBasis(
  input: DashboardSnapshotBasisInput,
): DashboardSnapshotBasis {
  const measured = input.measured ?? true;
  // An absent owner result has no date to be as-of, so a caller's stale
  // as-of cannot survive `measured: false`.
  const asOf = measured ? calendarDateOrNull(input.asOf) : null;

  return {
    kind: 'snapshot',
    measured,
    asOf,
    requiredAsOf: calendarDateOrNull(input.requiredAsOf),
    observedAt: measured ? toIsoOrNull(input.observedAt) : null,
    sources: requireSources(input.sources),
    // The withheld population survives `measured: false` because it is why
    // there is no value.
    withheldCount: withheldMembers(input.withheldCount),
  };
}

/**
 * Narrow a period basis onto one date — the per-day row basis for a trend
 * point or a daily table row.
 */
export function narrowToDate(
  basis: DashboardPeriodBasis,
  date: string,
): DashboardPeriodBasis {
  return buildPeriodBasis({
    from: date,
    to: date,
    includedDates: basis.includedDates.includes(date) ? [date] : [],
    invalidDates: basis.invalidDates.includes(date) ? [date] : [],
    sources: basis.sources,
    queryFailedSources: basis.queryFailedSources ?? [],
  });
}
