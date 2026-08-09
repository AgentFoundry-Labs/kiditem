import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentOsModule } from "../agent-os/agent-os.module";
import { AiModule } from "../ai/ai.module";
import { AdvertisingModule } from "../advertising/advertising.module";
import { AutomationModule } from "../automation/automation.module";
import { ChannelsModule } from "../channels/channels.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OperationsModule } from "../operations/operations.module";
import { SupplyModule } from "../supply/supply.module";
import { Sourcing1688NewProductModelController } from "./adapter/in/http/sourcing-1688-new-product-model.controller";
import { SourcingCandidateWorkspaceController } from "./adapter/in/http/sourcing-candidate-workspace.controller";
import { MarketShadowSignalController } from "./adapter/in/http/market-shadow-signal.controller";
import { MarketShadowSignalCapabilityAdapter } from "./adapter/in/agent/market-shadow-signal-capability.adapter";
import { SourcingDiscoveryCapabilityAdapter } from "./adapter/in/agent/sourcing-discovery-capability.adapter";
import { SourcingListingPrepCapabilityAdapter } from "./adapter/in/agent/sourcing-listing-prep-capability.adapter";
import { SourcingScrapeUrlCapabilityAdapter } from "./adapter/in/agent/sourcing-scrape-url-capability.adapter";
import { Sourcing1688ImageSearchController } from "./adapter/in/http/sourcing-1688-image-search.controller";
import { Sourcing1688KeywordSearchController } from "./adapter/in/http/sourcing-1688-keyword-search.controller";
import { SourcingAgentRagController } from "./adapter/in/http/sourcing-agent-rag.controller";
import { SourcingExtensionIngestController } from "./adapter/in/http/sourcing-extension-ingest.controller";
import { Sourcing1688TrendExtensionController } from "./adapter/in/http/sourcing-1688-trend-extension.controller";
import { SourcingTiktokCcTrendExtensionController } from "./adapter/in/http/sourcing-tiktok-cc-trend-extension.controller";
import { SourcingLiveCommerceExtensionController } from "./adapter/in/http/sourcing-live-commerce-extension.controller";
import { SourcingKeywordResearchController } from "./adapter/in/http/sourcing-keyword-research.controller";
import { SourcingMarketModelController } from "./adapter/in/http/sourcing-market-model.controller";
import { SourcingRisingProductController } from "./adapter/in/http/sourcing-rising-product.controller";
import { SourcingIntelligenceController } from "./adapter/in/http/sourcing-intelligence.controller";
import { SourcingEntryRecommendationController } from "./adapter/in/http/sourcing-entry-recommendation.controller";
import { SourcingWorkspaceSnapshotController } from "./adapter/in/http/sourcing-workspace-snapshot.controller";
import { SourcingInterestTargetController } from "./adapter/in/http/sourcing-interest-target.controller";
import { TrendCollectionController } from "./adapter/in/http/trend-collection.controller";
import { SourcingTrendOperationHandler } from "./adapter/in/operation/sourcing-trend.operation-handler";
import { LiveCommerceController } from "./adapter/in/http/live-commerce.controller";
import { NaverKeywordResearchService } from "./application/service/naver-keyword-research.service";
import { Sourcing1688NewProductModelService } from "./application/service/sourcing-1688-new-product-model.service";
import { Sourcing1688ImageSearchService } from "./application/service/sourcing-1688-image-search.service";
import { Sourcing1688KeywordSearchService } from "./application/service/sourcing-1688-keyword-search.service";
import { SourcingAgentRagService } from "./application/service/sourcing-agent-rag.service";
import { SourcingMarketModelService } from "./application/service/sourcing-market-model.service";
import { SourcingService } from "./application/service/sourcing.service";
import { SourcingPromotionService } from "./application/service/sourcing-promotion.service";
import { SourcingWorkspaceArchiveService } from "./application/service/sourcing-workspace-archive.service";
import { SourcingAssistantService } from "./application/service/sourcing-assistant.service";
import { SourcingExtensionIngestService } from "./application/service/sourcing-extension-ingest.service";
import { SourcingEntryRecommendationService } from "./application/service/sourcing-entry-recommendation.service";
import { SourcingWorkspaceSnapshotService } from "./application/service/sourcing-workspace-snapshot.service";
import { SourcingShadowSignalService } from "./application/service/sourcing-shadow-signal.service";
import { ProductRegistrationService } from "./application/service/product-registration.service";
import { SourcingScrapeFinalizedBridge } from "./application/service/sourcing-scrape-finalized.bridge";
import { SourcingMarketDiscoveryService } from "./application/service/sourcing-market-discovery.service";
import { SourcingRisingProductService } from "./application/service/sourcing-rising-product.service";
import { SourcingCollectionSourceControlService } from "./application/service/sourcing-collection-source-control.service";
import { SourcingInterestTargetService } from "./application/service/sourcing-interest-target.service";
import { SourcingEvidenceLedgerService } from "./application/service/sourcing-evidence-ledger.service";
import { SourcingLaunchCandidateService } from "./application/service/sourcing-launch-candidate.service";
import { SourcingDecisionBatchService } from "./application/service/sourcing-decision-batch.service";
import { SourcingCollectionCoordinator } from "./application/service/sourcing-collection-coordinator.service";
import { TrendCollectService } from "./application/service/trend-collect.service";
import { TrendQueryService } from "./application/service/trend-query.service";
import { LiveCommerceService } from "./application/service/live-commerce.service";
import { NaverDatalabPopularKeywordAdapter } from "./adapter/out/naver/naver-datalab-popular-keyword.adapter";
import { NaverDatalabTrendAdapter } from "./adapter/out/naver/naver-datalab-trend.adapter";
import { NaverAutocompleteKeywordAdapter } from "./adapter/out/naver/naver-autocomplete-keyword.adapter";
import { NaverSearchAdKeywordAdapter } from "./adapter/out/naver/naver-search-ad-keyword.adapter";
import { SourcingAgentGatewayAdapter } from "./adapter/out/agent/sourcing-agent.gateway.adapter";
import { SourcingAiWorkspaceArchiveAdapter } from "./adapter/out/ai/workspace-archive.adapter";
import { SourcingOperationAlertAdapter } from "./adapter/out/automation/operation-alert.adapter";
import { SourcingCandidateRepositoryAdapter } from "./adapter/out/repository/sourcing-candidate.repository.adapter";
import { SourcingCollectionSourceControlRepositoryAdapter } from "./adapter/out/repository/sourcing-collection-source-control.repository.adapter";
import { SourcingInterestTargetRepositoryAdapter } from "./adapter/out/repository/sourcing-interest-target.repository.adapter";
import { SourcingEvidenceLedgerRepositoryAdapter } from "./adapter/out/repository/sourcing-evidence-ledger.repository.adapter";
import { SourcingLaunchCandidateRepositoryAdapter } from "./adapter/out/repository/sourcing-launch-candidate.repository.adapter";
import { SourcingDecisionBatchRepositoryAdapter } from "./adapter/out/repository/sourcing-decision-batch.repository.adapter";
import { SourcingCollectionRepositoryAdapter } from "./adapter/out/repository/sourcing-collection.repository.adapter";
import { SourcingWorkspaceSnapshotRepositoryAdapter } from "./adapter/out/repository/sourcing-workspace-snapshot.repository.adapter";
import { MarketShadowSnapshotRepositoryAdapter } from "./adapter/out/repository/market-shadow-snapshot.repository.adapter";
import { TrendCollectionRepositoryAdapter } from "./adapter/out/repository/trend-collection.repository.adapter";
import { LiveCommerceRepositoryAdapter } from "./adapter/out/repository/live-commerce.repository.adapter";
import { ProductPreparationRepositoryAdapter } from "./adapter/out/repository/product-preparation.repository.adapter";
import { ChannelProductRegistrationAdapter } from "./adapter/out/channels/channel-product-registration.adapter";
import { CoupangMomentumAdapter } from "./adapter/out/advertising/coupang-momentum.adapter";
import { RegistrationContentWorkspaceAdapter } from "./adapter/out/ai/registration-content-workspace.adapter";
import { CandidateContentAssetAdapter } from "./adapter/out/ai/candidate-content-asset.adapter";
import { SellpiaSalePriceAdapter } from "./adapter/out/inventory/sellpia-sale-price.adapter";
import { SourcingPlaywrightRuntimeHandler } from "./adapter/out/runtime/sourcing-playwright-runtime.handler";
import { Direct1688ImageSearchAdapter } from "./adapter/out/1688/direct-1688-image-search.adapter";
import { Direct1688KeywordSearchAdapter } from "./adapter/out/1688/direct-1688-keyword-search.adapter";
import { ShortstrendTrendAdapter } from "./adapter/out/shortstrend/shortstrend-trend.adapter";
import { TaobaoLiveAdapter } from "./adapter/out/taobao/taobao-live.adapter";
import { GoogleTrendsRssAdapter } from "./adapter/out/google-trends/google-trends-rss.adapter";
import { LinkfoxEchotikShadowAdapter } from "./adapter/out/linkfox/linkfox-echotik-shadow.adapter";
import { SourcingRuntimeHandler } from "./adapter/out/runtime/sourcing-runtime.handler";
import { SourcingSupplyIntelligenceAdapter } from "./adapter/out/supply/sourcing-supply-intelligence.adapter";
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from "./application/port/in/capability/market-shadow-capability.port";
import {
  SOURCING_DISCOVERY_CAPABILITY_PORT,
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from "./application/port/in/capability/sourcing-capability.ports";
import { SOURCING_1688_IMAGE_SEARCH_PORT } from "./application/port/out/provider/1688-image-search.port";
import { SOURCING_1688_KEYWORD_SEARCH_PORT } from "./application/port/out/provider/1688-keyword-search.port";
import { SHORTSTREND_TREND_PORT } from "./application/port/out/provider/shortstrend-trend.port";
import { TAOBAO_LIVE_PORT } from "./application/port/out/provider/taobao-live.port";
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
} from "./application/port/out/provider/naver-keyword-research.port";
import { SOURCING_AGENT_GATEWAY_PORT } from "./application/port/out/runtime/sourcing-agent.gateway.port";
import { SOURCING_AI_WORKSPACE_ARCHIVE_PORT } from "./application/port/out/cross-domain/ai-workspace-archive.port";
import { SOURCING_OPERATION_ALERT_PORT } from "./application/port/out/cross-domain/operation-alert.port";
import { SOURCING_SUPPLY_INTELLIGENCE_PORT } from "./application/port/out/cross-domain/sourcing-supply-intelligence.port";
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-candidate.repository.port";
import { MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT } from "./application/port/out/repository/market-shadow-snapshot.repository.port";
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-workspace-snapshot.repository.port";
import { TREND_COLLECTION_REPOSITORY_PORT } from "./application/port/out/repository/trend-collection.repository.port";
import { TREND_COLLECTION_PORT } from "./application/port/in/trend-collection.port";
import { LIVE_COMMERCE_REPOSITORY_PORT } from "./application/port/out/repository/live-commerce.repository.port";
import { PRODUCT_PREPARATION_REPOSITORY_PORT } from "./application/port/out/repository/product-preparation.repository.port";
import { SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-collection-source-control.repository.port";
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-interest-target.repository.port";
import { SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-evidence-ledger.repository.port";
import { SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-launch-candidate.repository.port";
import { SOURCING_DECISION_BATCH_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-decision-batch.repository.port";
import { SOURCING_COLLECTION_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-collection.repository.port";
import { CHANNEL_PRODUCT_REGISTRATION_PORT } from "./application/port/out/cross-domain/channel-product-registration.port";
import { COUPANG_MOMENTUM_PORT } from "./application/port/out/cross-domain/coupang-momentum.port";
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from "./application/port/out/cross-domain/registration-content-workspace.port";
import { SOURCING_CANDIDATE_CONTENT_ASSET_PORT } from "./application/port/out/cross-domain/candidate-content-asset.port";
import { SOURCING_SELLPIA_SALE_PRICE_PORT } from "./application/port/out/cross-domain/sellpia-sale-price.port";
import {
  LINKFOX_ECHOTIK_SHADOW_PORT,
  MARKET_SHADOW_SIGNAL_PORT,
} from "./application/port/out/provider/market-shadow-signal.port";

/**
 * Sourcing is the canonical owner root for sourced-product discovery and the
 * candidate→master promotion handoff.
 *
 * Capabilities folded under this module:
 *   - sourcing extension ingest + scrape (Agent OS delegated) — `/api/sourcing/*`
 *   - candidate promotion/rejection — `/api/sourcing/candidates/:id/{promote,reject}`
 *
 * Supplier registry and purchase-order procurement live in `supply/` (extracted
 * during issue #192 follow-up Track A PR 1). `supplier-payments` is a finance
 * capability.
 *
 * Agent delegation goes through `AGENT_RUNNER_PORT` (exported by
 * `AgentOsModule`). `SourcingAgentGatewayAdapter` is the only seam that calls
 * the runner; `SourcingService` consumes `SOURCING_AGENT_GATEWAY_PORT`.
 *
 * Sourcing ingest writes `SourcingCandidate` + `CandidateImage` rows via
 * `SOURCING_CANDIDATE_REPOSITORY_PORT`. Registration is account-scoped and
 * finalizes through `ProductPreparation` into `ChannelListing`.
 */
@Module({
  imports: [
    PrismaModule,
    AgentOsModule,
    AiModule,
    AdvertisingModule,
    AutomationModule,
    ChannelsModule,
    InventoryModule,
    OperationsModule,
    SupplyModule,
  ],
  controllers: [
    SourcingExtensionIngestController,
    Sourcing1688TrendExtensionController,
    SourcingTiktokCcTrendExtensionController,
    SourcingLiveCommerceExtensionController,
    SourcingKeywordResearchController,
    Sourcing1688ImageSearchController,
    Sourcing1688KeywordSearchController,
    SourcingAgentRagController,
    SourcingMarketModelController,
    Sourcing1688NewProductModelController,
    SourcingRisingProductController,
    SourcingIntelligenceController,
    SourcingCandidateWorkspaceController,
    MarketShadowSignalController,
    SourcingWorkspaceSnapshotController,
    SourcingInterestTargetController,
    SourcingEntryRecommendationController,
    TrendCollectionController,
    LiveCommerceController,
  ],
  providers: [
    SourcingService,
    NaverKeywordResearchService,
    Sourcing1688ImageSearchService,
    Sourcing1688KeywordSearchService,
    SourcingAgentRagService,
    SourcingMarketModelService,
    Sourcing1688NewProductModelService,
    SourcingPromotionService,
    SourcingWorkspaceArchiveService,
    SourcingWorkspaceSnapshotService,
    SourcingEntryRecommendationService,
    SourcingAssistantService,
    SourcingExtensionIngestService,
    SourcingShadowSignalService,
    SourcingMarketDiscoveryService,
    SourcingRisingProductService,
    SourcingCollectionSourceControlService,
    SourcingInterestTargetService,
    SourcingEvidenceLedgerService,
    SourcingLaunchCandidateService,
    SourcingDecisionBatchService,
    SourcingCollectionCoordinator,
    TrendCollectService,
    SourcingTrendOperationHandler,
    TrendQueryService,
    LiveCommerceService,
    ProductRegistrationService,
    SourcingScrapeFinalizedBridge,
    SourcingDiscoveryCapabilityAdapter,
    MarketShadowSignalCapabilityAdapter,
    SourcingListingPrepCapabilityAdapter,
    SourcingScrapeUrlCapabilityAdapter,
    NaverDatalabPopularKeywordAdapter,
    NaverDatalabTrendAdapter,
    NaverAutocompleteKeywordAdapter,
    NaverSearchAdKeywordAdapter,
    SourcingAgentGatewayAdapter,
    SourcingAiWorkspaceArchiveAdapter,
    SourcingOperationAlertAdapter,
    SourcingCandidateRepositoryAdapter,
    SourcingCollectionSourceControlRepositoryAdapter,
    SourcingInterestTargetRepositoryAdapter,
    SourcingEvidenceLedgerRepositoryAdapter,
    SourcingLaunchCandidateRepositoryAdapter,
    SourcingDecisionBatchRepositoryAdapter,
    SourcingCollectionRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    MarketShadowSnapshotRepositoryAdapter,
    TrendCollectionRepositoryAdapter,
    LiveCommerceRepositoryAdapter,
    ProductPreparationRepositoryAdapter,
    ChannelProductRegistrationAdapter,
    CoupangMomentumAdapter,
    RegistrationContentWorkspaceAdapter,
    CandidateContentAssetAdapter,
    SellpiaSalePriceAdapter,
    SourcingPlaywrightRuntimeHandler,
    Direct1688ImageSearchAdapter,
    Direct1688KeywordSearchAdapter,
    ShortstrendTrendAdapter,
    TaobaoLiveAdapter,
    GoogleTrendsRssAdapter,
    LinkfoxEchotikShadowAdapter,
    SourcingRuntimeHandler,
    SourcingSupplyIntelligenceAdapter,
    {
      provide: MARKET_SHADOW_COLLECTION_CAPABILITY_PORT,
      useExisting: MarketShadowSignalCapabilityAdapter,
    },
    {
      provide: SOURCING_DISCOVERY_CAPABILITY_PORT,
      useExisting: SourcingDiscoveryCapabilityAdapter,
    },
    {
      provide: SOURCING_LISTING_PREP_CAPABILITY_PORT,
      useExisting: SourcingListingPrepCapabilityAdapter,
    },
    {
      provide: SOURCING_SCRAPE_URL_WORKFLOW_PORT,
      useExisting: SourcingScrapeUrlCapabilityAdapter,
    },
    {
      provide: SOURCING_1688_IMAGE_SEARCH_PORT,
      useExisting: Direct1688ImageSearchAdapter,
    },
    {
      provide: SOURCING_1688_KEYWORD_SEARCH_PORT,
      useExisting: Direct1688KeywordSearchAdapter,
    },
    {
      provide: SHORTSTREND_TREND_PORT,
      useExisting: ShortstrendTrendAdapter,
    },
    {
      provide: TAOBAO_LIVE_PORT,
      useExisting: TaobaoLiveAdapter,
    },
    {
      provide: SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
      useExisting: NaverSearchAdKeywordAdapter,
    },
    {
      provide: SOURCING_NAVER_DATALAB_TREND_PORT,
      useExisting: NaverDatalabTrendAdapter,
    },
    {
      provide: SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
      useExisting: NaverDatalabPopularKeywordAdapter,
    },
    {
      provide: SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
      useExisting: NaverAutocompleteKeywordAdapter,
    },
    {
      provide: SOURCING_AGENT_GATEWAY_PORT,
      useExisting: SourcingAgentGatewayAdapter,
    },
    {
      provide: SOURCING_OPERATION_ALERT_PORT,
      useExisting: SourcingOperationAlertAdapter,
    },
    {
      provide: SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
      useExisting: SourcingAiWorkspaceArchiveAdapter,
    },
    {
      provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingCandidateRepositoryAdapter,
    },
    {
      provide: SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT,
      useExisting: SourcingCollectionSourceControlRepositoryAdapter,
    },
    {
      provide: SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
      useExisting: SourcingInterestTargetRepositoryAdapter,
    },
    {
      provide: SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT,
      useExisting: SourcingEvidenceLedgerRepositoryAdapter,
    },
    {
      provide: SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingLaunchCandidateRepositoryAdapter,
    },
    {
      provide: SOURCING_DECISION_BATCH_REPOSITORY_PORT,
      useExisting: SourcingDecisionBatchRepositoryAdapter,
    },
    {
      provide: SOURCING_COLLECTION_REPOSITORY_PORT,
      useExisting: SourcingCollectionRepositoryAdapter,
    },
    {
      provide: SOURCING_SUPPLY_INTELLIGENCE_PORT,
      useExisting: SourcingSupplyIntelligenceAdapter,
    },
    {
      provide: MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT,
      useExisting: MarketShadowSnapshotRepositoryAdapter,
    },
    {
      provide: SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
      useExisting: SourcingWorkspaceSnapshotRepositoryAdapter,
    },
    {
      provide: TREND_COLLECTION_REPOSITORY_PORT,
      useExisting: TrendCollectionRepositoryAdapter,
    },
    {
      provide: TREND_COLLECTION_PORT,
      useExisting: TrendCollectService,
    },
    {
      provide: LIVE_COMMERCE_REPOSITORY_PORT,
      useExisting: LiveCommerceRepositoryAdapter,
    },
    {
      provide: PRODUCT_PREPARATION_REPOSITORY_PORT,
      useExisting: ProductPreparationRepositoryAdapter,
    },
    {
      provide: CHANNEL_PRODUCT_REGISTRATION_PORT,
      useExisting: ChannelProductRegistrationAdapter,
    },
    {
      provide: COUPANG_MOMENTUM_PORT,
      useExisting: CoupangMomentumAdapter,
    },
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_PORT,
      useExisting: RegistrationContentWorkspaceAdapter,
    },
    {
      provide: SOURCING_CANDIDATE_CONTENT_ASSET_PORT,
      useExisting: CandidateContentAssetAdapter,
    },
    {
      provide: SOURCING_SELLPIA_SALE_PRICE_PORT,
      useExisting: SellpiaSalePriceAdapter,
    },
    {
      provide: MARKET_SHADOW_SIGNAL_PORT,
      useExisting: GoogleTrendsRssAdapter,
    },
    {
      provide: LINKFOX_ECHOTIK_SHADOW_PORT,
      useExisting: LinkfoxEchotikShadowAdapter,
    },
  ],
})
export class SourcingModule {}
