import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { Module } from '@nestjs/common';
import { AlertsModule } from '../../alerts/alerts.module';
import { SELLPIA_PROFITABILITY_SOURCE_READ_PORT } from '../application/port/in/sellpia-profitability-source-read.port';
import { SellpiaProfitabilitySourceService } from './sellpia-profitability-source.service';

@Module({
  imports: [AlertsModule, ProductCollectionRuntimeModule],
  providers: [
    SellpiaProfitabilitySourceService,
    { provide: SELLPIA_PROFITABILITY_SOURCE_READ_PORT, useExisting: SellpiaProfitabilitySourceService },
  ],
  exports: [SellpiaProfitabilitySourceService, SELLPIA_PROFITABILITY_SOURCE_READ_PORT],
})
export class SellpiaProfitabilitySourceModule {}
