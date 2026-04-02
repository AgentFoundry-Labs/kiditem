import { Module } from '@nestjs/common';
import { AdvertisingController } from './advertising.controller';
import { AdvertisingService } from './advertising.service';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdStrategyService } from './ad-strategy.service';
import { AdBenchmarkService } from './ad-benchmark.service';
import { AdCollectService } from './ad-collect.service';

@Module({
  controllers: [AdvertisingController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdBenchmarkService,
    AdCollectService,
  ],
})
export class AdvertisingModule {}
