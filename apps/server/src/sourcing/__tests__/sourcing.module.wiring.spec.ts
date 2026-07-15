import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { SourcingModule } from "../sourcing.module";
import { Sourcing1688NewProductModelService } from "../application/service/sourcing-1688-new-product-model.service";
import { Sourcing1688ImageSearchService } from "../application/service/sourcing-1688-image-search.service";
import { Sourcing1688KeywordSearchService } from "../application/service/sourcing-1688-keyword-search.service";
import { SourcingAgentRagService } from "../application/service/sourcing-agent-rag.service";
import { SourcingMarketModelService } from "../application/service/sourcing-market-model.service";
import { NaverKeywordResearchService } from "../application/service/naver-keyword-research.service";
import { TrendCollectService } from "../application/service/trend-collect.service";
import { TrendQueryService } from "../application/service/trend-query.service";
import { LiveCommerceService } from "../application/service/live-commerce.service";
import { SourcingService } from "../application/service/sourcing.service";
import { SourcingPromotionService } from "../application/service/sourcing-promotion.service";
import { SourcingWorkspaceArchiveService } from "../application/service/sourcing-workspace-archive.service";
import { SourcingWorkspaceSnapshotService } from "../application/service/sourcing-workspace-snapshot.service";
import { SourcingMarketDiscoveryService } from "../application/service/sourcing-market-discovery.service";
import { SourcingDiscoveryCapabilityAdapter } from "../adapter/in/agent/sourcing-discovery-capability.adapter";
import { SourcingListingPrepCapabilityAdapter } from "../adapter/in/agent/sourcing-listing-prep-capability.adapter";
import { SourcingScrapeUrlCapabilityAdapter } from "../adapter/in/agent/sourcing-scrape-url-capability.adapter";
import { Sourcing1688TrendExtensionController } from "../adapter/in/http/sourcing-1688-trend-extension.controller";
import { SourcingLiveCommerceExtensionController } from "../adapter/in/http/sourcing-live-commerce-extension.controller";
import { NaverDatalabPopularKeywordAdapter } from "../adapter/out/naver/naver-datalab-popular-keyword.adapter";
import { NaverDatalabTrendAdapter } from "../adapter/out/naver/naver-datalab-trend.adapter";
import { NaverAutocompleteKeywordAdapter } from "../adapter/out/naver/naver-autocomplete-keyword.adapter";
import { NaverSearchAdKeywordAdapter } from "../adapter/out/naver/naver-search-ad-keyword.adapter";
import { SourcingAgentGatewayAdapter } from "../adapter/out/agent/sourcing-agent.gateway.adapter";
import { SourcingAiWorkspaceArchiveAdapter } from "../adapter/out/ai/workspace-archive.adapter";
import { SourcingOperationAlertAdapter } from "../adapter/out/automation/operation-alert.adapter";
import { SourcingCandidateRepositoryAdapter } from "../adapter/out/repository/sourcing-candidate.repository.adapter";
import { SourcingWorkspaceSnapshotRepositoryAdapter } from "../adapter/out/repository/sourcing-workspace-snapshot.repository.adapter";
import { SourcingPlaywrightRuntimeHandler } from "../adapter/out/runtime/sourcing-playwright-runtime.handler";
import { Direct1688ImageSearchAdapter } from "../adapter/out/1688/direct-1688-image-search.adapter";
import { Direct1688KeywordSearchAdapter } from "../adapter/out/1688/direct-1688-keyword-search.adapter";
import { ShortstrendTrendAdapter } from "../adapter/out/shortstrend/shortstrend-trend.adapter";
import { TrendCollectionRepositoryAdapter } from "../adapter/out/repository/trend-collection.repository.adapter";
import { LiveCommerceRepositoryAdapter } from "../adapter/out/repository/live-commerce.repository.adapter";
import { TaobaoLiveAdapter } from "../adapter/out/taobao/taobao-live.adapter";
import { SourcingRuntimeHandler } from "../adapter/out/runtime/sourcing-runtime.handler";
import {
  SOURCING_DISCOVERY_CAPABILITY_PORT,
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from "../application/port/in/capability/sourcing-capability.ports";
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
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from "../application/port/out/repository/sourcing-workspace-snapshot.repository.port";
import { TREND_COLLECTION_REPOSITORY_PORT } from "../application/port/out/repository/trend-collection.repository.port";
import { LIVE_COMMERCE_REPOSITORY_PORT } from "../application/port/out/repository/live-commerce.repository.port";
import { AutomationModule } from "../../automation/automation.module";
import { ChannelsModule } from "../../channels/channels.module";
import { ProductRegistrationService } from "../application/service/product-registration.service";
import { ProductPreparationRepositoryAdapter } from "../adapter/out/repository/product-preparation.repository.adapter";
import { ChannelProductRegistrationAdapter } from "../adapter/out/channels/channel-product-registration.adapter";
import { RegistrationContentWorkspaceAdapter } from "../adapter/out/ai/registration-content-workspace.adapter";
import { PRODUCT_PREPARATION_REPOSITORY_PORT } from "../application/port/out/repository/product-preparation.repository.port";
import { CHANNEL_PRODUCT_REGISTRATION_PORT } from "../application/port/out/cross-domain/channel-product-registration.port";
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from "../application/port/out/cross-domain/registration-content-workspace.port";

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = "imports";
const CONTROLLERS_KEY = "controllers";
const PROVIDERS_KEY = "providers";
const PATH_KEY = "path";

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
      "Sourcing1688TrendExtensionController",
      "SourcingLiveCommerceExtensionController",
      "SourcingKeywordResearchController",
      "Sourcing1688ImageSearchController",
      "Sourcing1688KeywordSearchController",
      "SourcingAgentRagController",
      "SourcingMarketModelController",
      "Sourcing1688NewProductModelController",
      "SourcingCandidateWorkspaceController",
      "SourcingWorkspaceSnapshotController",
      "TrendCollectionController",
      "LiveCommerceController",
    ]);
    expect(controllers).toContain(Sourcing1688TrendExtensionController);
    expect(controllers).toContain(SourcingLiveCommerceExtensionController);
  });

  it("declares every application service as a provider", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(SourcingService);
    expect(providers).toContain(NaverKeywordResearchService);
    expect(providers).toContain(Sourcing1688ImageSearchService);
    expect(providers).toContain(Sourcing1688KeywordSearchService);
    expect(providers).toContain(SourcingAgentRagService);
    expect(providers).toContain(SourcingMarketModelService);
    expect(providers).toContain(Sourcing1688NewProductModelService);
    expect(providers).toContain(SourcingPromotionService);
    expect(providers).toContain(SourcingWorkspaceArchiveService);
    expect(providers).toContain(SourcingWorkspaceSnapshotService);
    expect(providers).toContain(SourcingMarketDiscoveryService);
    expect(providers).toContain(TrendCollectService);
    expect(providers).toContain(TrendQueryService);
    expect(providers).toContain(LiveCommerceService);
    expect(providers).toContain(ProductRegistrationService);
  });

  it("binds outgoing ports to their adapters", () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(NaverDatalabPopularKeywordAdapter);
    expect(providers).toContain(NaverDatalabTrendAdapter);
    expect(providers).toContain(NaverAutocompleteKeywordAdapter);
    expect(providers).toContain(NaverSearchAdKeywordAdapter);
    expect(providers).toContain(SourcingAgentGatewayAdapter);
    expect(providers).toContain(SourcingAiWorkspaceArchiveAdapter);
    expect(providers).toContain(SourcingOperationAlertAdapter);
    expect(providers).toContain(SourcingCandidateRepositoryAdapter);
    expect(providers).toContain(SourcingWorkspaceSnapshotRepositoryAdapter);
    expect(providers).toContain(SourcingDiscoveryCapabilityAdapter);
    expect(providers).toContain(SourcingListingPrepCapabilityAdapter);
    expect(providers).toContain(SourcingScrapeUrlCapabilityAdapter);
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
    const discoveryBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === "object" &&
        p !== null &&
        (p as any).provide === SOURCING_DISCOVERY_CAPABILITY_PORT,
    );
    expect(discoveryBinding).toBeDefined();
    expect(discoveryBinding!.useExisting).toBe(
      SourcingDiscoveryCapabilityAdapter,
    );
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
    expect(keywordSearchBinding!.useExisting).toBe(
      Direct1688KeywordSearchAdapter,
    );
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

  it("imports AutomationModule so its operation-alert adapter can resolve the owner-side port", () => {
    const imports: unknown[] =
      Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    expect(imports).toContain(AutomationModule);
    expect(imports).toContain(ChannelsModule);
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
      "sourcing/extension/trend",
      "sourcing/extension/trend",
      "sourcing/keyword-research/naver",
      "sourcing/1688/image-search",
      "sourcing/1688/keyword-search",
      "sourcing/agent-rag",
      "sourcing/market-model",
      "sourcing/1688-new-product-model",
      "sourcing",
      "sourcing/workspace-snapshots",
      "sourcing/trend",
      "sourcing/live-commerce",
    ]);
  });
});
