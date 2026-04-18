import { Module } from '@nestjs/common';
import { AdvertisingController } from './controllers/advertising.controller';
import { AdvertisingService } from './services/advertising.service';
import { AdCampaignsService } from './services/ad-campaigns.service';
import { AdStrategyService } from './services/ad-strategy.service';
import { AdBenchmarkService } from './services/ad-benchmark.service';
import { AdCollectService } from './services/ad-collect.service';
import { AdSyncService } from './services/ad-sync.service';
import { AdActionService } from './services/ad-action.service';
import { AdExecutionService } from './services/ad-execution.service';
import { AdConfigService } from './services/ad-config.service';

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
    AdConfigService,
  ],
})
export class AdvertisingModule {}
