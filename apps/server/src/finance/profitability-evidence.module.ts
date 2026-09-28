import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { Module } from '@nestjs/common';
import { SellpiaProfitabilitySourceModule } from '../analytics/sellpia-product-sales/sellpia-profitability-source.module';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from './application/port/in/master-product-profitability-read.port';
import { MasterProductProfitabilityReadService } from './application/service/master-product-profitability-read.service';

@Module({
  imports: [SellpiaProfitabilitySourceModule, ProductCollectionRuntimeModule],
  providers: [
    MasterProductProfitabilityReadService,
    {
      provide: MASTER_PRODUCT_PROFITABILITY_READ_PORT,
      useExisting: MasterProductProfitabilityReadService,
    },
  ],
  exports: [MASTER_PRODUCT_PROFITABILITY_READ_PORT],
})
export class ProfitabilityEvidenceModule {}
