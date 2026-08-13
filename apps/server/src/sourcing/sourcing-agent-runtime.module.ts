import { Module } from '@nestjs/common';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AiAgentRuntimeModule } from '../ai/ai-agent-runtime.module';
import { OperationAlertRuntimeModule } from '../automation/operation-alert-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketShadowSignalCapabilityAdapter } from './adapter/in/agent/market-shadow-signal-capability.adapter';
import { SourcingListingPrepCapabilityAdapter } from './adapter/in/agent/sourcing-listing-prep-capability.adapter';
import { SourcingScrapeUrlCapabilityAdapter } from './adapter/in/agent/sourcing-scrape-url-capability.adapter';
import { SourcingWorkspaceCapabilityAdapter } from './adapter/in/agent/sourcing-workspace-capability.adapter';
import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { GoogleTrendsRssAdapter } from './adapter/out/google-trends/google-trends-rss.adapter';
import { LinkfoxEchotikShadowAdapter } from './adapter/out/linkfox/linkfox-echotik-shadow.adapter';
import { MarketShadowSnapshotRepositoryAdapter } from './adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingInterestTargetRepositoryAdapter } from './adapter/out/repository/sourcing-interest-target.repository.adapter';
import { SourcingRecommendationRepositoryAdapter } from './adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingReviewRepositoryAdapter } from './adapter/out/repository/sourcing-review.repository.adapter';
import { SourcingValidationRepositoryAdapter } from './adapter/out/repository/sourcing-validation.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { TrendCollectionRepositoryAdapter } from './adapter/out/repository/trend-collection.repository.adapter';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { SourcingRuntimeHandler } from './adapter/out/runtime/sourcing-runtime.handler';
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from './application/port/in/capability/market-shadow-capability.port';
import {
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from './application/port/in/capability/sourcing-capability.ports';
import { SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT } from './application/port/in/capability/sourcing-agent-workspace-capability.port';
import { SOURCING_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import {
  LINKFOX_ECHOTIK_SHADOW_PORT,
  MARKET_SHADOW_SIGNAL_PORT,
} from './application/port/out/provider/market-shadow-signal.port';
import { MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/market-shadow-snapshot.repository.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from './application/port/out/repository/sourcing-interest-target.repository.port';
import { SOURCING_RECOMMENDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-recommendation.repository.port';
import { SOURCING_REVIEW_REPOSITORY_PORT } from './application/port/out/repository/sourcing-review.repository.port';
import { SOURCING_VALIDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-validation.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { TREND_COLLECTION_REPOSITORY_PORT } from './application/port/out/repository/trend-collection.repository.port';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/runtime/sourcing-agent.gateway.port';
import { SourcingAgentCommandService } from './application/service/sourcing-agent-command.service';
import { SourcingAgentRagService } from './application/service/sourcing-agent-rag.service';
import { SourcingAgentWorkspaceCapabilityService } from './application/service/sourcing-agent-workspace-capability.service';
import { SourcingReviewService } from './application/service/sourcing-review.service';
import { SourcingScrapeResultService } from './application/service/sourcing-scrape-result.service';
import { SourcingShadowSignalService } from './application/service/sourcing-shadow-signal.service';
import { SourcingValidationService } from './application/service/sourcing-validation.service';

@Module({
  imports: [
    PrismaModule,
    AgentOsModule,
    AiAgentRuntimeModule,
    OperationAlertRuntimeModule,
  ],
  providers: [
    SourcingAgentCommandService,
    SourcingAgentRagService,
    SourcingAgentWorkspaceCapabilityService,
    SourcingReviewService,
    SourcingScrapeResultService,
    SourcingShadowSignalService,
    SourcingValidationService,
    MarketShadowSignalCapabilityAdapter,
    SourcingListingPrepCapabilityAdapter,
    SourcingScrapeUrlCapabilityAdapter,
    SourcingWorkspaceCapabilityAdapter,
    SourcingAgentGatewayAdapter,
    SourcingOperationAlertAdapter,
    GoogleTrendsRssAdapter,
    LinkfoxEchotikShadowAdapter,
    MarketShadowSnapshotRepositoryAdapter,
    SourcingCandidateRepositoryAdapter,
    SourcingInterestTargetRepositoryAdapter,
    SourcingRecommendationRepositoryAdapter,
    SourcingReviewRepositoryAdapter,
    SourcingValidationRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    TrendCollectionRepositoryAdapter,
    SourcingPlaywrightRuntimeHandler,
    SourcingRuntimeHandler,
    {
      provide: MARKET_SHADOW_COLLECTION_CAPABILITY_PORT,
      useExisting: MarketShadowSignalCapabilityAdapter,
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
      provide: SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT,
      useExisting: SourcingAgentWorkspaceCapabilityService,
    },
    { provide: SOURCING_AGENT_GATEWAY_PORT, useExisting: SourcingAgentGatewayAdapter },
    {
      provide: SOURCING_OPERATION_ALERT_PORT,
      useExisting: SourcingOperationAlertAdapter,
    },
    {
      provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingCandidateRepositoryAdapter,
    },
    {
      provide: SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
      useExisting: SourcingInterestTargetRepositoryAdapter,
    },
    {
      provide: SOURCING_RECOMMENDATION_REPOSITORY_PORT,
      useExisting: SourcingRecommendationRepositoryAdapter,
    },
    {
      provide: SOURCING_VALIDATION_REPOSITORY_PORT,
      useExisting: SourcingValidationRepositoryAdapter,
    },
    {
      provide: SOURCING_REVIEW_REPOSITORY_PORT,
      useExisting: SourcingReviewRepositoryAdapter,
    },
    {
      provide: SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
      useExisting: SourcingWorkspaceSnapshotRepositoryAdapter,
    },
    {
      provide: MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT,
      useExisting: MarketShadowSnapshotRepositoryAdapter,
    },
    {
      provide: TREND_COLLECTION_REPOSITORY_PORT,
      useExisting: TrendCollectionRepositoryAdapter,
    },
    { provide: MARKET_SHADOW_SIGNAL_PORT, useExisting: GoogleTrendsRssAdapter },
    { provide: LINKFOX_ECHOTIK_SHADOW_PORT, useExisting: LinkfoxEchotikShadowAdapter },
  ],
  exports: [
    SourcingAgentCommandService,
    SourcingAgentRagService,
    SourcingReviewService,
    SourcingShadowSignalService,
    SourcingValidationService,
    SOURCING_AGENT_GATEWAY_PORT,
    SOURCING_OPERATION_ALERT_PORT,
    SOURCING_CANDIDATE_REPOSITORY_PORT,
    SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
    SOURCING_RECOMMENDATION_REPOSITORY_PORT,
    SOURCING_VALIDATION_REPOSITORY_PORT,
    SOURCING_REVIEW_REPOSITORY_PORT,
    SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
    MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT,
    TREND_COLLECTION_REPOSITORY_PORT,
  ],
})
export class SourcingAgentRuntimeModule {}
