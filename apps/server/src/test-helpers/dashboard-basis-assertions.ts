import {
  periodBasisMissingDates,
  periodBasisStatus,
  snapshotBasisPartial,
  snapshotBasisStatus,
  type DashboardMetricBasis,
  type DashboardPeriodBasis,
  type DashboardSnapshotBasis,
} from '@kiditem/shared/dashboard';

/**
 * The derived words a spec asserts about a published basis. The wire carries
 * only measured facts, so a test that wants to say "this window is partial"
 * asks the same shared functions a screen does.
 */
type MaybeBasis = DashboardMetricBasis | null | undefined;

function period(basis: MaybeBasis): DashboardPeriodBasis {
  if (basis?.kind !== 'period') throw new Error(`expected a period basis, got ${basis?.kind ?? 'none'}`);
  return basis;
}

function snapshot(basis: MaybeBasis): DashboardSnapshotBasis {
  if (basis?.kind !== 'snapshot') throw new Error(`expected a snapshot basis, got ${basis?.kind ?? 'none'}`);
  return basis;
}

export const periodStatusOf = (basis: MaybeBasis) => periodBasisStatus(period(basis));
export const missingDatesOf = (basis: MaybeBasis) => periodBasisMissingDates(period(basis));
export const snapshotStatusOf = (basis: MaybeBasis) => snapshotBasisStatus(snapshot(basis));
export const snapshotPartialOf = (basis: MaybeBasis) => snapshotBasisPartial(snapshot(basis));
