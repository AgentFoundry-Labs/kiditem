import type { ProductAbcCostBreakdown } from '@kiditem/shared/product-abc';

export const MASTER_PRODUCT_PROFITABILITY_READ_PORT = Symbol(
  'MASTER_PRODUCT_PROFITABILITY_READ_PORT',
);

export type MasterProductProfitabilityScope =
  | 'ACTIVE_EVALUATION'
  | 'HISTORICAL_CALIBRATION';

export type MasterProductSellpiaStatus = 'READY' | 'STALE' | 'UNMAPPED' | 'MISSING';
export type MasterProductAdvertisingStatus = 'READY' | 'CONFIRMED_ZERO' | 'STALE' | 'MISSING';

export type MonthlyContributionFact = Readonly<{
  yearMonth: string;
  coverageStartDate: Date;
  coverageEndDate: Date;
  coveredDays: number;
  coverageMidpointEpochDay: number;
  revenue: number;
  sellpiaInAmount: number;
  adSpend: number | null;
  costBreakdown: ProductAbcCostBreakdown;
  contributionProfit: number | null;
  negativeCoveredDays: number | null;
  lossGranularity: 'MONTH_INFERRED';
  sourceProductCodes: readonly string[];
  sourceOptionCodes: readonly string[];
}>;

export type MasterProductProfitabilityEvidence = Readonly<{
  masterProductId: string;
  asOfDate: Date;
  firstValidPaidSaleAt: Date | null;
  validPaidOrderDates: readonly Date[];
  paidOrderCount: number;
  observationDays: number;
  eligibilityReached: boolean;
  sellpiaStatus: MasterProductSellpiaStatus;
  adStatus: MasterProductAdvertisingStatus;
  monthlyFacts: readonly MonthlyContributionFact[];
}>;

export interface MasterProductProfitabilityReadPort {
  readMany(input: {
    organizationId: string;
    masterProductIds?: readonly string[];
    asOfDate: Date;
    scope: MasterProductProfitabilityScope;
  }): Promise<readonly MasterProductProfitabilityEvidence[]>;
}
