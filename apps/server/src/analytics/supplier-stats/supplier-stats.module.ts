import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { Module } from '@nestjs/common';
import { SupplierStatsController } from './supplier-stats.controller';
import { SupplierStatsService } from './supplier-stats.service';

@Module({
  imports: [ProductCollectionRuntimeModule],
  controllers: [SupplierStatsController],
  providers: [SupplierStatsService],
})
export class SupplierStatsModule {}
