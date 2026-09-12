/**
 * Turns the coverage shapes the dashboard's outgoing ports already publish
 * into the date sets the shared basis algebra consumes, and lifts that algebra
 * over "this window selected no date at all".
 *
 * A resolved period can legitimately select zero business dates (a degenerate
 * or clipped window). There is no calendar range to describe then, so this
 * module answers `null` and the caller simply omits that basis key rather than
 * publishing a basis whose `from`/`to` are not calendar dates.
 *
 * The coverage inputs are declared structurally on purpose: `domain/**` may not
 * depend on `application/**`, so the port interfaces are mirrored by shape and
 * checked at the call site instead of imported.
 */
import {
  buildPeriodBasis,
  buildSnapshotBasis,
  intersectBases,
  type DashboardMetricBasis,
  type DashboardMetricBasisMap,
  type DashboardPeriodBasis,
  type DashboardSnapshotBasis,
} from '@kiditem/shared/dashboard';
import type { DashboardSourceName } from './dashboard-source';

/**
 * Structural mirror of `ProfitSourceCoverage`. `adEvidence` is the
 * Advertising owner's word for the window, and it — not `adDates.length` — is
 * what says whether advertising is an input at all.
 */
export interface ProfitCoverageEvidence {
  requestedDates: readonly string[];
  orderDates: readonly string[];
  adDates: readonly string[];
  adEvidence: string;
}

/** Structural mirror of `TrafficCoverage` / `AdCoverage`. */
export interface WindowCoverageEvidence {
  targetDays: number;
  completedDays: number;
  missingDates: readonly string[];
}

/**
 * True when advertising is an input to this window at all. Under
 * `NOT_APPLIED` the organization has no advertising account, so an empty
 * `adDates` is the complete answer and the basis names orders alone rather
 * than claiming Coupang ads covered the window.
 */
export function adEvidenceApplies(coverage: ProfitCoverageEvidence): boolean {
  return coverage.adEvidence !== 'NOT_APPLIED';
}

/**
 * Advertising dates entering a window's calculation. Under `NOT_APPLIED` every
 * requested date is satisfied without an ad row; otherwise only the dates the
 * owner actually published count, and the rest are a real gap.
 */
export function adEvidenceDates(coverage: ProfitCoverageEvidence): readonly string[] {
  return adEvidenceApplies(coverage) ? coverage.adDates : coverage.requestedDates;
}

/**
 * Dates covered by a Wing/Coupang window aggregate. A source that published
 * nothing covers no date; a source with no coverage detail covers the whole
 * selection it reported for.
 */
export function windowCoverageDates(
  selectedDates: readonly string[],
  coverage: WindowCoverageEvidence | null | undefined,
  collected: boolean,
): readonly string[] {
  if (!collected) return [];
  if (!coverage) return selectedDates;
  const missing = new Set(coverage.missingDates);
  return selectedDates.filter((date) => !missing.has(date));
}

export interface PeriodEvidenceInput {
  /** Business dates the resolved period selected. */
  selectedDates: readonly string[];
  /** Dates with usable evidence, collected zeroes included. */
  includedDates?: Iterable<string>;
  /** Dates whose evidence was read and rejected. */
  invalidDates?: Iterable<string>;
  sources: readonly DashboardSourceName[];
  /** Sources whose required read threw; never a normal empty result. */
  queryFailedSources?: readonly DashboardSourceName[];
  observedAt?: Date | string | null;
}

/**
 * Build one metric's period basis over a resolved period, or `null` when the
 * period selected no date.
 */
export function periodEvidence(input: PeriodEvidenceInput): DashboardPeriodBasis | null {
  const from = input.selectedDates[0];
  const to = input.selectedDates[input.selectedDates.length - 1];
  if (from === undefined || to === undefined) return null;
  return buildPeriodBasis({
    from,
    to,
    includedDates: input.includedDates,
    invalidDates: input.invalidDates,
    sources: input.sources,
    queryFailedSources: input.queryFailedSources,
    observedAt: input.observedAt,
  });
}

export interface SnapshotEvidenceInput {
  /** As-of the owner result actually reached; `null` when it publishes none. */
  asOf?: string | null;
  /** As-of the reader needed — the anchor business date or asked-for cutoff. */
  requiredAsOf?: string | null;
  observedAt?: Date | string | null;
  sources: readonly DashboardSourceName[];
  /** Whether an owner result backs the value; a counted zero still does. */
  measured?: boolean;
  /**
   * Members of the counted population the owner could not measure and left
   * out. A value whose whole population was withheld has an empty computable
   * subset and is reported with `measured: false` instead.
   */
  withheldCount?: number;
}

/**
 * Build the basis for a value that reads a stored owner result rather than
 * aggregating a period — inventory, product counts and ABC, which the
 * amendment keeps out of period aggregation.
 *
 * Unlike `periodEvidence` this never answers `null`: a snapshot with no owner
 * result behind it is publishable as `unavailable`, and publishing that is
 * the point. An omitted key and an absent value are indistinguishable to a
 * reader, so the reason stays on the wire.
 */
export function snapshotEvidence(input: SnapshotEvidenceInput): DashboardSnapshotBasis {
  return buildSnapshotBasis(input);
}

/**
 * Exact date intersection for a two-source metric. A metric whose inputs are
 * not both describable has no basis of its own.
 */
export function intersectEvidence(
  left: DashboardPeriodBasis | null,
  right: DashboardPeriodBasis | null,
): DashboardPeriodBasis | null {
  if (left === null || right === null) return null;
  return intersectBases(left, right);
}

/**
 * Assemble a `metricBasis` map from stable dotted keys, dropping the metrics
 * that have no describable basis. An empty map is omitted entirely so the
 * optional wire field stays absent rather than published as `{}`.
 */
export function metricBasisMap(
  entries: Readonly<Record<string, DashboardMetricBasis | null | undefined>>,
): DashboardMetricBasisMap | undefined {
  const map: DashboardMetricBasisMap = {};
  for (const [key, basis] of Object.entries(entries)) {
    if (basis) map[key] = basis;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}
