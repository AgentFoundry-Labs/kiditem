import { Module } from '@nestjs/common';
import { ProfitabilityEvidenceModule } from '../finance/profitability-evidence.module';
import { ProductCollectionRuntimeModule } from './product-collection-runtime.module';
import { MasterProductAbcRepositoryAdapter } from './adapter/out/persistence/master-product-abc.repository.adapter';
import { PRODUCT_ABC_READ_PORT } from './application/port/in/product-abc-read.port';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from './application/port/out/persistence/master-product-abc.repository.port';
import { ProductAbcReadUseCase } from './application/usecase/product-abc-read.usecase';

/**
 * Products' ABC read seam, published on its own so consumers in other owner
 * domains can import it without pulling in the whole Products module (which
 * imports them back). Mirrors `ProfitabilityEvidenceModule`.
 */
@Module({
  imports: [ProfitabilityEvidenceModule, ProductCollectionRuntimeModule],
  providers: [
    MasterProductAbcRepositoryAdapter,
    {
      provide: MASTER_PRODUCT_ABC_REPOSITORY_PORT,
      useExisting: MasterProductAbcRepositoryAdapter,
    },
    ProductAbcReadUseCase,
    { provide: PRODUCT_ABC_READ_PORT, useExisting: ProductAbcReadUseCase },
  ],
  exports: [PRODUCT_ABC_READ_PORT, MASTER_PRODUCT_ABC_REPOSITORY_PORT],
})
export class ProductAbcReadModule {}
