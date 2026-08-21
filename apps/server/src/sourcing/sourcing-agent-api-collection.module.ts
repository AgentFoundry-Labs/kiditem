import { Module } from '@nestjs/common';
import { AgentOsSessionModule } from '../agent-os/agent-os-session.module';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { OperationsModule } from '../operations/operations.module';
import { AgentApiCapabilityGrantGuard } from '../agent-os/adapter/in/http/agent-api-capability-grant.guard';
import { SourcingCollectionCapabilityAdapter } from './adapter/in/agent/sourcing-collection-capability.adapter';
import { InternalSourcingCollectionController } from './adapter/in/http/internal-sourcing-collection.controller';
import { SourcingCollectionOperationAdapter } from './adapter/out/operations/sourcing-collection-operation.adapter';
import { SOURCING_COLLECTION_OPERATION_PORT } from './application/port/out/cross-domain/sourcing-collection-operation.port';

@Module({
  imports: [AgentOsSessionModule, AgentOsCapabilityModule, OperationsModule],
  controllers: [InternalSourcingCollectionController],
  providers: [
    AgentApiCapabilityGrantGuard,
    SourcingCollectionCapabilityAdapter,
    SourcingCollectionOperationAdapter,
    {
      provide: SOURCING_COLLECTION_OPERATION_PORT,
      useExisting: SourcingCollectionOperationAdapter,
    },
  ],
})
export class SourcingAgentApiCollectionModule {}
