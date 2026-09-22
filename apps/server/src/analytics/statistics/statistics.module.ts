import { AiListingContentQueryModule } from '../../ai/ai-listing-content-query.module';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [AiListingContentQueryModule, ChannelCatalogModule, AdvertisingModule, ProductCollectionRuntimeModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
