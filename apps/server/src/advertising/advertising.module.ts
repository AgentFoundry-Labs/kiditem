import { Module } from '@nestjs/common';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';
import { AdvertisingController } from './adapter/in/http/advertising.controller';
import { AdStrategyAgentController } from './adapter/in/http/ad-strategy-agent.controller';
import { AdvertisingService } from './application/service/advertising.service';
import { AdCampaignsService } from './application/service/ad-campaigns.service';
import { AdStrategyService } from './application/service/ad-strategy.service';
import { AdStrategyAgentService } from './application/service/ad-strategy-agent.service';
import { AdGradeRulesService } from './application/service/ad-grade-rules.service';
import { AdBudgetAllocatorService } from './application/service/ad-budget-allocator.service';
import { AdExposureService } from './application/service/ad-exposure.service';
import { AdRecommendService } from './application/service/ad-recommend.service';
import { AdBenchmarkService } from './application/service/ad-benchmark.service';
import { AdCollectService } from './application/service/ad-collect.service';
import { AdSyncService } from './application/service/ad-sync.service';
import { AdActionService } from './application/service/ad-action.service';
import { AdExecutionService } from './application/service/ad-execution.service';
import { AdConfigService } from './application/service/ad-config.service';
import { ChannelScrapePersistenceService } from './services/channel-scrape-persistence.service';

@Module({
  imports: [AgentOsModule, AutomationModule],
  controllers: [AdvertisingController, AdStrategyAgentController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdStrategyAgentService,
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
