import type {
  MasterProductAbcMetric,
  MasterProductAbcPeriodDays,
} from '@kiditem/shared/product-abc';

export const MASTER_PRODUCT_ABC_METRIC_READ_PORT = Symbol(
  'MASTER_PRODUCT_ABC_METRIC_READ_PORT',
);

export type MasterProductAbcMetricEvidence = Readonly<{
  masterProductId: string;
  metricValue: number | null;
  eligible: boolean;
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
