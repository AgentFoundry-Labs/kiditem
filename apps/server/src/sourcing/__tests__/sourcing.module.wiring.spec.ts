import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { SourcingModule } from "../sourcing.module";
import { SourcingAgentRuntimeModule } from "../sourcing-agent-runtime.module";
import { SourcingAgentApiCollectionModule } from "../sourcing-agent-api-collection.module";
import { SourcingShadowOperationModule } from "../sourcing-shadow-operation.module";
import { Sourcing1688ImageSearchService } from "../application/service/sourcing-1688-image-search.service";
import { Sourcing1688KeywordSearchService } from "../application/service/sourcing-1688-keyword-search.service";
import { Sourcing1688SearchResultService } from "../application/service/sourcing-1688-search-result.service";
import { SourcingAgentRagService } from "../application/service/sourcing-agent-rag.service";
import { NaverKeywordResearchService } from "../application/service/naver-keyword-research.service";
import { TrendCollectService } from "../application/service/trend-collect.service";
import { TrendQueryService } from "../application/service/trend-query.service";
import { LiveCommerceService } from "../application/service/live-commerce.service";
import { SourcingService } from "../application/service/sourcing.service";
import { SourcingPromotionService } from "../application/service/sourcing-promotion.service";
import { SourcingWorkspaceArchiveService } from "../application/service/sourcing-workspace-archive.service";
import { SourcingAssistantService } from "../application/service/sourcing-assistant.service";
import { SourcingRecommendationService } from "../application/service/sourcing-recommendation.service";
import { SourcingKeywordPreferenceService } from "../application/service/sourcing-keyword-preference.service";
import { SourcingValidationService } from "../application/service/sourcing-validation.service";
import { SourcingReviewService } from "../application/service/sourcing-review.service";
import { SourcingWingCatalogIngestService } from "../application/service/sourcing-wing-catalog-ingest.service";
import { SourcingShadowSignalService } from "../application/service/sourcing-shadow-signal.service";
import { SourcingMarketDiscoveryService } from "../application/service/sourcing-market-discovery.service";
import { SourcingCollectionSourceControlService } from "../application/service/sourcing-collection-source-control.service";
import { SourcingInterestTargetService } from "../application/service/sourcing-interest-target.service";
import { SourcingEvidenceLedgerService } from "../application/service/sourcing-evidence-ledger.service";
import { SourcingLaunchCandidateService } from "../application/service/sourcing-launch-candidate.service";
import { SourcingDecisionBatchService } from "../application/service/sourcing-decision-batch.service";
import { SourcingCollectionCoordinator } from "../application/service/sourcing-collection-coordinator.service";
import { SourcingBrowserTrendOperationService } from "../application/service/sourcing-browser-trend-operation.service";
import { SourcingBrowserLiveCommerceOperationService } from "../application/service/sourcing-browser-live-commerce-operation.service";
import { SourcingScrapeResultService } from "../application/service/sourcing-scrape-result.service";
import { SourcingAgentWorkspaceCapabilityService } from "../application/service/sourcing-agent-workspace-capability.service";
import { SourcingExtensionIngestService } from "../application/service/sourcing-extension-ingest.service";
import { MarketShadowSignalCapabilityAdapter } from "../adapter/in/agent/market-shadow-signal-capability.adapter";
import { SourcingListingPrepCapabilityAdapter } from "../adapter/in/agent/sourcing-listing-prep-capability.adapter";
import { SourcingScrapeUrlCapabilityAdapter } from "../adapter/in/agent/sourcing-scrape-url-capability.adapter";
import { SourcingWorkspaceCapabilityAdapter } from "../adapter/in/agent/sourcing-workspace-capability.adapter";
import { SourcingBrowserTrendOperationController } from "../adapter/in/http/sourcing-browser-trend-operation.controller";
import { SourcingBrowserLiveCommerceOperationController } from "../adapter/in/http/sourcing-browser-live-commerce-operation.controller";
import { SourcingKeywordAnalysisController } from "../adapter/in/http/sourcing-keyword-analysis.controller";
import { MarketShadowSignalController } from "../adapter/in/http/market-shadow-signal.controller";
import { SourcingIntelligenceController } from "../adapter/in/http/sourcing-intelligence.controller";
import { SourcingInterestTargetController } from "../adapter/in/http/sourcing-interest-target.controller";
import { Sourcing1688SearchResultController } from "../adapter/in/http/sourcing-1688-search-result.controller";
import { SourcingWorkspaceController } from "../adapter/in/http/sourcing-workspace.controller";
import { SourcingReviewController } from "../adapter/in/http/sourcing-review.controller";
import { NaverDatalabPopularKeywordAdapter } from "../adapter/out/naver/naver-datalab-popular-keyword.adapter";
import { NaverDatalabTrendAdapter } from "../adapter/out/naver/naver-datalab-trend.adapter";
import { NaverAutocompleteKeywordAdapter } from "../adapter/out/naver/naver-autocomplete-keyword.adapter";
import { NaverSearchAdKeywordAdapter } from "../adapter/out/naver/naver-search-ad-keyword.adapter";
import { SourcingAgentGatewayAdapter } from "../adapter/out/agent/sourcing-agent.gateway.adapter";
import { SourcingAiWorkspaceArchiveAdapter } from "../adapter/out/ai/workspace-archive.adapter";
import { SourcingOperationAlertAdapter } from "../adapter/out/automation/operation-alert.adapter";
import { SourcingCandidateRepositoryAdapter } from "../adapter/out/repository/sourcing-candidate.repository.adapter";
import { SourcingCollectionSourceControlRepositoryAdapter } from "../adapter/out/repository/sourcing-collection-source-control.repository.adapter";
import { SourcingInterestTargetRepositoryAdapter } from "../adapter/out/repository/sourcing-interest-target.repository.adapter";
import { SourcingRecommendationRepositoryAdapter } from "../adapter/out/repository/sourcing-recommendation.repository.adapter";
import { SourcingKeywordPreferenceRepositoryAdapter } from "../adapter/out/repository/sourcing-keyword-preference.repository.adapter";
import { SourcingValidationRepositoryAdapter } from "../adapter/out/repository/sourcing-validation.repository.adapter";
import { SourcingReviewRepositoryAdapter } from "../adapter/out/repository/sourcing-review.repository.adapter";
import { SourcingRecommendationSourceRepositoryAdapter } from "../adapter/out/repository/sourcing-recommendation-source.repository.adapter";
import { SourcingEvidenceLedgerRepositoryAdapter } from "../adapter/out/repository/sourcing-evidence-ledger.repository.adapter";
import { SourcingLaunchCandidateRepositoryAdapter } from "../adapter/out/repository/sourcing-launch-candidate.repository.adapter";
import { SourcingDecisionBatchRepositoryAdapter } from "../adapter/out/repository/sourcing-decision-batch.repository.adapter";
import { SourcingCollectionRepositoryAdapter } from "../adapter/out/repository/sourcing-collection.repository.adapter";
import { Sourcing1688SearchResultRepositoryAdapter } from "../adapter/out/repository/sourcing-1688-search-result.repository.adapter";
import { Sourcing1688OperationHandler } from "../adapter/in/operation/sourcing-1688.operation-handler";
import { SourcingTrendOperationHandler } from "../adapter/in/operation/sourcing-trend.operation-handler";
import { SourcingLiveCommerceOperationHandler } from "../adapter/in/operation/sourcing-live-commerce.operation-handler";
import { SourcingKeywordAnalysisOperationHandler } from "../adapter/in/operation/sourcing-keyword-analysis.operation-handler";
import { SourcingRisingProductOperationHandler } from "../adapter/in/operation/sourcing-rising-product.operation-handler";
import { SourcingShadowSignalOperationHandler } from "../adapter/in/operation/sourcing-shadow-signal.operation-handler";
import { SourcingSupplyIntelligenceAdapter } from "../adapter/out/supply/sourcing-supply-intelligence.adapter";
import { SourcingCollectionOperationAdapter } from "../adapter/out/operations/sourcing-collection-operation.adapter";
import { MarketShadowOperationAdapter } from "../adapter/out/operations/market-shadow-operation.adapter";
import { SourcingWorkspaceSnapshotRepositoryAdapter } from "../adapter/out/repository/sourcing-workspace-snapshot.repository.adapter";
import { MarketShadowSnapshotRepositoryAdapter } from "../adapter/out/repository/market-shadow-snapshot.repository.adapter";
import { GoogleTrendsRssAdapter } from "../adapter/out/google-trends/google-trends-rss.adapter";
import { LinkfoxEchotikShadowAdapter } from "../adapter/out/linkfox/linkfox-echotik-shadow.adapter";
import { SourcingPlaywrightRuntimeHandler } from "../adapter/out/runtime/sourcing-playwright-runtime.handler";
import { Direct1688ImageSearchAdapter } from "../adapter/out/1688/direct-1688-image-search.adapter";
import { Direct1688KeywordSearchAdapter } from "../adapter/out/1688/direct-1688-keyword-search.adapter";
import { ShortstrendTrendAdapter } from "../adapter/out/shortstrend/shortstrend-trend.adapter";
import { TrendCollectionRepositoryAdapter } from "../adapter/out/repository/trend-collection.repository.adapter";
import { LiveCommerceRepositoryAdapter } from "../adapter/out/repository/live-commerce.repository.adapter";
import { TaobaoLiveAdapter } from "../adapter/out/taobao/taobao-live.adapter";
import { SourcingRuntimeHandler } from "../adapter/out/runtime/sourcing-runtime.handler";
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from "../application/port/in/capability/market-shadow-capability.port";
import { MARKET_SHADOW_OPERATION_PORT } from "../application/port/out/cross-domain/market-shadow-operation.port";
import {
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from "../application/port/in/capability/sourcing-capability.ports";
import { SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT } from "../application/port/in/capability/sourcing-agent-workspace-capability.port";
import { SOURCING_COLLECTION_OPERATION_PORT } from "../application/port/out/cross-domain/sourcing-collection-operation.port";
import { SOURCING_1688_IMAGE_SEARCH_PORT } from "../application/port/out/provider/1688-image-search.port";
import { SOURCING_1688_KEYWORD_SEARCH_PORT } from "../application/port/out/provider/1688-keyword-search.port";
import { SHORTSTREND_TREND_PORT } from "../application/port/out/provider/shortstrend-trend.port";
import { TAOBAO_LIVE_PORT } from "../application/port/out/provider/taobao-live.port";
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
} from "../application/port/out/provider/naver-keyword-research.port";
import { SOURCING_AGENT_GATEWAY_PORT } from "../application/port/out/runtime/sourcing-agent.gateway.port";
import { SOURCING_AI_WORKSPACE_ARCHIVE_PORT } from "../application/port/out/cross-domain/ai-workspace-archive.port";
import { SOURCING_OPERATION_ALERT_PORT } from "../application/port/out/cross-domain/operation-alert.port";
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-candidate.repository.port";
import { SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-collection-source-control.repository.port";
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-interest-target.repository.port";
import { SOURCING_RECOMMENDATION_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-recommendation.repository.port";
import { SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-keyword-preference.repository.port";
import { SOURCING_VALIDATION_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-validation.repository.port";
import { SOURCING_REVIEW_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-review.repository.port";
import { SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-recommendation-source.repository.port";
import { SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-evidence-ledger.repository.port";
import { SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-launch-candidate.repository.port";
import { SOURCING_DECISION_BATCH_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-decision-batch.repository.port";
import { SOURCING_COLLECTION_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-collection.repository.port";
import { SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-1688-search-result.repository.port";
import { SOURCING_SUPPLY_INTELLIGENCE_PORT } from "../application/port/out/cross-domain/sourcing-supply-intelligence.port";
import { MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT } from "../application/port/out/repository/market-shadow-snapshot.repository.port";
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-workspace-snapshot.repository.port";
import { TREND_COLLECTION_REPOSITORY_PORT } from "../application/port/out/repository/trend-collection.repository.port";
import { LIVE_COMMERCE_REPOSITORY_PORT } from "../application/port/out/repository/live-commerce.repository.port";
import { ChannelsModule } from "../../channels/channels.module";
import { SupplyModule } from "../../supply/supply.module";
import { ProductRegistrationService } from "../application/service/product-registration.service";
import { ProductPreparationRepositoryAdapter } from "../adapter/out/repository/product-preparation.repository.adapter";
import { ChannelProductRegistrationAdapter } from "../adapter/out/channels/channel-product-registration.adapter";
import { RegistrationContentWorkspaceAdapter } from "../adapter/out/ai/registration-content-workspace.adapter";
import { PRODUCT_PREPARATION_REPOSITORY_PORT } from "../application/port/out/repository/product-preparation.repository.port";
import { CHANNEL_PRODUCT_REGISTRATION_PORT } from "../application/port/out/cross-domain/channel-product-registration.port";
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from "../application/port/out/cross-domain/registration-content-workspace.port";
import {
  LINKFOX_ECHOTIK_SHADOW_PORT,
  MARKET_SHADOW_SIGNAL_PORT,
} from "../application/port/out/provider/market-shadow-signal.port";

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = "imports";
const CONTROLLERS_KEY = "controllers";
const PROVIDERS_KEY = "providers";
const PATH_KEY = "path";
const SELF_DECLARED_DEPS_KEY = "self:paramtypes";

function sourcingProviders(): unknown[] {
  return [
    ...(Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? []),
    ...(Reflect.getMetadata(PROVIDERS_KEY, SourcingAgentRuntimeModule) ?? []),
    ...(Reflect.getMetadata(PROVIDERS_KEY, SourcingAgentApiCollectionModule) ?? []),
    ...(Reflect.getMetadata(PROVIDERS_KEY, SourcingShadowOperationModule) ?? []),
  ];
}

// Sourcing owner module — Chinese new-product discovery. Suppliers and
// procurement were extracted to SupplyModule during issue #192 follow-up
// Track A PR 1. This spec freezes the module metadata so a removed
// controller, a missing provider, or a route rename fails at vitest time
// before reaching dev:server boot.
describe("SourcingModule canonical owner wiring", () => {
  it("mounts extension routes before candidate workspace routes", () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(
      controllers.map((controller) => (controller as { name: string }).name),
    ).toEqual([
      "SourcingExtensionIngestController",
      "SourcingBrowserTrendOperationController",
      "SourcingBrowserLiveCommerceOperationController",
      "SourcingKeywordAnalysisController",
      "Sourcing1688SearchResultController",
      "SourcingAgentRagController",
      "SourcingRisingProductController",
      "SourcingIntelligenceController",
      "SourcingCandidateWorkspaceController",
      "MarketShadowSignalController",
      "SourcingInterestTargetController",
      "SourcingWorkspaceController",
      "SourcingReviewController",
      "SourcingEntryRecommendationController",
      "TrendCollectionController",
      "LiveCommerceController",
    ]);
    expect(controllers).toContain(SourcingBrowserTrendOperationController);
    expect(controllers).toContain(SourcingBrowserLiveCommerceOperationController);
    expect(controllers).toContain(SourcingKeywordAnalysisController);
    expect(controllers.map((controller) => (controller as { name: string }).name)).not.toEqual(
      expect.arrayContaining([
        "Sourcing1688TrendExtensionController",
        "SourcingTiktokCcTrendExtensionController",
        "SourcingLiveCommerceExtensionController",
      ]),
    );
    expect(controllers).toContain(MarketShadowSignalController);
    expect(controllers).toContain(SourcingIntelligenceController);
    expect(controllers).toContain(SourcingInterestTargetController);
  });

  it("declares every application service as a provider", () => {
    const providers = sourcingProviders();
    expect(providers).toContain(SourcingService);
    expect(providers).toContain(SourcingExtensionIngestService);
    expect(providers).toContain(NaverKeywordResearchService);
    expect(providers).toContain(Sourcing1688ImageSearchService);
    expect(providers).toContain(Sourcing1688KeywordSearchService);
    expect(providers).toContain(Sourcing1688SearchResultService);
    expect(providers).toContain(Sourcing1688OperationHandler);
    expect(providers).toContain(SourcingTrendOperationHandler);
    expect(providers).toContain(SourcingLiveCommerceOperationHandler);
    expect(providers).toContain(SourcingKeywordAnalysisOperationHandler);
    expect(providers).toContain(SourcingRisingProductOperationHandler);
    expect(providers).toContain(SourcingShadowSignalOperationHandler);
    expect(providers).toContain(SourcingAgentRagService);
    expect(providers).toContain(SourcingPromotionService);
    expect(providers).toContain(SourcingWorkspaceArchiveService);
    expect(providers).toContain(SourcingAssistantService);
    expect(providers).toContain(SourcingRecommendationService);
    expect(providers).toContain(SourcingKeywordPreferenceService);
    expect(providers).toContain(SourcingValidationService);
    expect(providers).toContain(SourcingReviewService);
    expect(providers).toContain(SourcingWingCatalogIngestService);
    expect(providers).toContain(SourcingShadowSignalService);
    expect(providers).toContain(SourcingMarketDiscoveryService);
    expect(providers).toContain(SourcingCollectionSourceControlService);
    expect(providers).toContain(SourcingInterestTargetService);
    expect(providers).toContain(SourcingEvidenceLedgerService);
    expect(providers).toContain(SourcingLaunchCandidateService);
    expect(providers).toContain(SourcingDecisionBatchService);
    expect(providers).toContain(SourcingCollectionCoordinator);
    expect(providers).toContain(SourcingBrowserTrendOperationService);
    expect(providers).toContain(SourcingBrowserLiveCommerceOperationService);
    expect(providers).toContain(SourcingScrapeResultService);
    expect(
      providers.map((provider) => (provider as { name?: string }).name),
    ).not.toContain("SourcingScrapeFinalizedBridge");
    expect(providers).toContain(TrendCollectService);
    expect(providers).toContain(TrendQueryService);
    expect(providers).toContain(LiveCommerceService);
    expect(providers).toContain(ProductRegistrationService);
  });

  it("injects typed trends and the canonical recommendation service into market discovery", () => {
    expect(
      Reflect.getMetadata(SELF_DECLARED_DEPS_KEY, SourcingMarketDiscoveryService),
    ).toEqual([
      { index: 0, param: TREND_COLLECTION_REPOSITORY_PORT },
    ]);
    expect(
      Reflect.getMetadata("design:paramtypes", SourcingMarketDiscoveryService),
    ).toEqual([
      expect.any(Function),
      SourcingRecommendationService,
    ]);
  });

  it("binds outgoing ports to their adapters", () => {
    const providers = sourcingProviders();
    expect(providers).toContain(NaverDatalabPopularKeywordAdapter);
    expect(providers).toContain(NaverDatalabTrendAdapter);
    expect(providers).toContain(NaverAutocompleteKeywordAdapter);
    expect(providers).toContain(NaverSearchAdKeywordAdapter);
    expect(providers).toContain(SourcingAgentGatewayAdapter);
    expect(providers).toContain(SourcingAiWorkspaceArchiveAdapter);
    expect(providers).toContain(SourcingOperationAlertAdapter);
    expect(providers).toContain(SourcingCandidateRepositoryAdapter);
    expect(providers).toContain(SourcingCollectionSourceControlRepositoryAdapter);
    expect(providers).toContain(SourcingInterestTargetRepositoryAdapter);
    expect(providers).toContain(SourcingRecommendationRepositoryAdapter);
    expect(providers).toContain(SourcingKeywordPreferenceRepositoryAdapter);
    expect(providers).toContain(SourcingValidationRepositoryAdapter);
    expect(providers).toContain(SourcingReviewRepositoryAdapter);
    expect(providers).toContain(SourcingRecommendationSourceRepositoryAdapter);
    expect(providers).toContain(SourcingEvidenceLedgerRepositoryAdapter);
    expect(providers).toContain(SourcingLaunchCandidateRepositoryAdapter);
    expect(providers).toContain(SourcingDecisionBatchRepositoryAdapter);
    expect(providers).toContain(SourcingCollectionRepositoryAdapter);
    expect(providers).toContain(Sourcing1688SearchResultRepositoryAdapter);
    expect(providers).toContain(SourcingSupplyIntelligenceAdapter);
    expect(providers).toContain(SourcingWorkspaceSnapshotRepositoryAdapter);
    expect(providers).toContain(MarketShadowSnapshotRepositoryAdapter);
    expect(providers).toContain(GoogleTrendsRssAdapter);
    expect(providers).toContain(LinkfoxEchotikShadowAdapter);
    expect(providers).toContain(MarketShadowSignalCapabilityAdapter);
    expect(providers).toContain(SourcingListingPrepCapabilityAdapter);
    expect(providers).toContain(SourcingScrapeUrlCapabilityAdapter);
    expect(providers).toContain(SourcingWorkspaceCapabilityAdapter);
    expect(providers).toContain(SourcingAgentWorkspaceCapabilityService);
    expect(providers).toContain(SourcingCollectionOperationAdapter);
    expect(providers).toContain(MarketShadowOperationAdapter);
    expect(providers).toContain(SourcingPlaywrightRuntimeHandler);
    expect(providers).toContain(Direct1688ImageSearchAdapter);
    expect(providers).toContain(Direct1688KeywordSearchAdapter);
    expect(providers).toContain(ShortstrendTrendAdapter);
    expect(providers).toContain(TrendCollectionRepositoryAdapter);
    expect(providers).toContain(LiveCommerceRepositoryAdapter);
    expect(providers).toContain(TaobaoLiveAdapter);
    expect(providers).toContain(SourcingRuntimeHandler);
    expect(providers).toContain(ProductPreparationRepositoryAdapter);
    expect(providers).toContain(ChannelProductRegistrationAdapter);
    expect(providers).toContain(RegistrationContentWorkspaceAdapter);
    expect(
      providers.some(
        (provider) =>
          typeof provider === "function" &&
          provider.name === "SourcingPythonRuntimeHandler",
      ),
    ).toBe(false);
    const gatewayBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_AGENT_GATEWAY_PORT,
    );
    expect(gatewayBinding).toBeDefined();
    expect(gatewayBinding!.useExisting).toBe(SourcingAgentGatewayAdapter);
    const workspaceCapabilityBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT,
    );
    expect(workspaceCapabilityBinding).toBeDefined();
    expect(workspaceCapabilityBinding!.useExisting).toBe(
      SourcingAgentWorkspaceCapabilityService,
    );
    const collectionOperationBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_COLLECTION_OPERATION_PORT,
    );
    expect(collectionOperationBinding?.useExisting).toBe(
      SourcingCollectionOperationAdapter,
    );
    const shadowCapabilityBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === MARKET_SHADOW_COLLECTION_CAPABILITY_PORT,
    );
    expect(shadowCapabilityBinding?.useExisting).toBe(
      MarketShadowSignalCapabilityAdapter,
    );
    const shadowOperationBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === MARKET_SHADOW_OPERATION_PORT,
    );
    expect(shadowOperationBinding?.useExisting).toBe(MarketShadowOperationAdapter);
    const listingPrepBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_LISTING_PREP_CAPABILITY_PORT,
    );
    expect(listingPrepBinding).toBeDefined();
    expect(listingPrepBinding!.useExisting).toBe(
      SourcingListingPrepCapabilityAdapter,
    );
    const scrapeUrlBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_SCRAPE_URL_WORKFLOW_PORT,
    );
    expect(scrapeUrlBinding).toBeDefined();
    expect(scrapeUrlBinding!.useExisting).toBe(
      SourcingScrapeUrlCapabilityAdapter,
    );
    const alertBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_OPERATION_ALERT_PORT,
    );
    expect(alertBinding).toBeDefined();
    expect(alertBinding!.useExisting).toBe(SourcingOperationAlertAdapter);
    const aiArchiveBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
    );
    expect(aiArchiveBinding).toBeDefined();
    expect(aiArchiveBinding!.useExisting).toBe(
      SourcingAiWorkspaceArchiveAdapter,
    );
    const candidateRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_CANDIDATE_REPOSITORY_PORT,
    );
    expect(candidateRepositoryBinding).toBeDefined();
    expect(candidateRepositoryBinding!.useExisting).toBe(
      SourcingCandidateRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_COLLECTION_SOURCE_CONTROL_REPOSITORY_PORT,
      SourcingCollectionSourceControlRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
      SourcingInterestTargetRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_RECOMMENDATION_REPOSITORY_PORT,
      SourcingRecommendationRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT,
      SourcingKeywordPreferenceRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_VALIDATION_REPOSITORY_PORT,
      SourcingValidationRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_REVIEW_REPOSITORY_PORT,
      SourcingReviewRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
      SourcingRecommendationSourceRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT,
      SourcingEvidenceLedgerRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT,
      SourcingLaunchCandidateRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_DECISION_BATCH_REPOSITORY_PORT,
      SourcingDecisionBatchRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_COLLECTION_REPOSITORY_PORT,
      SourcingCollectionRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
      Sourcing1688SearchResultRepositoryAdapter,
    );
    expectBinding(
      providers,
      SOURCING_SUPPLY_INTELLIGENCE_PORT,
      SourcingSupplyIntelligenceAdapter,
    );
    const workspaceSnapshotRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
    );
    expect(workspaceSnapshotRepositoryBinding).toBeDefined();
    expect(workspaceSnapshotRepositoryBinding!.useExisting).toBe(
      SourcingWorkspaceSnapshotRepositoryAdapter,
    );
    const shadowSnapshotRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT,
    );
    expect(shadowSnapshotRepositoryBinding?.useExisting).toBe(
      MarketShadowSnapshotRepositoryAdapter,
    );
    const imageSearchBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_1688_IMAGE_SEARCH_PORT,
    );
    expect(imageSearchBinding).toBeDefined();
    expect(imageSearchBinding!.useExisting).toBe(Direct1688ImageSearchAdapter);
    const keywordSearchBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_1688_KEYWORD_SEARCH_PORT,
    );
    expect(keywordSearchBinding).toBeDefined();
    expect(keywordSearchBinding!.useExisting).toBe(Direct1688KeywordSearchAdapter);
    const shortstrendBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SHORTSTREND_TREND_PORT,
    );
    expect(shortstrendBinding).toBeDefined();
    expect(shortstrendBinding!.useExisting).toBe(ShortstrendTrendAdapter);
    const trendRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === TREND_COLLECTION_REPOSITORY_PORT,
    );
    expect(trendRepositoryBinding).toBeDefined();
    expect(trendRepositoryBinding!.useExisting).toBe(
      TrendCollectionRepositoryAdapter,
    );
    const liveCommerceRepositoryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === LIVE_COMMERCE_REPOSITORY_PORT,
    );
    expect(liveCommerceRepositoryBinding).toBeDefined();
    expect(liveCommerceRepositoryBinding!.useExisting).toBe(
      LiveCommerceRepositoryAdapter,
    );
    const taobaoLiveBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === TAOBAO_LIVE_PORT,
    );
    expect(taobaoLiveBinding).toBeDefined();
    expect(taobaoLiveBinding!.useExisting).toBe(TaobaoLiveAdapter);
    const marketShadowSignalBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === MARKET_SHADOW_SIGNAL_PORT,
    );
    expect(marketShadowSignalBinding?.useExisting).toBe(GoogleTrendsRssAdapter);
    const linkfoxShadowBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === LINKFOX_ECHOTIK_SHADOW_PORT,
    );
    expect(linkfoxShadowBinding?.useExisting).toBe(LinkfoxEchotikShadowAdapter);
    const naverKeywordBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
    );
    expect(naverKeywordBinding).toBeDefined();
    expect(naverKeywordBinding!.useExisting).toBe(NaverSearchAdKeywordAdapter);
    const naverDatalabBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_NAVER_DATALAB_TREND_PORT,
    );
    expect(naverDatalabBinding).toBeDefined();
    expect(naverDatalabBinding!.useExisting).toBe(NaverDatalabTrendAdapter);
    const naverPopularKeywordBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
    );
    expect(naverPopularKeywordBinding).toBeDefined();
    expect(naverPopularKeywordBinding!.useExisting).toBe(
      NaverDatalabPopularKeywordAdapter,
    );
    const naverAutocompleteKeywordBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
    );
    expect(naverAutocompleteKeywordBinding).toBeDefined();
    expect(naverAutocompleteKeywordBinding!.useExisting).toBe(
      NaverAutocompleteKeywordAdapter,
    );
    const preparationBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === PRODUCT_PREPARATION_REPOSITORY_PORT,
    );
    expect(preparationBinding?.useExisting).toBe(
      ProductPreparationRepositoryAdapter,
    );
    const channelRegistrationBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === CHANNEL_PRODUCT_REGISTRATION_PORT,
    );
    expect(channelRegistrationBinding?.useExisting).toBe(
      ChannelProductRegistrationAdapter,
    );
    const contentRegistrationBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === REGISTRATION_CONTENT_WORKSPACE_PORT,
    );
    expect(contentRegistrationBinding?.useExisting).toBe(
      RegistrationContentWorkspaceAdapter,
    );
  });

  it("imports the Agent OS runtime so the gateway adapter can resolve AGENT_RUNNER_PORT", () => {
    const imports: unknown[] =
      Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    // PrismaModule + AgentOsModule + AiModule + AutomationModule + ProductsModule.
    // Supplier/procurement capability imports belong in SupplyModule.
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  it("imports controller-free Agent runtime and retains API owner dependencies", () => {
    const imports: unknown[] =
      Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    expect(imports).toContain(SourcingAgentRuntimeModule);
    expect(imports).toContain(SourcingAgentApiCollectionModule);
    expect(imports).toContain(SourcingShadowOperationModule);
    expect(imports).toContain(ChannelsModule);
    expect(imports).toContain(SupplyModule);
  });

  it("owns Agent providers only in the controller-free runtime", () => {
    const ownerProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    const runtimeProviders: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, SourcingAgentRuntimeModule) ?? [];
    expect(Reflect.getMetadata(CONTROLLERS_KEY, SourcingAgentRuntimeModule) ?? [])
      .toEqual([]);
    for (const provider of [
      SourcingAgentGatewayAdapter,
      SourcingListingPrepCapabilityAdapter,
      SourcingScrapeUrlCapabilityAdapter,
      SourcingWorkspaceCapabilityAdapter,
      SourcingRuntimeHandler,
    ]) {
      expect(runtimeProviders).toContain(provider);
      expect(ownerProviders).not.toContain(provider);
    }
  });

  it("keeps public /api route prefix on every route-family controller", () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(
      controllers.map((controller) =>
        Reflect.getMetadata(PATH_KEY, controller as object),
      ),
    ).toEqual([
      "sourcing",
      "sourcing/operations",
      "sourcing/operations",
      "sourcing/keyword-analysis",
      "sourcing/wholesale/1688-results",
      "sourcing/agent-rag",
      "sourcing/rising-products",
      "sourcing/intelligence",
      "sourcing",
      "sourcing/trend/shadow",
      "sourcing/workspace/interests",
      "sourcing/workspace",
      "sourcing/workspace",
      // 두 세그먼트여야 한다. `sourcing` (SourcingController) 이 `GET /:id` 로
      // 한 세그먼트를 잡으므로, `sourcing/entry-recommendations` 였다면 후보 ID 로
      // 해석돼 UUID 파싱 오류가 난다.
      "sourcing/entry",
      "sourcing/trend",
      "sourcing/live-commerce",
    ]);
  });
});

function expectBinding(
  providers: unknown[],
  token: symbol,
  adapter: unknown,
): void {
  expect(
    providers.find(
      (provider): provider is { provide: symbol; useExisting: unknown } =>
        typeof provider === "object" &&
        provider !== null &&
        (provider as { provide?: unknown }).provide === token,
    )?.useExisting,
  ).toBe(adapter);
}

function providerNames(providers: unknown[]): string[] {
  return providers.flatMap((provider) => {
    if (typeof provider === "function") return [provider.name];
    if (typeof provider !== "object" || provider === null) return [];
    const useClass = (provider as { useClass?: unknown }).useClass;
    return typeof useClass === "function" ? [useClass.name] : [];
  });
}
