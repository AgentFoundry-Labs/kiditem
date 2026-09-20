import { InventoryModule } from '../../inventory/inventory.module';
import { Module } from '@nestjs/common';
import { SupplierStatsController } from './supplier-stats.controller';
import { SupplierStatsService } from './supplier-stats.service';

@Module({
  imports: [InventoryModule],
  controllers: [SupplierStatsController],
  providers: [SupplierStatsService],
})
export class SupplierStatsModule {}
