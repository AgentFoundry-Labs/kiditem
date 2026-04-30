import { Module } from '@nestjs/common';
import { SupplierStatsController } from './supplier-stats.controller';
import { SupplierStatsService } from './supplier-stats.service';

@Module({
  controllers: [SupplierStatsController],
  providers: [SupplierStatsService],
})
export class SupplierStatsModule {}
