import { Module } from '@nestjs/common';
import { ProfitabilityEvidenceModule } from '../finance/profitability-evidence.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MasterProductAbcRepositoryAdapter } from './adapter/out/repository/master-product-abc.repository.adapter';
import { PRODUCT_ABC_READ_PORT } from './application/port/in/product-abc-read.port';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from './application/port/out/repository/master-product-abc.repository.port';
import { ProductAbcReadService } from './application/service/product-abc-read.service';

/**
 * Products' ABC read seam, published on its own so consumers in other owner
 * domains can import it without pulling in the whole Products module (which
 * imports them back). Mirrors `ProfitabilityEvidenceModule`.
 */
@Module({
  imports: [ProfitabilityEvidenceModule, InventoryModule],
  providers: [
    MasterProductAbcRepositoryAdapter,
    {
      provide: MASTER_PRODUCT_ABC_REPOSITORY_PORT,
      useExisting: MasterProductAbcRepositoryAdapter,
    },
    ProductAbcReadService,
    { provide: PRODUCT_ABC_READ_PORT, useExisting: ProductAbcReadService },
  ],
  exports: [PRODUCT_ABC_READ_PORT, MASTER_PRODUCT_ABC_REPOSITORY_PORT],
})
export class ProductAbcReadModule {}
