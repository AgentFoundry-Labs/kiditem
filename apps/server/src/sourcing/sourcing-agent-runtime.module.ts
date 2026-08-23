import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { AgentOsApiExecutionModule } from '../agent-os/agent-os-api-execution.module';
import { AiAgentRuntimeModule } from '../ai/ai-agent-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingListingPrepCapabilityAdapter } from './adapter/in/agent/sourcing-listing-prep-capability.adapter';
import { SourcingScrapeUrlCapabilityAdapter } from './adapter/in/agent/sourcing-scrape-url-capability.adapter';
import { SourcingWorkspaceMutationCapabilityAdapter } from './adapter/in/agent/sourcing-workspace-capability.adapter';
import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingInterestTargetRepositoryAdapter } from './adapter/out/repository/sourcing-interest-target.repository.adapter';
import { SourcingRecommendationRepositoryAdapter } from './adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingReviewRepositoryAdapter } from './adapter/out/repository/sourcing-review.repository.adapter';
import { SourcingValidationRepositoryAdapter } from './adapter/out/repository/sourcing-validation.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { TrendCollectionRepositoryAdapter } from './adapter/out/repository/trend-collection.repository.adapter';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { SourcingScrapeUrlOperationHandler } from './adapter/in/operation/sourcing-scrape-url.operation-handler';
import { SourcingScrapeOperationAdapter } from './adapter/out/operations/sourcing-scrape-operation.adapter';
import {
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from './application/port/in/capability/sourcing-capability.ports';
import { SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT } from './application/port/in/capability/sourcing-agent-workspace-capability.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from './application/port/out/repository/sourcing-interest-target.repository.port';
import { SOURCING_RECOMMENDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-recommendation.repository.port';
import { SOURCING_REVIEW_REPOSITORY_PORT } from './application/port/out/repository/sourcing-review.repository.port';
import { SOURCING_VALIDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-validation.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { TREND_COLLECTION_REPOSITORY_PORT } from './application/port/out/repository/trend-collection.repository.port';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/runtime/sourcing-agent.gateway.port';
import { SOURCING_SCRAPE_OPERATION_PORT } from './application/port/out/cross-domain/sourcing-scrape-operation.port';
import { OperationsModule } from '../operations/operations.module';
import { SourcingAgentCommandService } from './application/service/sourcing-agent-command.service';
import { SourcingAgentWorkspaceMutationCapabilityService } from './application/service/sourcing-agent-workspace-capability.service';
import { SourcingReviewService } from './application/service/sourcing-review.service';
import { SourcingScrapeResultService } from './application/service/sourcing-scrape-result.service';
import { SourcingValidationService } from './application/service/sourcing-validation.service';
import { SourcingAgentReadCapabilityModule } from './sourcing-agent-read-capability.module';
import { SourcingAgentListingCapabilityModule } from './sourcing-agent-listing-capability.module';

@Module({
  imports: [
    PrismaModule,
    AgentOsApiExecutionModule,
    AgentOsCapabilityModule,
    OperationsModule,
    AiAgentRuntimeModule,
    SourcingAgentReadCapabilityModule,
    SourcingAgentListingCapabilityModule,
  ],
  providers: [
    SourcingAgentWorkspaceMutationCapabilityService,
    SourcingReviewService,
    SourcingScrapeResultService,
    SourcingValidationService,
    SourcingScrapeUrlCapabilityAdapter,
    SourcingWorkspaceMutationCapabilityAdapter,
    SourcingInterestTargetRepositoryAdapter,
    SourcingRecommendationRepositoryAdapter,
    SourcingReviewRepositoryAdapter,
    SourcingValidationRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    TrendCollectionRepositoryAdapter,
    SourcingPlaywrightRuntimeHandler,
    SourcingScrapeUrlOperationHandler,
    SourcingScrapeOperationAdapter,
    {
      provide: SOURCING_SCRAPE_URL_WORKFLOW_PORT,
      useExisting: SourcingScrapeUrlCapabilityAdapter,
    },
    {
      provide: SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT,
      useExisting: SourcingAgentWorkspaceMutationCapabilityService,
    },
    { provide: SOURCING_SCRAPE_OPERATION_PORT, useExisting: SourcingScrapeOperationAdapter },
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
      provide: TREND_COLLECTION_REPOSITORY_PORT,
      useExisting: TrendCollectionRepositoryAdapter,
    },
  ],
  exports: [
    SourcingAgentListingCapabilityModule,
    SourcingAgentReadCapabilityModule,
    SourcingReviewService,
    SourcingValidationService,
    SOURCING_SCRAPE_OPERATION_PORT,
    SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
    SOURCING_RECOMMENDATION_REPOSITORY_PORT,
    SOURCING_VALIDATION_REPOSITORY_PORT,
    SOURCING_REVIEW_REPOSITORY_PORT,
    SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
    TREND_COLLECTION_REPOSITORY_PORT,
    SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT,
    SOURCING_SCRAPE_URL_WORKFLOW_PORT,
    SourcingPlaywrightRuntimeHandler,
  ],
})
export class SourcingAgentRuntimeModule {}
