/**
 * Dashboard evidence algebra — the single constructor set for the calculation
 * bases declared in `schemas/dashboard.ts`.
 *
 * The 2026-09-10 dashboard partial-aggregation amendment requires every
 * displayed value to expose an unambiguous basis: the selected range, the
 * dates actually included, the dates missing, which sources answered, and
 * whether a required read failed. Those fields are not independent — status,
 * `partial`, the included/missing partition, `invalid ⊆ missing`, sorting and
 * uniqueness are all functions of the date sets a producer measured.
 *
 * They are therefore *derived here and never passed*. A producer supplies the
 * evidence it actually observed; every cross-field invariant the wire contract
 * documents holds by construction, which is why the schema itself carries no
 * cross-field refinement. Re-asserting a derived invariant on a payload this
 * module just computed would only turn a producer bug into a hard client-side
 * parse failure of the whole card.
 *
 * This computes the contract, not business policy: which dates a source
 * covers is decided by the owner domain that read it.
 */
import type {
  DashboardComparisonBasis,
  DashboardPeriodBasis,
  DashboardSnapshotBasis,
} from './dashboard.js';

const DAY_MS = 86_400_000;

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
  observedAt?: Date | string | null;
}

/**
 * Strict `YYYY-MM-DD` parse to a UTC-midnight timestamp. Rolled-over inputs
 * such as `2026-02-30` are not calendar dates and return null.
 */
function calendarTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
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

function dateAtOffset(start: number, offset: number): string | null {
  const timestamp = start + offset * DAY_MS;
  if (!Number.isFinite(timestamp) || Math.abs(timestamp) > 8.64e15) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Contiguous ascending calendar dates in `[from, to]`; empty when inverted. */
export function enumerateDashboardDates(from: string, to: string): string[] {
  const start = calendarTimestamp(from);
  const end = calendarTimestamp(to);
  if (start === null || end === null || start > end) return [];
  const days = Math.round((end - start) / DAY_MS) + 1;
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = dateAtOffset(start, offset);
    if (date !== null) dates.push(date);
  }
  return dates;
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

function latestIso(values: readonly (Date | string | null | undefined)[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    const iso = toIsoOrNull(value);
    if (iso === null) return latest;
    if (latest === null) return iso;
    return Date.parse(iso) > Date.parse(latest) ? iso : latest;
  }, null);
}

/**
 * Status is a function of the measured evidence:
 * - no included date + a failed required read → `unverified`;
 * - no included date otherwise → `empty` (an empty computable subset);
 * - every selected date included → `complete`;
 * - anything else → `partial`, which is also what `partial` means.
 */
