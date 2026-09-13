import type {
  MasterProductContributionAnalytics,
  MasterProductContributionReadInput,
} from '../../in/master-product-contribution-read.port';

/** Finance-owned read seam for actual contribution analytics. */
export const MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT = Symbol(
  'MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT',
);

export type MasterProductContributionRepositoryReadInput = MasterProductContributionReadInput;

export interface MasterProductContributionRepositoryPort {
  readContribution(
    input: MasterProductContributionRepositoryReadInput,
  ): Promise<MasterProductContributionAnalytics>;
}
