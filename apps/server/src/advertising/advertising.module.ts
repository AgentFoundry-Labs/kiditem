import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';

import { AdvertisingController } from './adapter/in/http/advertising.controller';
import { AdStrategyAgentController } from './adapter/in/http/ad-strategy-agent.controller';

// adapter/out/repository
import { ScrapeTargetRepositoryAdapter } from './adapter/out/repository/scrape-target.repository.adapter';
import { AdConfigRepositoryAdapter } from './adapter/out/repository/ad-config.repository.adapter';
import { AdBenchmarkRepositoryAdapter } from './adapter/out/repository/ad-benchmark.repository.adapter';
import { AdAccountKpiRepositoryAdapter } from './adapter/out/repository/ad-account-kpi.repository.adapter';
import { AdListingRepositoryAdapter } from './adapter/out/repository/ad-listing.repository.adapter';
import { AdCampaignRepositoryAdapter } from './adapter/out/repository/ad-campaign.repository.adapter';
import { AdActionRepositoryAdapter } from './adapter/out/repository/ad-action.repository.adapter';
import { AdExecutionRepositoryAdapter } from './adapter/out/repository/ad-execution.repository.adapter';
import { AdStrategyContextRepositoryAdapter } from './adapter/out/repository/ad-strategy-context.repository.adapter';
import { ChannelScrapeRepositoryAdapter } from './adapter/out/repository/channel-scrape.repository.adapter';
import { ChannelListingDailyRepositoryAdapter } from './adapter/out/repository/channel-listing-daily.repository.adapter';
import { ChannelOptionDailyRepositoryAdapter } from './adapter/out/repository/channel-option-daily.repository.adapter';
import { ChannelTargetDailyRepositoryAdapter } from './adapter/out/repository/channel-target-daily.repository.adapter';
// adapter/out/automation
import { OperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';

// application/service + handlers
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
import { AdCampaignIngestHandler } from './application/service/ad-campaign-ingest.handler';
import { CoupangAdsDailyIngestHandler } from './application/service/coupang-ads-daily-ingest.handler';
import { RawScrapeIngestHandler } from './application/service/raw-scrape-ingest.handler';
import { TrafficIngestHandler } from './application/service/traffic-ingest.handler';

// transitional facade — grandfathered by AGENTS.md
import { ChannelScrapePersistenceService } from './services/channel-scrape-persistence.service';

// application/port/out tokens
import { SCRAPE_TARGET_REPOSITORY_PORT } from './application/port/out/scrape-target.repository.port';
import { AD_CONFIG_REPOSITORY_PORT } from './application/port/out/ad-config.repository.port';
import { AD_BENCHMARK_REPOSITORY_PORT } from './application/port/out/ad-benchmark.repository.port';
import { AD_ACCOUNT_KPI_REPOSITORY_PORT } from './application/port/out/ad-account-kpi.repository.port';
import { AD_LISTING_REPOSITORY_PORT } from './application/port/out/ad-listing.repository.port';
import { AD_CAMPAIGN_REPOSITORY_PORT } from './application/port/out/ad-campaign.repository.port';
import { AD_ACTION_REPOSITORY_PORT } from './application/port/out/ad-action.repository.port';
import { AD_EXECUTION_REPOSITORY_PORT } from './application/port/out/ad-execution.repository.port';
import { AD_STRATEGY_CONTEXT_REPOSITORY_PORT } from './application/port/out/ad-strategy-context.repository.port';
import { CHANNEL_SCRAPE_REPOSITORY_PORT } from './application/port/out/channel-scrape.repository.port';
import { CHANNEL_LISTING_DAILY_REPOSITORY_PORT } from './application/port/out/channel-listing-daily.repository.port';
import { CHANNEL_OPTION_DAILY_REPOSITORY_PORT } from './application/port/out/channel-option-daily.repository.port';
import { CHANNEL_TARGET_DAILY_REPOSITORY_PORT } from './application/port/out/channel-target-daily.repository.port';
import { OPERATION_ALERT_PORT } from './application/port/out/operation-alert.port';

// `application/port/out/*` ports bound to their adapters via `useExisting`
// so application services depend on tokens, not concrete classes. Mirrors
// the inventory module pattern.
const REPOSITORY_PORT_BINDINGS = [
  { provide: SCRAPE_TARGET_REPOSITORY_PORT, useExisting: ScrapeTargetRepositoryAdapter },
  { provide: AD_CONFIG_REPOSITORY_PORT, useExisting: AdConfigRepositoryAdapter },
  { provide: AD_BENCHMARK_REPOSITORY_PORT, useExisting: AdBenchmarkRepositoryAdapter },
  { provide: AD_ACCOUNT_KPI_REPOSITORY_PORT, useExisting: AdAccountKpiRepositoryAdapter },
  { provide: AD_LISTING_REPOSITORY_PORT, useExisting: AdListingRepositoryAdapter },
  { provide: AD_CAMPAIGN_REPOSITORY_PORT, useExisting: AdCampaignRepositoryAdapter },
  { provide: AD_ACTION_REPOSITORY_PORT, useExisting: AdActionRepositoryAdapter },
  { provide: AD_EXECUTION_REPOSITORY_PORT, useExisting: AdExecutionRepositoryAdapter },
  { provide: AD_STRATEGY_CONTEXT_REPOSITORY_PORT, useExisting: AdStrategyContextRepositoryAdapter },
  { provide: CHANNEL_SCRAPE_REPOSITORY_PORT, useExisting: ChannelScrapeRepositoryAdapter },
  { provide: CHANNEL_LISTING_DAILY_REPOSITORY_PORT, useExisting: ChannelListingDailyRepositoryAdapter },
  { provide: CHANNEL_OPTION_DAILY_REPOSITORY_PORT, useExisting: ChannelOptionDailyRepositoryAdapter },
  { provide: CHANNEL_TARGET_DAILY_REPOSITORY_PORT, useExisting: ChannelTargetDailyRepositoryAdapter },
  { provide: OPERATION_ALERT_PORT, useExisting: OperationAlertAdapter },
];

@Module({
  imports: [PrismaModule, AgentOsModule, AutomationModule],
  controllers: [AdvertisingController, AdStrategyAgentController],
  providers: [
    // adapter/out/repository
    ScrapeTargetRepositoryAdapter,
    AdConfigRepositoryAdapter,
    AdBenchmarkRepositoryAdapter,
    AdAccountKpiRepositoryAdapter,
    AdListingRepositoryAdapter,
    AdCampaignRepositoryAdapter,
    AdActionRepositoryAdapter,
    AdExecutionRepositoryAdapter,
    AdStrategyContextRepositoryAdapter,
    ChannelScrapeRepositoryAdapter,
    ChannelListingDailyRepositoryAdapter,
    ChannelOptionDailyRepositoryAdapter,
    ChannelTargetDailyRepositoryAdapter,
    // adapter/out/automation
    OperationAlertAdapter,
    // application/service
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
    // application/service — ingest handlers
    AdCampaignIngestHandler,
    CoupangAdsDailyIngestHandler,
    RawScrapeIngestHandler,
    TrafficIngestHandler,
    // services/* — transitional facade (grandfathered)
    ChannelScrapePersistenceService,
    // port bindings
    ...REPOSITORY_PORT_BINDINGS,
  ],
})
export class AdvertisingModule {}