function derivePeriodStatus(
  includedDays: number,
  targetDays: number,
  queryFailedCount: number,
): DashboardPeriodBasis['status'] {
  if (includedDays === 0) return queryFailedCount > 0 ? 'unverified' : 'empty';
  return includedDays === targetDays ? 'complete' : 'partial';
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
  const included = new Set(includedDates);
  const missingDates = targetDates.filter((date) => !included.has(date));
  const queryFailedSources = uniqueInOrder(input.queryFailedSources);
  const status = derivePeriodStatus(
    includedDates.length,
    targetDates.length,
    queryFailedSources.length,
  );

  return {
    kind: 'period',
    from: input.from,
    to: input.to,
    targetDays: targetDates.length,
    includedDates,
    includedDays: includedDates.length,
    missingDates,
    invalidDates,
    sources: requireSources(input.sources),
    ...(queryFailedSources.length > 0 ? { queryFailedSources } : {}),
    status,
    partial: status === 'partial',
    observedAt: toIsoOrNull(input.observedAt),
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
    observedAt: latestIso([left.observedAt, right.observedAt]),
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
}

/**
 * Snapshot status is a function of the evidence, exactly as period status is:
 * - nothing the owner published → `unavailable`;
 * - published, but no comparable pair of as-of dates → `unknown`;
 * - the result reaches the as-of the reader needed → `current`;
 * - it stops short of it → `stale`.
 *
 * `unknown` is deliberately not `unavailable`: the value is real and stays
 * displayed, and only the confidence in its age is missing.
 */
function deriveSnapshotStatus(
  asOf: string | null,
  requiredAsOf: string | null,
  measured: boolean,
): DashboardSnapshotBasis['status'] {
  if (!measured) return 'unavailable';
  if (asOf === null || requiredAsOf === null) return 'unknown';
  return asOf >= requiredAsOf ? 'current' : 'stale';
}

/**
 * Build one snapshot basis for a value that reads a stored owner result.
 *
 * The dashboard amendment keeps inventory, product counts and ABC out of
 * period aggregation: they carry their actual as-of and source validity
 * instead of an included/missing date partition they never had. This is that
 * constructor — the snapshot counterpart of `buildPeriodBasis`, deriving the
 * same way from what a producer measured rather than taking a status.
 */
export function buildSnapshotBasis(
  input: DashboardSnapshotBasisInput,
): DashboardSnapshotBasis {
  const measured = input.measured ?? true;
  const requiredAsOf = calendarDateOrNull(input.requiredAsOf);
  // An absent owner result has no date to be as-of, so a caller's stale
  // as-of cannot survive `measured: false`.
  const asOf = measured ? calendarDateOrNull(input.asOf) : null;

  return {
    kind: 'snapshot',
    asOf,
    observedAt: measured ? toIsoOrNull(input.observedAt) : null,
    sources: requireSources(input.sources),
    status: deriveSnapshotStatus(asOf, requiredAsOf, measured),
  };
}

/**
 * Narrow a period basis onto one date — the per-day row basis for a trend
 * point or a daily table row. `observedAt` defaults to the parent's; pass a
 * per-date capture time when the producer knows one.
 */
export function narrowToDate(
  basis: DashboardPeriodBasis,
  date: string,
  observedAt?: Date | string | null,
): DashboardPeriodBasis {
  return buildPeriodBasis({
    from: date,
    to: date,
    includedDates: basis.includedDates.includes(date) ? [date] : [],
    invalidDates: basis.invalidDates.includes(date) ? [date] : [],
    sources: basis.sources,
    queryFailedSources: basis.queryFailedSources ?? [],
    observedAt: observedAt === undefined ? basis.observedAt : observedAt,
  });
}

/**
 * Comparison evidence for a current/prior pair. Both calculation bases stay
 * attached, and `matchedOffsets` names the relative day positions that carry
 * usable evidence on *both* sides — a comparison is only as valid as its
 * shared dates. An unverified side is never comparable: a failed read is an
 * error, not a change of zero.
 */
export function buildComparisonBasis(
  current: DashboardPeriodBasis,
  previous: DashboardPeriodBasis,
): DashboardComparisonBasis {
  const currentStart = calendarTimestamp(current.from);
  const previousStart = calendarTimestamp(previous.from);
  const currentIncluded = new Set(current.includedDates);
  const previousIncluded = new Set(previous.includedDates);
  const span = Math.min(current.targetDays, previous.targetDays);
  const matchedOffsets: number[] = [];
  if (currentStart !== null && previousStart !== null) {
    for (let offset = 0; offset < span; offset += 1) {
      const currentDate = dateAtOffset(currentStart, offset);
      const previousDate = dateAtOffset(previousStart, offset);
      if (
        currentDate !== null
        && previousDate !== null
        && currentIncluded.has(currentDate)
        && previousIncluded.has(previousDate)
      ) {
        matchedOffsets.push(offset);
      }
    }
  }

  const unverified = current.status === 'unverified' || previous.status === 'unverified';
  const comparable = matchedOffsets.length > 0 && !unverified;
  const failedSources = uniqueInOrder([
    ...(current.queryFailedSources ?? []),
    ...(previous.queryFailedSources ?? []),
  ]);

  return {
    kind: 'comparison',
    current,
    previous,
    matchedOffsets: comparable ? matchedOffsets : [],
    status: comparable ? 'comparable' : 'unavailable',
    reason: comparable
      ? null
      : failedSources.length > 0
        ? `source read failed: ${failedSources.join(', ')}`
        : 'no shared valid dates',
  };
}
