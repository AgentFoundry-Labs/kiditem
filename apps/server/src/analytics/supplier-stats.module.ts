import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { Module } from '@nestjs/common';
import { SupplierStatsController } from './adapter/in/http/supplier-stats/supplier-stats.controller';
import { SupplierStatsService } from './application/service/supplier-stats/supplier-stats.service';

@Module({
  imports: [ChannelCatalogModule, ProductCollectionRuntimeModule],
  controllers: [SupplierStatsController],
  providers: [SupplierStatsService],
})
export class SupplierStatsModule {}
