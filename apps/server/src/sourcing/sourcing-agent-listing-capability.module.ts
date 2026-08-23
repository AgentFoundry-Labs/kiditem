import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { AiProductGenerationRuntimeModule } from '../ai/ai-product-generation-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SourcingListingPrepCapabilityAdapter } from './adapter/in/agent/sourcing-listing-prep-capability.adapter';
import { SourcingAgentGatewayAdapter } from './adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SOURCING_LISTING_PREP_CAPABILITY_PORT } from './application/port/in/capability/sourcing-capability.ports';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_AGENT_GATEWAY_PORT } from './application/port/out/runtime/sourcing-agent.gateway.port';
import { SourcingAgentCommandService } from './application/service/sourcing-agent-command.service';

/** Controller-free Sourcing owner for the listing package capability. */
@Module({
  imports: [PrismaModule, AgentOsCapabilityModule, AiProductGenerationRuntimeModule],
  providers: [
    SourcingAgentCommandService,
    SourcingListingPrepCapabilityAdapter,
    SourcingAgentGatewayAdapter,
    SourcingCandidateRepositoryAdapter,
    {
      provide: SOURCING_LISTING_PREP_CAPABILITY_PORT,
      useExisting: SourcingListingPrepCapabilityAdapter,
    },
    { provide: SOURCING_AGENT_GATEWAY_PORT, useExisting: SourcingAgentGatewayAdapter },
    {
      provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingCandidateRepositoryAdapter,
    },
  ],
  exports: [
    SOURCING_LISTING_PREP_CAPABILITY_PORT,
    SOURCING_AGENT_GATEWAY_PORT,
    SOURCING_CANDIDATE_REPOSITORY_PORT,
    SourcingAgentCommandService,
  ],
})
export class SourcingAgentListingCapabilityModule {}
