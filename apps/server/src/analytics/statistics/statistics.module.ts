import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [AdvertisingModule, InventoryModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
