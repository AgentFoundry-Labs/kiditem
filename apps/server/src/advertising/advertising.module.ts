import { Module } from '@nestjs/common';
import { AdvertisingController } from './adapter/in/http/advertising.controller';
import { AdvertisingService } from './services/advertising.service';
import { AdCampaignsService } from './services/ad-campaigns.service';
import { AdStrategyService } from './services/ad-strategy.service';
import { AdGradeRulesService } from './services/ad-grade-rules.service';
import { AdBudgetAllocatorService } from './services/ad-budget-allocator.service';
import { AdExposureService } from './services/ad-exposure.service';
import { AdRecommendService } from './services/ad-recommend.service';
import { AdBenchmarkService } from './services/ad-benchmark.service';
import { AdCollectService } from './services/ad-collect.service';
import { AdSyncService } from './services/ad-sync.service';
import { AdActionService } from './services/ad-action.service';
import { AdExecutionService } from './services/ad-execution.service';
import { AdConfigService } from './services/ad-config.service';
import { ChannelScrapePersistenceService } from './services/channel-scrape-persistence.service';

@Module({
  controllers: [AdvertisingController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdGradeRulesService,
    AdBudgetAllocatorService,
    AdExposureService,
    AdRecommendService,
    AdBenchmarkService,
    AdCollectService,
    AdSyncService,
    AdActionService,
    AdExecutionService,
    AdConfigService,
    ChannelScrapePersistenceService,
  ],
})
export class AdvertisingModule {}
