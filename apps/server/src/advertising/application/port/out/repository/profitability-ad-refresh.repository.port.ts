import type {
  ProfitabilityAdRefreshTarget,
  ProfitabilityAdReportSlice,
} from '../../in/profitability-ad-refresh.port';

export const PROFITABILITY_AD_REFRESH_REPOSITORY_PORT = Symbol(
  'PROFITABILITY_AD_REFRESH_REPOSITORY_PORT',
);

export type ProfitabilityAdRefreshRun = Readonly<{
  startedAt: Date;
}>;

export type ProfitabilityAdCoverageDay = Readonly<{
  businessDate: Date;
  authoritativeListingCount: number;
  oldestObservedAt: Date;
}>;

export interface ProfitabilityAdRefreshRepositoryPort {
  findClaimedRun(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<ProfitabilityAdRefreshRun | null>;

  countActiveListings(organizationId: string): Promise<number>;

  listTargets(organizationId: string): Promise<readonly ProfitabilityAdRefreshTarget[]>;

  listCoverageDays(input: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<readonly ProfitabilityAdCoverageDay[]>;

  replaceReportSlice(input: {
    organizationId: string;
    collectionRunId: string;
    advertiserId: string;
    startDate: Date;
    endDate: Date;
    report: ProfitabilityAdReportSlice;
    observedAt: Date;
  }): Promise<{
    matchedRowCount: number;
    unmatchedRowCount: number;
    publishedTargetCount: number;
  }>;

  hasCompleteCollectionMarker(input: {
    organizationId: string;
    collectionRunId: string;
    startedAt: Date;
    startDate: string;
    endDate: string;
    expectedTargetCount: number;
  }): Promise<boolean>;

  publishSlice(input: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    observedAt: Date;
  }): Promise<number>;
}
