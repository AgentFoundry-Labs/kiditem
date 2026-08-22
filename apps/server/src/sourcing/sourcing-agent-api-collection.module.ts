import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { OperationsModule } from '../operations/operations.module';
import { SourcingCollectionCapabilityAdapter } from './adapter/in/agent/sourcing-collection-capability.adapter';
import { SourcingCollectionOperationAdapter } from './adapter/out/operations/sourcing-collection-operation.adapter';
import { SOURCING_COLLECTION_OPERATION_PORT } from './application/port/out/cross-domain/sourcing-collection-operation.port';

@Module({
  imports: [AgentOsCapabilityModule, OperationsModule],
  providers: [
    SourcingCollectionCapabilityAdapter,
    SourcingCollectionOperationAdapter,
    {
      provide: SOURCING_COLLECTION_OPERATION_PORT,
      useExisting: SourcingCollectionOperationAdapter,
    },
  ],
})
export class SourcingAgentApiCollectionModule {}
