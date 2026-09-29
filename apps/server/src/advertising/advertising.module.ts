import { AiListingContentQueryModule } from '../content/ai-listing-content-query.module';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertsModule } from "../alerts/alerts.module";
import { AiModule } from "../content/ai.module";
import { ChannelsModule } from "../channels/channels.module";
import { AdvertisingActionsController } from "./adapter/in/http/advertising-actions.controller";
import { AdExportController } from "./adapter/in/http/ad-export.controller";
import { AdvertisingCampaignsController } from "./adapter/in/http/advertising-campaigns.controller";
import { AdvertisingConfigController } from "./adapter/in/http/advertising-config.controller";
import { AdvertisingDiagnosticsController } from "./adapter/in/http/advertising-diagnostics.controller";
import { AdvertisingIngestController } from "./adapter/in/http/advertising-ingest.controller";
import { AdvertisingOverviewController } from "./adapter/in/http/advertising-overview.controller";
import { AdvertisingStrategyController } from "./adapter/in/http/advertising-strategy.controller";
import { AdKeywordAgentController } from "./adapter/in/http/ad-keyword-agent.controller";
import { KeywordRankController } from "./adapter/in/http/keyword-rank.controller";
import { WingItemwinnerOperationOwner, WingTrafficOperationOwner } from "./adapter/in/operation/wing-daily-operation-owners";
import { WingItemwinnerOperationRepository } from "./adapter/out/persistence/wing-itemwinner-operation.repository";
import { WING_ITEMWINNER_OPERATION_REPOSITORY_PORT } from "./application/port/out/repository/wing-itemwinner-operation.repository.port";
import { AD_REPORT_OPERATION_REPOSITORY_PORT } from "./application/port/out/repository/ad-report-operation.repository.port";
import { AdReportOperationRepository } from "./adapter/out/persistence/ad-report-operation.repository";
import { AdReportOperationOwner } from "./adapter/in/operation/ad-report-operation-owner";
import { AdActionOperationOwner } from "./adapter/in/operation/ad-action-operation-owner";
import { AdActionOperationRepository } from "./adapter/out/persistence/ad-action-operation.repository";
import { AD_ACTION_OPERATION_REPOSITORY_PORT } from "./application/port/out/repository/ad-action-operation.repository.port";
import { OperationModule } from "../common/operation/operation.module";
import { WingTrafficOperationRepository } from "./adapter/out/persistence/wing-traffic-operation.repository";
import { WingTrafficReadRepository } from "./adapter/out/persistence/wing-traffic-read.repository";
import { WING_TRAFFIC_OPERATION_REPOSITORY_PORT } from "./application/port/out/repository/wing-traffic-operation.repository.port";
import {
  AD_TRAFFIC_READ_PORT,
} from "./application/port/in/ad-traffic-source.port";
import { CompetitorTrackingController } from "./adapter/in/http/competitor-tracking.controller";
import { WingTrackedProductController } from "./adapter/in/http/wing-tracked-product.controller";
// adapter/out/persistence
import { AdConfigRepositoryAdapter } from "./adapter/out/persistence/ad-config.repository";
import { AdBenchmarkRepositoryAdapter } from "./adapter/out/persistence/ad-benchmark.repository";
import { AdListingRepositoryAdapter } from "./adapter/out/persistence/ad-listing.repository";
import { AdCampaignRepositoryAdapter } from "./adapter/out/persistence/ad-campaign.repository";
import { AdActionRepositoryAdapter } from "./adapter/out/persistence/ad-action.repository";
import { AdStrategyContextRepositoryAdapter } from "./adapter/out/persistence/ad-strategy-context.repository";
import { AdvertisingExtensionStatusRepositoryAdapter } from "./adapter/out/persistence/advertising-extension-status.repository";
import { KeywordRankRepositoryAdapter } from "./adapter/out/persistence/keyword-rank.repository";
import { WingTrackedProductRepositoryAdapter } from "./adapter/out/persistence/wing-tracked-product.repository";
import { KiditemStorefrontAdapter } from "./adapter/out/provider/kiditem-storefront.adapter";
import { KeywordRelevanceJudgeAdapter } from "./adapter/out/ai/keyword-relevance-judge.adapter";
// adapter/in/operation — 실행 계약 kind(ADR-0025, KID-362)
import { WingTrackedProductsOperationOwner } from "./adapter/in/operation/wing-tracked-products-operation-owner";
import { WingRankOperationOwner } from "./adapter/in/operation/wing-rank-operation-owner";
import { KeywordSerpOperationOwner } from "./adapter/in/operation/keyword-serp-operation-owner";
import { CompetitorSellerIdentityOperationOwner } from "./adapter/in/operation/competitor-seller-identity-operation-owner";
import { CompetitorCatalogOperationOwner } from "./adapter/in/operation/competitor-catalog-operation-owner";
// application/service + handlers
import { AdvertisingService } from "./application/service/advertising.service";
import { AdExportService } from "./application/service/ad-export.service";
import { AdCampaignsService } from "./application/service/ad-campaigns.service";
import { AdStrategyService } from "./application/service/ad-strategy.service";
import { AdKeywordAgentService } from "./application/service/ad-keyword-agent.service";
import { AdGradeRulesService } from "./application/service/ad-grade-rules.service";
import { AdBudgetAllocatorService } from "./application/service/ad-budget-allocator.service";
import { AdRecommendService } from "./application/service/ad-recommend.service";
import { AdBenchmarkService } from "./application/service/ad-benchmark.service";
import { AdvertisingExtensionService } from "./application/service/advertising-extension.service";
import { AdActionService } from "./application/service/ad-action.service";
import { AdConfigService } from "./application/service/ad-config.service";
import { KeywordRankService } from "./application/service/keyword-rank.service";
import { CompetitorTrackingService } from "./application/service/competitor-tracking.service";
import { WingTrackedProductService } from "./application/service/wing-tracked-product.service";
import { CoupangMomentumReadService } from "./application/service/coupang-momentum-read.service";
import { KeywordRankIngestHandler } from "./application/service/keyword-rank-ingest.handler";
import { WingSalesRankIngestHandler } from "./application/service/wing-sales-rank-ingest.handler";
// application/port/out tokens
import { AD_CONFIG_REPOSITORY_PORT } from "./application/port/out/repository/ad-config.repository.port";
import { AD_BENCHMARK_REPOSITORY_PORT } from "./application/port/out/repository/ad-benchmark.repository.port";
import { AD_LISTING_REPOSITORY_PORT } from "./application/port/out/repository/ad-listing.repository.port";
import { AD_CAMPAIGN_REPOSITORY_PORT } from "./application/port/out/repository/ad-campaign.repository.port";
import { AD_ACTION_REPOSITORY_PORT } from "./application/port/out/repository/ad-action.repository.port";
import { AD_STRATEGY_CONTEXT_REPOSITORY_PORT } from "./application/port/out/repository/ad-strategy-context.repository.port";
import { ADVERTISING_EXTENSION_STATUS_REPOSITORY_PORT } from "./application/port/out/repository/advertising-extension-status.repository.port";
import { KEYWORD_RANK_REPOSITORY_PORT } from "./application/port/out/repository/keyword-rank.repository.port";
import { WING_TRACKED_PRODUCT_REPOSITORY_PORT } from "./application/port/out/repository/wing-tracked-product.repository.port";
import { KEYWORD_RELEVANCE_JUDGE_PORT } from "./application/port/out/cross-domain/keyword-relevance-judge.port";
import { KIDITEM_STOREFRONT_PORT } from "./application/port/out/provider/kiditem-storefront.port";
import { COUPANG_MOMENTUM_READ_CAPABILITY_PORT } from "./application/port/in/ledger/coupang-momentum-read.port";
import { ADVERTISING_HUB_READ_PORT } from "./application/port/in/advertising-hub-read.port";
import { AdvertisingLedgerReadModule } from "./advertising-ledger-read.module";
import { AD_LEDGER_READ_REPOSITORY_PORT } from "./application/port/out/repository/ad-ledger-read.repository.port";
import { AdLedgerReadPersistenceAdapter } from "./adapter/out/persistence/ad-ledger-read.repository";

