import { Inject, Injectable } from '@nestjs/common';
import {
  type MasterProductContributionReadInput,
  type MasterProductContributionReadPort,
} from '../port/in/master-product-contribution-read.port';
import {
  MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT,
  type MasterProductContributionAnalytics,
  type MasterProductContributionRepositoryPort,
} from '../port/out/repository/master-product-contribution.repository.port';

@Injectable()
export class MasterProductContributionReadService implements MasterProductContributionReadPort {
  constructor(
    @Inject(MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT)
    private readonly repository: MasterProductContributionRepositoryPort,
  ) {}

  readContribution(
    input: MasterProductContributionReadInput,
  ): Promise<MasterProductContributionAnalytics> {
    return this.repository.readContribution(input);
  }
}
