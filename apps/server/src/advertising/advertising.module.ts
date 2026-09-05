import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertsModule } from "../alerts/alerts.module";
import { AiModule } from "../ai/ai.module";
import { ChannelsModule } from "../channels/channels.module";
import { AdvertisingProfitabilityReadModule } from "./advertising-profitability-read.module";
import { AdvertisingActionsController } from "./adapter/in/http/advertising-actions.controller";
import { AdvertisingCampaignsController } from "./adapter/in/http/advertising-campaigns.controller";
import { AdvertisingConfigController } from "./adapter/in/http/advertising-config.controller";
import { AdvertisingDiagnosticsController } from "./adapter/in/http/advertising-diagnostics.controller";
import { AdvertisingExecutionController } from "./adapter/in/http/advertising-execution.controller";
import { AdvertisingIngestController } from "./adapter/in/http/advertising-ingest.controller";
import { AdvertisingOverviewController } from "./adapter/in/http/advertising-overview.controller";
import { AdvertisingStrategyController } from "./adapter/in/http/advertising-strategy.controller";
import { AdKeywordAgentController } from "./adapter/in/http/ad-keyword-agent.controller";
import { KeywordRankController } from "./adapter/in/http/keyword-rank.controller";
import { KeywordSerpSourceController } from "./adapter/in/http/keyword-serp-source.controller";
import { CompetitorTrackingController } from "./adapter/in/http/competitor-tracking.controller";
import { CompetitorCatalogSourceController } from "./adapter/in/http/competitor-catalog-source.controller";
import { WingTrackedProductController } from "./adapter/in/http/wing-tracked-product.controller";
// adapter/out/repository
import { ScrapeTargetRepositoryAdapter } from "./adapter/out/repository/scrape-target.repository.adapter";
import { AdConfigRepositoryAdapter } from "./adapter/out/repository/ad-config.repository.adapter";
import { AdBenchmarkRepositoryAdapter } from "./adapter/out/repository/ad-benchmark.repository.adapter";
import { AdAccountKpiRepositoryAdapter } from "./adapter/out/repository/ad-account-kpi.repository.adapter";
import { AdListingRepositoryAdapter } from "./adapter/out/repository/ad-listing.repository.adapter";
import { AdCampaignRepositoryAdapter } from "./adapter/out/repository/ad-campaign.repository.adapter";
import { AdActionRepositoryAdapter } from "./adapter/out/repository/ad-action.repository.adapter";
import { AdExecutionRepositoryAdapter } from "./adapter/out/repository/ad-execution.repository.adapter";
import { AdStrategyContextRepositoryAdapter } from "./adapter/out/repository/ad-strategy-context.repository.adapter";
import { ChannelScrapeRepositoryAdapter } from "./adapter/out/repository/channel-scrape.repository.adapter";
import { ChannelListingDailyRepositoryAdapter } from "./adapter/out/repository/channel-listing-daily.repository.adapter";
import { ChannelOptionDailyRepositoryAdapter } from "./adapter/out/repository/channel-option-daily.repository.adapter";
import { ChannelTargetDailyRepositoryAdapter } from "./adapter/out/repository/channel-target-daily.repository.adapter";
import { KeywordRankRepositoryAdapter } from "./adapter/out/repository/keyword-rank.repository.adapter";
import { KeywordSerpSourceRepository } from "./adapter/out/repository/keyword-serp-source.repository";
import { WingTrackedProductRepositoryAdapter } from "./adapter/out/repository/wing-tracked-product.repository.adapter";
import { WingTrackedProductSourceAttemptRepositoryAdapter } from "./adapter/out/repository/wing-tracked-product-source-attempt.repository.adapter";
import { CompetitorCatalogSourceAttemptRepositoryAdapter } from "./adapter/out/repository/competitor-catalog-source-attempt.repository.adapter";
import { KiditemStorefrontAdapter } from "./adapter/out/provider/kiditem-storefront.adapter";
import { KeywordRelevanceJudgeAdapter } from "./adapter/out/ai/keyword-relevance-judge.adapter";
import { AdIngestTransactionAdapter } from "./adapter/out/repository/ad-ingest-transaction.adapter";
// application/service + handlers
import { AdvertisingService } from "./application/service/advertising.service";
import { AdCampaignsService } from "./application/service/ad-campaigns.service";
import { AdStrategyService } from "./application/service/ad-strategy.service";
import { AdKeywordAgentService } from "./application/service/ad-keyword-agent.service";
import { AdGradeRulesService } from "./application/service/ad-grade-rules.service";
import { AdBudgetAllocatorService } from "./application/service/ad-budget-allocator.service";
import { AdExposureService } from "./application/service/ad-exposure.service";
import { AdRecommendService } from "./application/service/ad-recommend.service";
import { AdBenchmarkService } from "./application/service/ad-benchmark.service";
import { AdCollectService } from "./application/service/ad-collect.service";
import { AdSyncService } from "./application/service/ad-sync.service";
import { AdActionService } from "./application/service/ad-action.service";
import { AdExecutionService } from "./application/service/ad-execution.service";
import { AdConfigService } from "./application/service/ad-config.service";
import { KeywordRankService } from "./application/service/keyword-rank.service";
import { CompetitorTrackingService } from "./application/service/competitor-tracking.service";
import { CompetitorCatalogSourceAttemptService } from "./application/service/competitor-catalog-source-attempt.service";
import { WingTrackedProductService } from "./application/service/wing-tracked-product.service";
import { CoupangMomentumReadService } from "./application/service/coupang-momentum-read.service";
import { AdCampaignIngestHandler } from "./application/service/ad-campaign-ingest.handler";
import { AdKeywordIngestHandler } from "./application/service/ad-keyword-ingest.handler";
import { CoupangAdsDailyIngestHandler } from "./application/service/coupang-ads-daily-ingest.handler";
import { KeywordRankIngestHandler } from "./application/service/keyword-rank-ingest.handler";
import { WingSalesRankIngestHandler } from "./application/service/wing-sales-rank-ingest.handler";
import { RawScrapeIngestHandler } from "./application/service/raw-scrape-ingest.handler";
import { TrafficIngestHandler } from "./application/service/traffic-ingest.handler";
// transitional facade — grandfathered by AGENTS.md
import { ChannelScrapePersistenceService } from "./services/channel-scrape-persistence.service";
// application/port/out tokens
import { SCRAPE_TARGET_REPOSITORY_PORT } from "./application/port/out/repository/scrape-target.repository.port";
import { AD_CONFIG_REPOSITORY_PORT } from "./application/port/out/repository/ad-config.repository.port";
import { AD_BENCHMARK_REPOSITORY_PORT } from "./application/port/out/repository/ad-benchmark.repository.port";
import { AD_ACCOUNT_KPI_REPOSITORY_PORT } from "./application/port/out/repository/ad-account-kpi.repository.port";
import { AD_LISTING_REPOSITORY_PORT } from "./application/port/out/repository/ad-listing.repository.port";
import { AD_CAMPAIGN_REPOSITORY_PORT } from "./application/port/out/repository/ad-campaign.repository.port";
import { AD_ACTION_REPOSITORY_PORT } from "./application/port/out/repository/ad-action.repository.port";
import { AD_EXECUTION_REPOSITORY_PORT } from "./application/port/out/repository/ad-execution.repository.port";
import { AD_STRATEGY_CONTEXT_REPOSITORY_PORT } from "./application/port/out/repository/ad-strategy-context.repository.port";
import { CHANNEL_SCRAPE_REPOSITORY_PORT } from "./application/port/out/repository/channel-scrape.repository.port";
import { CHANNEL_LISTING_DAILY_REPOSITORY_PORT } from "./application/port/out/repository/channel-listing-daily.repository.port";
import { CHANNEL_OPTION_DAILY_REPOSITORY_PORT } from "./application/port/out/repository/channel-option-daily.repository.port";
import { CHANNEL_TARGET_DAILY_REPOSITORY_PORT } from "./application/port/out/repository/channel-target-daily.repository.port";
import { KEYWORD_RANK_REPOSITORY_PORT } from "./application/port/out/repository/keyword-rank.repository.port";
import { WING_TRACKED_PRODUCT_REPOSITORY_PORT } from "./application/port/out/repository/wing-tracked-product.repository.port";
import { WING_TRACKED_PRODUCT_SOURCE_ATTEMPT_REPOSITORY_PORT } from "./application/port/out/repository/wing-tracked-product-source-attempt.repository.port";
import { COMPETITOR_CATALOG_SOURCE_ATTEMPT_REPOSITORY_PORT } from "./application/port/out/repository/competitor-catalog-source-attempt.repository.port";
import { KEYWORD_RELEVANCE_JUDGE_PORT } from "./application/port/out/cross-domain/keyword-relevance-judge.port";
import { KIDITEM_STOREFRONT_PORT } from "./application/port/out/provider/kiditem-storefront.port";
import { AD_INGEST_TRANSACTION_PORT } from "./application/port/out/transaction/ad-ingest-transaction.port";
import { COUPANG_MOMENTUM_READ_CAPABILITY_PORT } from "./application/port/in/capability/coupang-momentum-read.port";