// `application/port/out/*` ports bound to their adapters via `useExisting`
// so application services depend on tokens, not concrete classes. Mirrors
// the inventory module pattern.
const REPOSITORY_PORT_BINDINGS = [
  {
    provide: AD_CONFIG_REPOSITORY_PORT,
    useExisting: AdConfigRepositoryAdapter,
  },
  {
    provide: AD_BENCHMARK_REPOSITORY_PORT,
    useExisting: AdBenchmarkRepositoryAdapter,
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
    provide: AD_STRATEGY_CONTEXT_REPOSITORY_PORT,
    useExisting: AdStrategyContextRepositoryAdapter,
  },
  {
    provide: ADVERTISING_EXTENSION_STATUS_REPOSITORY_PORT,
    useExisting: AdvertisingExtensionStatusRepositoryAdapter,
  },
  {
    provide: KEYWORD_RANK_REPOSITORY_PORT,
    useExisting: KeywordRankRepositoryAdapter,
  },
  {
    provide: WING_TRACKED_PRODUCT_REPOSITORY_PORT,
    useExisting: WingTrackedProductRepositoryAdapter,
  },
  { provide: KIDITEM_STOREFRONT_PORT, useExisting: KiditemStorefrontAdapter },
  {
    provide: KEYWORD_RELEVANCE_JUDGE_PORT,
    useExisting: KeywordRelevanceJudgeAdapter,
  },
];

