import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [AdvertisingModule, ProductCollectionRuntimeModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
