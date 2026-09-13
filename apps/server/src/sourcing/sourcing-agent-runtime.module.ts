import { Module } from '@nestjs/common';
import { AiAgentRuntimeModule } from '../ai/ai-agent-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingInterestTargetRepositoryAdapter } from './adapter/out/repository/sourcing-interest-target.repository.adapter';
import { SourcingRecommendationRepositoryAdapter } from './adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingReviewRepositoryAdapter } from './adapter/out/repository/sourcing-review.repository.adapter';
import { SourcingValidationRepositoryAdapter } from './adapter/out/repository/sourcing-validation.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { TrendCollectionRepositoryAdapter } from './adapter/out/repository/trend-collection.repository.adapter';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT } from './application/port/in/capability/sourcing-agent-workspace-capability.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from './application/port/out/repository/sourcing-interest-target.repository.port';
import { SOURCING_RECOMMENDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-recommendation.repository.port';
import { SOURCING_REVIEW_REPOSITORY_PORT } from './application/port/out/repository/sourcing-review.repository.port';
import { SOURCING_VALIDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-validation.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { TREND_COLLECTION_REPOSITORY_PORT } from './application/port/out/repository/trend-collection.repository.port';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/runtime/sourcing-agent.gateway.port';
import { SourcingAgentCommandService } from './application/service/sourcing-agent-command.service';
import { SourcingAgentWorkspaceMutationCapabilityService } from './application/service/sourcing-agent-workspace-capability.service';
import { SourcingReviewService } from './application/service/sourcing-review.service';
import { SourcingValidationService } from './application/service/sourcing-validation.service';
import { SourcingAgentReadCapabilityModule } from './sourcing-agent-read-capability.module';

@Module({
  imports: [
    PrismaModule,
    AiAgentRuntimeModule,
    SourcingAgentReadCapabilityModule,
  ],
  providers: [
    SourcingAgentCommandService,
    SourcingAgentWorkspaceMutationCapabilityService,
    SourcingReviewService,
    SourcingValidationService,
    SourcingAgentGatewayAdapter,
    SourcingCandidateRepositoryAdapter,
    SourcingInterestTargetRepositoryAdapter,
    SourcingRecommendationRepositoryAdapter,
    SourcingReviewRepositoryAdapter,
    SourcingValidationRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    TrendCollectionRepositoryAdapter,
    SourcingPlaywrightRuntimeHandler,
    {
      provide: SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT,
      useExisting: SourcingAgentWorkspaceMutationCapabilityService,
    },
    { provide: SOURCING_AGENT_GATEWAY_PORT, useExisting: SourcingAgentGatewayAdapter },
    { provide: SOURCING_CANDIDATE_REPOSITORY_PORT, useExisting: SourcingCandidateRepositoryAdapter },
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
    SourcingAgentReadCapabilityModule,
    SourcingAgentCommandService,
    SOURCING_AGENT_GATEWAY_PORT,
    SOURCING_CANDIDATE_REPOSITORY_PORT,
    SourcingReviewService,
    SourcingValidationService,
    SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
    SOURCING_RECOMMENDATION_REPOSITORY_PORT,
    SOURCING_VALIDATION_REPOSITORY_PORT,
    SOURCING_REVIEW_REPOSITORY_PORT,
    SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
    TREND_COLLECTION_REPOSITORY_PORT,
    SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT,
    SourcingPlaywrightRuntimeHandler,
  ],
})
export class SourcingAgentRuntimeModule {}
