export const MASTER_PRODUCT_AD_SPEND_READ_PORT = Symbol(
  'MASTER_PRODUCT_AD_SPEND_READ_PORT',
);

export type MasterProductAdSpendStatus =
  | 'OBSERVED'
  | 'CONFIRMED_ZERO'
  | 'STALE'
  | 'MISSING';

export type MasterProductDailyAdSpend = Readonly<{
  businessDate: Date;
  adSpend: number;
}>;

export type MasterProductAdSpendEvidence = Readonly<{
  masterProductId: string;
  status: MasterProductAdSpendStatus;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  capturedAt: Date | null;
  dailyFacts: readonly MasterProductDailyAdSpend[];
}>;

export interface MasterProductAdSpendReadPort {
  readDailyAdSpend(input: {
    organizationId: string;
    requests: readonly {
      masterProductId: string;
      coverage: readonly { startDate: Date; endDate: Date }[];
    }[];
    asOfDate: Date;
  }): Promise<readonly MasterProductAdSpendEvidence[]>;
}