@Module({
  imports: [AiListingContentQueryModule, ChannelCatalogModule,
    ProductCollectionRuntimeModule,
    PrismaModule,
    AlertsModule,
    AiModule,
    ChannelsModule,
    OperationModule,
    AdvertisingLedgerReadModule,
  ],
  controllers: [
    AdvertisingConfigController,
    AdvertisingOverviewController,
    AdvertisingCampaignsController,
    AdvertisingStrategyController,
    AdvertisingDiagnosticsController,
    AdvertisingIngestController,
    AdvertisingActionsController,
    AdExportController,
    AdKeywordAgentController,
    KeywordRankController,
    CompetitorTrackingController,
    WingTrackedProductController,
  ],
  providers: [
    // adapter/out/persistence
    AdConfigRepositoryAdapter,
    AdBenchmarkRepositoryAdapter,
    AdListingRepositoryAdapter,
    AdCampaignRepositoryAdapter,
    AdActionRepositoryAdapter,
    AdStrategyContextRepositoryAdapter,
    AdvertisingExtensionStatusRepositoryAdapter,
    KeywordRankRepositoryAdapter,
    // Wing 일별 사실 실행 kind(ADR-0025, KID-362)
    WingItemwinnerOperationRepository,
    {
      provide: WING_ITEMWINNER_OPERATION_REPOSITORY_PORT,
      useExisting: WingItemwinnerOperationRepository,
    },
    WingItemwinnerOperationOwner,
    WingTrafficOperationRepository,
    {
      provide: WING_TRAFFIC_OPERATION_REPOSITORY_PORT,
      useExisting: WingTrafficOperationRepository,
    },
    WingTrafficOperationOwner,
    // 광고 보고서 실행 kind(ADR-0025, KID-371)
    AdReportOperationRepository,
    {
      provide: AD_REPORT_OPERATION_REPOSITORY_PORT,
      useExisting: AdReportOperationRepository,
    },
    AdLedgerReadPersistenceAdapter,
    {
      provide: AD_LEDGER_READ_REPOSITORY_PORT,
      useExisting: AdLedgerReadPersistenceAdapter,
    },
    AdReportOperationOwner,
    // 광고 액션 실행 kind(ADR-0025, KID-386)
    AdActionOperationRepository,
    {
      provide: AD_ACTION_OPERATION_REPOSITORY_PORT,
      useExisting: AdActionOperationRepository,
    },
    AdActionOperationOwner,
    WingTrafficReadRepository,
    {
      provide: AD_TRAFFIC_READ_PORT,
      useExisting: WingTrafficReadRepository,
    },
    WingTrackedProductRepositoryAdapter,
    KiditemStorefrontAdapter,
    KeywordRelevanceJudgeAdapter,
    // adapter/in/operation
    WingTrackedProductsOperationOwner,
    WingRankOperationOwner,
    KeywordSerpOperationOwner,
    CompetitorSellerIdentityOperationOwner,
    CompetitorCatalogOperationOwner,
    // application/service
    AdvertisingService,
    AdExportService,
    AdCampaignsService,
    AdStrategyService,
    AdKeywordAgentService,
    AdGradeRulesService,
    AdBudgetAllocatorService,
    AdRecommendService,
    AdBenchmarkService,
    AdvertisingExtensionService,
    AdActionService,
    AdConfigService,
    KeywordRankService,
    CompetitorTrackingService,
    WingTrackedProductService,
    CoupangMomentumReadService,
    // application/service — source-owner support
    KeywordRankIngestHandler,
    WingSalesRankIngestHandler,
    // port bindings
    ...REPOSITORY_PORT_BINDINGS,
    {
      provide: COUPANG_MOMENTUM_READ_CAPABILITY_PORT,
      useExisting: CoupangMomentumReadService,
    },
    {
      provide: ADVERTISING_HUB_READ_PORT,
      useExisting: AdvertisingService,
    },
  ],
  // Published cross-domain read capability (consumed by sourcing).
  exports: [
    COUPANG_MOMENTUM_READ_CAPABILITY_PORT,
    AD_TRAFFIC_READ_PORT,
    ADVERTISING_HUB_READ_PORT,
    AdvertisingLedgerReadModule,
  ],
})
export class AdvertisingModule {}