// `application/port/out/*` ports bound to their adapters via `useExisting`
// so application services depend on tokens, not concrete classes. Mirrors
// the inventory module pattern.
const REPOSITORY_PORT_BINDINGS = [
  {
    provide: SCRAPE_TARGET_REPOSITORY_PORT,
    useExisting: ScrapeTargetRepositoryAdapter,
  },
  {
    provide: AD_CONFIG_REPOSITORY_PORT,
    useExisting: AdConfigRepositoryAdapter,
  },
  {
    provide: AD_BENCHMARK_REPOSITORY_PORT,
    useExisting: AdBenchmarkRepositoryAdapter,
  },
  {
    provide: AD_ACCOUNT_KPI_REPOSITORY_PORT,
    useExisting: AdAccountKpiRepositoryAdapter,
  },
  {
    provide: AD_LISTING_REPOSITORY_PORT,
    useExisting: AdListingRepositoryAdapter,
  },
  {
    provide: AD_CAMPAIGN_REPOSITORY_PORT,
    useExisting: AdCampaignRepositoryAdapter,
  },
  {
    provide: AD_ACTION_REPOSITORY_PORT,
    useExisting: AdActionRepositoryAdapter,
  },
  {
    provide: AD_EXECUTION_REPOSITORY_PORT,
    useExisting: AdExecutionRepositoryAdapter,
  },
  {
    provide: AD_STRATEGY_CONTEXT_REPOSITORY_PORT,
    useExisting: AdStrategyContextRepositoryAdapter,
  },
  {
    provide: CHANNEL_SCRAPE_REPOSITORY_PORT,
    useExisting: ChannelScrapeRepositoryAdapter,
  },
  {
    provide: CHANNEL_LISTING_DAILY_REPOSITORY_PORT,
    useExisting: ChannelListingDailyRepositoryAdapter,
  },
  {
    provide: CHANNEL_OPTION_DAILY_REPOSITORY_PORT,
    useExisting: ChannelOptionDailyRepositoryAdapter,
  },
  {
    provide: CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
    useExisting: ChannelTargetDailyRepositoryAdapter,
  },
  {
    provide: KEYWORD_RANK_REPOSITORY_PORT,
    useExisting: KeywordRankRepositoryAdapter,
  },
  {
    provide: WING_TRACKED_PRODUCT_REPOSITORY_PORT,
    useExisting: WingTrackedProductRepositoryAdapter,
  },
  {
    provide: WING_TRACKED_PRODUCT_SOURCE_ATTEMPT_REPOSITORY_PORT,
    useExisting: WingTrackedProductSourceAttemptRepositoryAdapter,
  },
  {
    provide: COMPETITOR_CATALOG_SOURCE_ATTEMPT_REPOSITORY_PORT,
    useExisting: CompetitorCatalogSourceAttemptRepositoryAdapter,
  },
  { provide: KIDITEM_STOREFRONT_PORT, useExisting: KiditemStorefrontAdapter },
  {
    provide: KEYWORD_RELEVANCE_JUDGE_PORT,
    useExisting: KeywordRelevanceJudgeAdapter,
  },
  {
    provide: AD_INGEST_TRANSACTION_PORT,
    useExisting: AdIngestTransactionAdapter,
  },
];

