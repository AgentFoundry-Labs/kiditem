import type { ProductAbcContributionAnalytics } from '@kiditem/shared/product-abc';

export const MASTER_PRODUCT_CONTRIBUTION_READ_PORT = Symbol(
  'MASTER_PRODUCT_CONTRIBUTION_READ_PORT',
);

export type MasterProductContributionReadInput = Readonly<{
  organizationId: string;
  basisFromDate: string;
  basisCutoffDate: string;
  sellpiaSourceImportRunId: string | null;
  advertisingSourceImportRunId: string | null;
  /** Response filter only; global denominators and ranks remain unchanged. */
  masterProductIds?: readonly string[];
}>;

export type MasterProductContributionAnalytics = ProductAbcContributionAnalytics;

/** Product-facing read seam. It exposes actual contribution only; no grade or formula. */
export interface MasterProductContributionReadPort {
  readContribution(
    input: MasterProductContributionReadInput,
  ): Promise<MasterProductContributionAnalytics>;
}
