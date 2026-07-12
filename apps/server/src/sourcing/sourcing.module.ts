import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { ProductsModule } from '../products/products.module';
import { ChannelsModule } from '../channels/channels.module';

import { Sourcing1688NewProductModelController } from './adapter/in/http/sourcing-1688-new-product-model.controller';
import { SourcingCandidateWorkspaceController } from './adapter/in/http/sourcing-candidate-workspace.controller';
import { SourcingDiscoveryCapabilityAdapter } from './adapter/in/agent/sourcing-discovery-capability.adapter';
import { SourcingListingPrepCapabilityAdapter } from './adapter/in/agent/sourcing-listing-prep-capability.adapter';
import { SourcingScrapeUrlCapabilityAdapter } from './adapter/in/agent/sourcing-scrape-url-capability.adapter';
import { Sourcing1688ImageSearchController } from './adapter/in/http/sourcing-1688-image-search.controller';
import { Sourcing1688KeywordSearchController } from './adapter/in/http/sourcing-1688-keyword-search.controller';
import { SourcingAgentRagController } from './adapter/in/http/sourcing-agent-rag.controller';
import { SourcingExtensionIngestController } from './adapter/in/http/sourcing-extension-ingest.controller';
import { SourcingKeywordResearchController } from './adapter/in/http/sourcing-keyword-research.controller';
import { SourcingMarketModelController } from './adapter/in/http/sourcing-market-model.controller';
import { SourcingWorkspaceSnapshotController } from './adapter/in/http/sourcing-workspace-snapshot.controller';
import { NaverKeywordResearchService } from './application/service/naver-keyword-research.service';
import { Sourcing1688NewProductModelService } from './application/service/sourcing-1688-new-product-model.service';
import { Sourcing1688ImageSearchService } from './application/service/sourcing-1688-image-search.service';
import { Sourcing1688KeywordSearchService } from './application/service/sourcing-1688-keyword-search.service';
import { SourcingAgentRagService } from './application/service/sourcing-agent-rag.service';
import { SourcingMarketModelService } from './application/service/sourcing-market-model.service';
import { SourcingService } from './application/service/sourcing.service';
import { SourcingPromotionService } from './application/service/sourcing-promotion.service';
import { SourcingWorkspaceArchiveService } from './application/service/sourcing-workspace-archive.service';
import { SourcingWorkspaceSnapshotService } from './application/service/sourcing-workspace-snapshot.service';
import { ProductPreparationSelectionService } from './application/service/product-preparation-selection.service';
import { ProductRegistrationService } from './application/service/product-registration.service';
import { SourcingScrapeFinalizedBridge } from './application/service/sourcing-scrape-finalized.bridge';
import { SourcingMarketDiscoveryService } from './application/service/sourcing-market-discovery.service';

import { NaverDatalabPopularKeywordAdapter } from './adapter/out/naver/naver-datalab-popular-keyword.adapter';
import { NaverDatalabTrendAdapter } from './adapter/out/naver/naver-datalab-trend.adapter';
import { NaverAutocompleteKeywordAdapter } from './adapter/out/naver/naver-autocomplete-keyword.adapter';
import { NaverSearchAdKeywordAdapter } from './adapter/out/naver/naver-search-ad-keyword.adapter';
import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingAiWorkspaceArchiveAdapter } from './adapter/out/ai/workspace-archive.adapter';
import { SourcingOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { SourcingProductsCatalogAdapter } from './adapter/out/products/products-catalog.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { ProductPreparationRepositoryAdapter } from './adapter/out/repository/product-preparation.repository.adapter';
import { ChannelProductRegistrationAdapter } from './adapter/out/channels/channel-product-registration.adapter';
import { RegistrationContentWorkspaceAdapter } from './adapter/out/ai/registration-content-workspace.adapter';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { Direct1688ImageSearchAdapter } from './adapter/out/1688/direct-1688-image-search.adapter';
import { Direct1688KeywordSearchAdapter } from './adapter/out/1688/direct-1688-keyword-search.adapter';
import { SourcingRuntimeHandler } from './adapter/out/runtime/sourcing-runtime.handler';
import {
  SOURCING_DISCOVERY_CAPABILITY_PORT,
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from './application/port/in/capability/sourcing-capability.ports';
import { SOURCING_1688_IMAGE_SEARCH_PORT } from './application/port/out/provider/1688-image-search.port';
import { SOURCING_1688_KEYWORD_SEARCH_PORT } from './application/port/out/provider/1688-keyword-search.port';
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
} from './application/port/out/provider/naver-keyword-research.port';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/runtime/sourcing-agent.gateway.port';
import { SOURCING_AI_WORKSPACE_ARCHIVE_PORT } from './application/port/out/cross-domain/ai-workspace-archive.port';
import { SOURCING_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { SOURCING_PRODUCTS_CATALOG_PORT } from './application/port/out/cross-domain/products-catalog.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { PRODUCT_PREPARATION_REPOSITORY_PORT } from './application/port/out/repository/product-preparation.repository.port';
import { CHANNEL_PRODUCT_REGISTRATION_PORT } from './application/port/out/cross-domain/channel-product-registration.port';
import { REGISTRATION_CONTENT_WORKSPACE_PORT } from './application/port/out/cross-domain/registration-content-workspace.port';

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
 * `SOURCING_CANDIDATE_REPOSITORY_PORT`. Candidate→Master promotion fires
 * `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` which delegates to the AI
 * domain's `POST_PROMOTION_AI_TRIGGER_PORT` (exported by `AiModule`).
 */
@Module({
  imports: [
    PrismaModule,
    AgentOsModule,
    AiModule,
    AutomationModule,
    ProductsModule,
    ChannelsModule,
  ],
  controllers: [
    SourcingExtensionIngestController,
    SourcingKeywordResearchController,
    Sourcing1688ImageSearchController,
    Sourcing1688KeywordSearchController,
    SourcingAgentRagController,
    SourcingMarketModelController,
    Sourcing1688NewProductModelController,
    SourcingCandidateWorkspaceController,
    SourcingWorkspaceSnapshotController,
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
    SourcingMarketDiscoveryService,
    ProductPreparationSelectionService,
    ProductRegistrationService,
    SourcingScrapeFinalizedBridge,
    SourcingDiscoveryCapabilityAdapter,
    SourcingListingPrepCapabilityAdapter,
    SourcingScrapeUrlCapabilityAdapter,
    NaverDatalabPopularKeywordAdapter,
    NaverDatalabTrendAdapter,
    NaverAutocompleteKeywordAdapter,
    NaverSearchAdKeywordAdapter,
    SourcingAgentGatewayAdapter,
    SourcingAiWorkspaceArchiveAdapter,
    SourcingOperationAlertAdapter,
    SourcingProductsCatalogAdapter,
    SourcingCandidateRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    ProductPreparationRepositoryAdapter,
    ChannelProductRegistrationAdapter,
    RegistrationContentWorkspaceAdapter,
    SourcingPlaywrightRuntimeHandler,
    Direct1688ImageSearchAdapter,
    Direct1688KeywordSearchAdapter,
    SourcingRuntimeHandler,
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
      provide: SOURCING_PRODUCTS_CATALOG_PORT,
      useExisting: SourcingProductsCatalogAdapter,
    },
    {
      provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingCandidateRepositoryAdapter,
    },
    {
      provide: SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
      useExisting: SourcingWorkspaceSnapshotRepositoryAdapter,
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
      provide: REGISTRATION_CONTENT_WORKSPACE_PORT,
      useExisting: RegistrationContentWorkspaceAdapter,
    },
  ],
})
export class SourcingModule {}
