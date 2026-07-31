import type {
  MasterProductAbcEligibilityReason,
  MasterProductAbcMetric,
  MasterProductAbcPeriodDays,
  MasterProductAbcRiskFlag,
} from '@kiditem/shared/product-abc';

export const MASTER_PRODUCT_ABC_METRIC_READ_PORT = Symbol(
  'MASTER_PRODUCT_ABC_METRIC_READ_PORT',
);

export type MasterProductAbcMetricEvidence = Readonly<{
  masterProductId: string;
  periodMetricValue: number | null;
  rankingValue: number | null;
  grossRevenue: number | null;
  grossCost: number | null;
  grossProfit: number | null;
  observedCompleteMonths: number;
  observationStartMonth: string | null;
  eligible: boolean;
  eligibilityReason: MasterProductAbcEligibilityReason;
  riskFlags: readonly MasterProductAbcRiskFlag[];
}>;

export type MasterProductAbcMetricSnapshot = Readonly<{
  sourceCapturedAt: Date | null;
  evidence: readonly MasterProductAbcMetricEvidence[];
}>;

export interface MasterProductAbcMetricReadPort {
  readMetricSnapshot(input: {
    organizationId: string;
    metric: MasterProductAbcMetric;
    periodDays: MasterProductAbcPeriodDays;
  }): Promise<MasterProductAbcMetricSnapshot>;
}
