import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingWorkspaceReadCapabilityAdapter } from './adapter/in/agent/sourcing-workspace-capability.adapter';
import { SourcingInterestTargetRepositoryAdapter } from './adapter/out/repository/sourcing-interest-target.repository.adapter';
import { SourcingRecommendationRepositoryAdapter } from './adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingValidationRepositoryAdapter } from './adapter/out/repository/sourcing-validation.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT } from './application/port/in/capability/sourcing-agent-workspace-capability.port';
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from './application/port/out/repository/sourcing-interest-target.repository.port';
import { SOURCING_RECOMMENDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-recommendation.repository.port';
import { SOURCING_VALIDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-validation.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { SourcingAgentRagService } from './application/service/sourcing-agent-rag.service';
import { SourcingAgentWorkspaceReadCapabilityService } from './application/service/sourcing-agent-workspace-capability.service';

/** Controller-free, Operations-free owner for the two persisted Sourcing reads. */
@Module({
  imports: [PrismaModule, AgentOsCapabilityModule],
  providers: [
    SourcingAgentRagService,
    SourcingAgentWorkspaceReadCapabilityService,
    SourcingWorkspaceReadCapabilityAdapter,
    SourcingInterestTargetRepositoryAdapter,
    SourcingRecommendationRepositoryAdapter,
    SourcingValidationRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    {
      provide: SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT,
      useExisting: SourcingAgentWorkspaceReadCapabilityService,
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
      provide: SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
      useExisting: SourcingWorkspaceSnapshotRepositoryAdapter,
    },
  ],
  exports: [
    SourcingAgentRagService,
    SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT,
  ],
})
export class SourcingAgentReadCapabilityModule {}