@Module({
  imports: [
    PrismaModule,
    AlertsModule,
    AiModule,
    ChannelsModule,
    AdvertisingProfitabilityReadModule,
  ],
  controllers: [
    AdvertisingConfigController,
    AdvertisingOverviewController,
    AdvertisingCampaignsController,
    AdvertisingStrategyController,
    AdvertisingDiagnosticsController,
    AdvertisingIngestController,
    AdvertisingActionsController,
    AdvertisingExecutionController,
    AdKeywordAgentController,
    KeywordRankController,
    KeywordSerpSourceController,
    CompetitorTrackingController,
    CompetitorCatalogSourceController,
    WingTrackedProductController,
  ],
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
    KeywordRankRepositoryAdapter,
    KeywordSerpSourceRepository,
    WingTrackedProductRepositoryAdapter,
    WingTrackedProductSourceAttemptRepositoryAdapter,
    CompetitorCatalogSourceAttemptRepositoryAdapter,
    KiditemStorefrontAdapter,
    KeywordRelevanceJudgeAdapter,
    AdIngestTransactionAdapter,
    // application/service
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdKeywordAgentService,
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
    KeywordRankService,
    CompetitorTrackingService,
    CompetitorCatalogSourceAttemptService,
    WingTrackedProductService,
    CoupangMomentumReadService,
    // application/service — ingest handlers
    AdCampaignIngestHandler,
    AdKeywordIngestHandler,
    CoupangAdsDailyIngestHandler,
    KeywordRankIngestHandler,
    WingSalesRankIngestHandler,
    RawScrapeIngestHandler,
    TrafficIngestHandler,
    // services/* — transitional facade (grandfathered)
    ChannelScrapePersistenceService,
    // port bindings
    ...REPOSITORY_PORT_BINDINGS,
    {
      provide: COUPANG_MOMENTUM_READ_CAPABILITY_PORT,
      useExisting: CoupangMomentumReadService,
    },
  ],
  // Published cross-domain read capability (consumed by sourcing).
  exports: [COUPANG_MOMENTUM_READ_CAPABILITY_PORT],
})
export class AdvertisingModule {}
