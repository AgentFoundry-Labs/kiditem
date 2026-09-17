import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertsModule } from "../alerts/alerts.module";
import { AiModule } from "../ai/ai.module";
import { AdvertisingModule } from "../advertising/advertising.module";
import { ChannelsModule } from "../channels/channels.module";
import { InventoryModule } from "../inventory/inventory.module";
import { SupplyModule } from "../supply/supply.module";
import { SourcingAgentRuntimeModule } from "./sourcing-agent-runtime.module";
import { MarketShadowSignalCapabilityAdapter } from './adapter/in/agent/market-shadow-signal-capability.adapter';
import { SourcingShadowSignalService } from './application/service/sourcing-shadow-signal.service';
import { GoogleTrendsRssAdapter } from './adapter/out/google-trends/google-trends-rss.adapter';
import { LinkfoxEchotikShadowAdapter } from './adapter/out/linkfox/linkfox-echotik-shadow.adapter';
import { MarketShadowSnapshotRepositoryAdapter } from './adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from './application/port/in/capability/market-shadow-capability.port';
import { LINKFOX_ECHOTIK_SHADOW_PORT, MARKET_SHADOW_SIGNAL_PORT } from './application/port/out/provider/market-shadow-signal.port';
import { MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/market-shadow-snapshot.repository.port';
import { SourcingFinalCapabilityAdapter } from './adapter/in/agent/sourcing-final-capability.adapter';
import { SourcingCapabilityCompositionAdapter } from './adapter/in/agent/sourcing-capability-composition.adapter';
import { SourcingScrapeSnapshotAdmissionGuard } from './adapter/in/agent/sourcing-scrape-snapshot-admission.guard';
import { SourcingFinalDiscoveryCapabilityAdapter } from './adapter/in/agent/sourcing-final-discovery-capability.adapter';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { SOURCING_FINAL_CAPABILITY_PORT } from './application/port/in/capability/sourcing-final-capability.port';
import { SOURCING_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/sourcing-capability-composition.port';
import { SOURCING_CAPABILITY_ADMISSION_PORT } from './application/port/in/capability/sourcing-capability-admission.port';
import { SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT } from './application/port/in/capability/sourcing-final-discovery-capability.port';
import { SOURCING_BROWSER_SCRAPE_PORT } from './application/port/out/runtime/sourcing-browser-scrape.port';
import { SourcingFrozenRegistrationReadCapabilityModule } from './sourcing-frozen-registration-read-capability.module';
import { SourcingCandidateWorkspaceController } from "./adapter/in/http/sourcing-candidate-workspace.controller";
import { MarketShadowSignalController } from "./adapter/in/http/market-shadow-signal.controller";
import { Sourcing1688SearchResultController } from "./adapter/in/http/sourcing-1688-search-result.controller";
import { Sourcing1688SearchController } from "./adapter/in/http/sourcing-1688-search.controller";
import { SourcingAgentRagController } from "./adapter/in/http/sourcing-agent-rag.controller";
import { SourcingExtensionIngestController } from "./adapter/in/http/sourcing-extension-ingest.controller";
import { SourcingBrowserSourceAttemptController } from "./adapter/in/http/sourcing-browser-source-attempt.controller";
import { SourcingLiveCommerceSourceAttemptController } from "./adapter/in/http/sourcing-live-commerce-source-attempt.controller";
import { SourcingTiktokSourceAttemptController } from "./adapter/in/http/sourcing-tiktok-source-attempt.controller";
import { SourcingKeywordAnalysisController } from "./adapter/in/http/sourcing-keyword-analysis.controller";
import { SourcingRisingProductController } from "./adapter/in/http/sourcing-rising-product.controller";
import { SourcingIntelligenceController } from "./adapter/in/http/sourcing-intelligence.controller";
import { SourcingEntryRecommendationController } from "./adapter/in/http/sourcing-entry-recommendation.controller";
import { SourcingInterestTargetController } from "./adapter/in/http/sourcing-interest-target.controller";
import { SourcingWorkspaceController } from "./adapter/in/http/sourcing-workspace.controller";
import { SourcingReviewController } from "./adapter/in/http/sourcing-review.controller";
import { SourcingConfirmReportController } from "./adapter/in/http/sourcing-confirm-report.controller";
import { TrendCollectionController } from "./adapter/in/http/trend-collection.controller";
import { LiveCommerceController } from "./adapter/in/http/live-commerce.controller";
import { NaverKeywordResearchService } from "./application/service/naver-keyword-research.service";
import { Sourcing1688ImageSearchService } from "./application/service/sourcing-1688-image-search.service";
import { Sourcing1688KeywordSearchService } from "./application/service/sourcing-1688-keyword-search.service";
import { Sourcing1688SearchResultService } from "./application/service/sourcing-1688-search-result.service";
import { SourcingService } from "./application/service/sourcing.service";
import { SourcingScrapeUrlService } from "./application/service/sourcing-scrape-url.service";
import { SourcingPromotionService } from "./application/service/sourcing-promotion.service";
import { SourcingWorkspaceArchiveService } from "./application/service/sourcing-workspace-archive.service";
import { SourcingExtensionIngestService } from "./application/service/sourcing-extension-ingest.service";
import { SourcingEntryRecommendationService } from "./application/service/sourcing-entry-recommendation.service";
import { SourcingRecommendationService } from "./application/service/sourcing-recommendation.service";
import { SourcingConfirmReportService } from "./application/service/sourcing-confirm-report.service";
import { SourcingConfirmListenerService } from "./application/service/sourcing-confirm-listener.service";
import { TelegramConfirmMessengerAdapter } from "./adapter/out/telegram/telegram-confirm-messenger.adapter";
import { SOURCING_CONFIRM_MESSENGER_PORT } from "./application/port/out/provider/sourcing-confirm-messenger.port";
import { SourcingKeywordPreferenceService } from "./application/service/sourcing-keyword-preference.service";
import { SourcingKeywordSuggestionService } from "./application/service/sourcing-keyword-suggestion.service";
import { SourcingWingCatalogIngestService } from "./application/service/sourcing-wing-catalog-ingest.service";
import { ProductRegistrationService } from "./application/service/product-registration.service";
import { SourcingMarketDiscoveryService } from "./application/service/sourcing-market-discovery.service";
import { SourcingRisingProductService } from "./application/service/sourcing-rising-product.service";
import { SourcingCollectionSourceControlService } from "./application/service/sourcing-collection-source-control.service";
import { SourcingInterestTargetService } from "./application/service/sourcing-interest-target.service";
import { SourcingEvidenceLedgerService } from "./application/service/sourcing-evidence-ledger.service";
import { SourcingLaunchCandidateService } from "./application/service/sourcing-launch-candidate.service";
import { SourcingDecisionBatchService } from "./application/service/sourcing-decision-batch.service";
import { TrendCollectService } from "./application/service/trend-collect.service";
import { TrendQueryService } from "./application/service/trend-query.service";
import { LiveCommerceService } from "./application/service/live-commerce.service";
import { SourcingBrowserSourceAttemptService } from "./application/service/sourcing-browser-source-attempt.service";
import { SourcingLiveCommerceSourceAttemptService } from "./application/service/sourcing-live-commerce-source-attempt.service";
import { SourcingTiktokSourceAttemptService } from "./application/service/sourcing-tiktok-source-attempt.service";
import { NaverDatalabPopularKeywordAdapter } from "./adapter/out/naver/naver-datalab-popular-keyword.adapter";
import { NaverDatalabTrendAdapter } from "./adapter/out/naver/naver-datalab-trend.adapter";
import { NaverAutocompleteKeywordAdapter } from "./adapter/out/naver/naver-autocomplete-keyword.adapter";
import { NaverSearchAdKeywordAdapter } from "./adapter/out/naver/naver-search-ad-keyword.adapter";
import { SourcingAiWorkspaceArchiveAdapter } from "./adapter/out/ai/workspace-archive.adapter";
import { SourcingCollectionSourceControlRepositoryAdapter } from "./adapter/out/repository/sourcing-collection-source-control.repository.adapter";
import { SourcingKeywordPreferenceRepositoryAdapter } from "./adapter/out/repository/sourcing-keyword-preference.repository.adapter";
import { SourcingKeywordSuggestionRepositoryAdapter } from "./adapter/out/repository/sourcing-keyword-suggestion.repository.adapter";
import { SourcingRecommendationSourceRepositoryAdapter } from "./adapter/out/repository/sourcing-recommendation-source.repository.adapter";
import { SourcingEvidenceLedgerRepositoryAdapter } from "./adapter/out/repository/sourcing-evidence-ledger.repository.adapter";
import { SourcingLaunchCandidateRepositoryAdapter } from "./adapter/out/repository/sourcing-launch-candidate.repository.adapter";
import { SourcingDecisionBatchRepositoryAdapter } from "./adapter/out/repository/sourcing-decision-batch.repository.adapter";
import { SourcingBrowserSourceAttemptRepositoryAdapter } from "./adapter/out/repository/sourcing-browser-source-attempt.repository.adapter";
import { Sourcing1688SearchResultRepositoryAdapter } from "./adapter/out/repository/sourcing-1688-search-result.repository.adapter";
import { LiveCommerceRepositoryAdapter } from "./adapter/out/repository/live-commerce.repository.adapter";
import { ProductPreparationRepositoryAdapter } from "./adapter/out/repository/product-preparation.repository.adapter";
import { ChannelProductRegistrationAdapter } from "./adapter/out/channels/channel-product-registration.adapter";
import { CoupangMomentumAdapter } from "./adapter/out/advertising/coupang-momentum.adapter";
import { RegistrationContentWorkspaceAdapter } from "./adapter/out/ai/registration-content-workspace.adapter";
import { CandidateContentAssetAdapter } from "./adapter/out/ai/candidate-content-asset.adapter";
import { SellpiaSalePriceAdapter } from "./adapter/out/inventory/sellpia-sale-price.adapter";
import { Direct1688ImageSearchAdapter } from "./adapter/out/1688/direct-1688-image-search.adapter";
import { Direct1688KeywordSearchAdapter } from "./adapter/out/1688/direct-1688-keyword-search.adapter";
import { ShortstrendTrendAdapter } from "./adapter/out/shortstrend/shortstrend-trend.adapter";
import { TaobaoLiveAdapter } from "./adapter/out/taobao/taobao-live.adapter";
import { SourcingSupplyIntelligenceAdapter } from "./adapter/out/supply/sourcing-supply-intelligence.adapter";
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
import { SOURCING_AI_WORKSPACE_ARCHIVE_PORT } from "./application/port/out/cross-domain/ai-workspace-archive.port";
import { SOURCING_SUPPLY_INTELLIGENCE_PORT } from "./application/port/out/cross-domain/sourcing-supply-intelligence.port";
import { TREND_COLLECTION_PORT } from "./application/port/in/trend-collection.port";
import { LIVE_COMMERCE_REPOSITORY_PORT } from "./application/port/out/repository/live-commerce.repository.port";
import { PRODUCT_PREPARATION_REPOSITORY_PORT } from "./application/port/out/repository/product-preparation.repository.port";
import { SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-collection-source-control.repository.port";
import { SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-keyword-preference.repository.port";
import { SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-keyword-suggestion.repository.port";
import { SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-recommendation-source.repository.port";
import { SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-evidence-ledger.repository.port";
import { SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-launch-candidate.repository.port";
import { SOURCING_DECISION_BATCH_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-decision-batch.repository.port";
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-browser-source-attempt.repository.port";
import { SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT } from "./application/port/out/repository/sourcing-1688-search-result.repository.port";
import { CHANNEL_PRODUCT_REGISTRATION_PORT } from "./application/port/out/cross-domain/channel-product-registration.port";
import { COUPANG_MOMENTUM_PORT } from "./application/port/out/cross-domain/coupang-momentum.port";
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from "./application/port/out/cross-domain/registration-content-workspace.port";
import { SOURCING_CANDIDATE_CONTENT_ASSET_PORT } from "./application/port/out/cross-domain/candidate-content-asset.port";
import { SOURCING_SELLPIA_SALE_PRICE_PORT } from "./application/port/out/cross-domain/sellpia-sale-price.port";

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
 * Deterministic URL scraping is a direct Sourcing-owned source attempt. Product generation
 * uses the direct AI owner port; neither path creates a generic AgentRun.
 *
 * Sourcing ingest writes `SourcingCandidate` + `CandidateImage` rows via
 * `SOURCING_CANDIDATE_REPOSITORY_PORT`. Registration is account-scoped and
 * finalizes through `ProductPreparation` into `ChannelListing`.
 */
@Module({
  imports: [
    PrismaModule,
    AlertsModule,
    SourcingAgentRuntimeModule,
    SourcingFrozenRegistrationReadCapabilityModule,
    AiModule,
    AdvertisingModule,
    ChannelsModule,
    InventoryModule,
    SupplyModule,
  ],
  controllers: [
    SourcingExtensionIngestController,
    SourcingBrowserSourceAttemptController,
    SourcingLiveCommerceSourceAttemptController,
    SourcingTiktokSourceAttemptController,
    SourcingKeywordAnalysisController,
    Sourcing1688SearchResultController,
    Sourcing1688SearchController,
    SourcingAgentRagController,
    SourcingRisingProductController,
    SourcingIntelligenceController,
    SourcingCandidateWorkspaceController,
    MarketShadowSignalController,
    SourcingInterestTargetController,
    SourcingWorkspaceController,
    SourcingReviewController,
    SourcingConfirmReportController,
    SourcingEntryRecommendationController,
    TrendCollectionController,
    LiveCommerceController,
  ],
  providers: [
    MarketShadowSignalCapabilityAdapter,
    SourcingShadowSignalService,
    GoogleTrendsRssAdapter,
    LinkfoxEchotikShadowAdapter,
    MarketShadowSnapshotRepositoryAdapter,
    { provide: MARKET_SHADOW_COLLECTION_CAPABILITY_PORT, useExisting: MarketShadowSignalCapabilityAdapter },
    { provide: MARKET_SHADOW_SIGNAL_PORT, useExisting: GoogleTrendsRssAdapter },
    { provide: LINKFOX_ECHOTIK_SHADOW_PORT, useExisting: LinkfoxEchotikShadowAdapter },
    { provide: MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT, useExisting: MarketShadowSnapshotRepositoryAdapter },
    SourcingService,
    SourcingScrapeUrlService,
    SourcingFinalCapabilityAdapter,
    SourcingCapabilityCompositionAdapter,
    {
      provide: SourcingScrapeSnapshotAdmissionGuard,
      useFactory: () => new SourcingScrapeSnapshotAdmissionGuard(),
    },
    SourcingFinalDiscoveryCapabilityAdapter,
    NaverKeywordResearchService,
    Sourcing1688ImageSearchService,
    Sourcing1688KeywordSearchService,
    Sourcing1688SearchResultService,
    SourcingPromotionService,
    SourcingWorkspaceArchiveService,
    SourcingEntryRecommendationService,
    SourcingRecommendationService,
    SourcingConfirmReportService,
    SourcingConfirmListenerService,
    SourcingKeywordPreferenceService,
    SourcingKeywordSuggestionService,
    SourcingWingCatalogIngestService,
    SourcingExtensionIngestService,
    SourcingMarketDiscoveryService,
    SourcingRisingProductService,
    SourcingCollectionSourceControlService,
    SourcingInterestTargetService,
    SourcingEvidenceLedgerService,
    SourcingLaunchCandidateService,
    SourcingDecisionBatchService,
    TrendCollectService,
    SourcingBrowserSourceAttemptService,
    SourcingLiveCommerceSourceAttemptService,
    SourcingTiktokSourceAttemptService,
    TrendQueryService,
    LiveCommerceService,
    ProductRegistrationService,
    NaverDatalabPopularKeywordAdapter,
    NaverDatalabTrendAdapter,
    NaverAutocompleteKeywordAdapter,
    NaverSearchAdKeywordAdapter,
    SourcingAiWorkspaceArchiveAdapter,
    SourcingCollectionSourceControlRepositoryAdapter,
    SourcingKeywordPreferenceRepositoryAdapter,
    SourcingKeywordSuggestionRepositoryAdapter,
    SourcingRecommendationSourceRepositoryAdapter,
    SourcingEvidenceLedgerRepositoryAdapter,
    SourcingLaunchCandidateRepositoryAdapter,
    SourcingDecisionBatchRepositoryAdapter,
    SourcingBrowserSourceAttemptRepositoryAdapter,
    Sourcing1688SearchResultRepositoryAdapter,
    LiveCommerceRepositoryAdapter,
    ProductPreparationRepositoryAdapter,
    ChannelProductRegistrationAdapter,
    CoupangMomentumAdapter,
    RegistrationContentWorkspaceAdapter,
    CandidateContentAssetAdapter,
    SellpiaSalePriceAdapter,
    Direct1688ImageSearchAdapter,
    Direct1688KeywordSearchAdapter,
    ShortstrendTrendAdapter,
    TaobaoLiveAdapter,
    SourcingSupplyIntelligenceAdapter,
    TelegramConfirmMessengerAdapter,
    {
      provide: SOURCING_CONFIRM_MESSENGER_PORT,
      useExisting: TelegramConfirmMessengerAdapter,
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
      provide: SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
      useExisting: SourcingAiWorkspaceArchiveAdapter,
    },
    {
      provide: SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT,
      useExisting: SourcingCollectionSourceControlRepositoryAdapter,
    },
    {
      provide: SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT,
      useExisting: SourcingKeywordPreferenceRepositoryAdapter,
    },
    {
      provide: SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT,
      useExisting: SourcingKeywordSuggestionRepositoryAdapter,
    },
    {
      provide: SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
      useExisting: SourcingRecommendationSourceRepositoryAdapter,
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
      provide: SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
      useExisting: SourcingBrowserSourceAttemptRepositoryAdapter,
    },
    {
      provide: SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
      useExisting: Sourcing1688SearchResultRepositoryAdapter,
    },
    {
      provide: SOURCING_SUPPLY_INTELLIGENCE_PORT,
      useExisting: SourcingSupplyIntelligenceAdapter,
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
      provide: SOURCING_FINAL_CAPABILITY_PORT,
      useExisting: SourcingFinalCapabilityAdapter,
    },
    {
      provide: SOURCING_CAPABILITY_COMPOSITION_PORT,
      useExisting: SourcingCapabilityCompositionAdapter,
    },
    {
      provide: SOURCING_CAPABILITY_ADMISSION_PORT,
      useExisting: SourcingScrapeSnapshotAdmissionGuard,
    },
    {
      provide: SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT,
      useExisting: SourcingFinalDiscoveryCapabilityAdapter,
    },
    {
      provide: SOURCING_BROWSER_SCRAPE_PORT,
      useExisting: SourcingPlaywrightRuntimeHandler,
    },
  ],
  exports: [
    SourcingAgentRuntimeModule,
    SOURCING_FINAL_CAPABILITY_PORT,
    SOURCING_CAPABILITY_COMPOSITION_PORT,
    SOURCING_CAPABILITY_ADMISSION_PORT,
  ],
})
export class SourcingModule {}
