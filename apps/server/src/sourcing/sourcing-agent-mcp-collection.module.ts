import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { SourcingCollectionCapabilityAdapter } from './adapter/in/agent/sourcing-collection-capability.adapter';
import { SourcingCollectionApiCommandAdapter } from './adapter/out/http/sourcing-collection-api-command.adapter';
import { SOURCING_COLLECTION_OPERATION_PORT } from './application/port/out/cross-domain/sourcing-collection-operation.port';

@Module({
  imports: [AgentOsCapabilityModule],
  providers: [
    SourcingCollectionCapabilityAdapter,
    SourcingCollectionApiCommandAdapter,
    {
      provide: SOURCING_COLLECTION_OPERATION_PORT,
      useExisting: SourcingCollectionApiCommandAdapter,
    },
  ],
})
export class SourcingAgentMcpCollectionModule {}
