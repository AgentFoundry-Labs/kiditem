import { Module } from '@nestjs/common';
import { AdvertisingController } from './advertising.controller';
import { AdvertisingService } from './advertising.service';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdStrategyService } from './ad-strategy.service';
import { AdBenchmarkService } from './ad-benchmark.service';
import { AdCollectService } from './ad-collect.service';
import { AdSyncService } from './ad-sync.service';
import { AdActionService } from './ad-action.service';
import { AdExecutionService } from './ad-execution.service';

@Module({
  controllers: [AdvertisingController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdBenchmarkService,
    AdCollectService,
    AdSyncService,
    AdActionService,
    AdExecutionService,
  ],
})
export class AdvertisingModule {}
