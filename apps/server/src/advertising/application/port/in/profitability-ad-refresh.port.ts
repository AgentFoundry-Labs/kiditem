export const PROFITABILITY_AD_REFRESH_PORT = Symbol(
  'PROFITABILITY_AD_REFRESH_PORT',
);

export type ProfitabilityAdRefreshTarget = Readonly<{
  id: string;
  url: string;
  label: string;
  category: string;
}>;

export type ProfitabilityAdRefreshSlice = Readonly<{
  complete: false;
  sliceId: string;
  startDate: string;
  endDate: string;
  businessDates: readonly string[];
  targets: readonly ProfitabilityAdRefreshTarget[];
  completedDayCount: number;
  totalDayCount: number;
}>;

export type ProfitabilityAdRefreshNext =
  | ProfitabilityAdRefreshSlice
  | Readonly<{
      complete: true;
      coverageStartDate: string;
      coverageEndDate: string;
      completedDayCount: number;
      totalDayCount: number;
    }>;

export type ProfitabilityAdReportRow = Readonly<{
  businessDate: string;
  externalOptionId: string;
  adSpend: number;
  impressions: number;
  clicks: number;
  orders: number;
  conversions: number;
  adRevenue: number;
}>;

export type ProfitabilityAdReportSlice = Readonly<{
  collectionRunId: string;
  advertiserId: string;
  campaignCount: number;
  expectedRowCount: number;
  collectedRowCount: number;
  businessDates: readonly string[];
  rows: readonly ProfitabilityAdReportRow[];
}>;

export interface ProfitabilityAdRefreshPort {
  nextSlice(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<ProfitabilityAdRefreshNext>;

  ingestReportSlice(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    sliceId: string;
    report: ProfitabilityAdReportSlice;
  }): Promise<{
    matchedRowCount: number;
    unmatchedRowCount: number;
    publishedTargetCount: number;
  }>;

  finalizeSlice(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    sliceId: string;
    collectionRunId: string;
    completedTargetCount: number;
  }): Promise<ProfitabilityAdRefreshNext>;

  finalizeRun(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<Extract<ProfitabilityAdRefreshNext, { complete: true }>>;
}
