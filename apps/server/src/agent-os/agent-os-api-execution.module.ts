import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { OperationDefinitionSnapshotAdapter } from './adapter/out/operation/operation-definition-snapshot.adapter';
import { AGENT_SESSION_OWNED_OPERATION_PORT } from './application/port/in/session-control/agent-session-owned-operation.port';
import { AGENT_SESSION_OPERATION_PLATFORM_PORT } from './application/port/out/operation/agent-session-operation-platform.port';
import { AgentSessionOwnedOperationService } from './application/service/session-control/agent-session-owned-operation.service';
import { AgentOsSessionModule } from './agent-os-session.module';

/** API-only composition for Operations-backed AgentSession execution creation. */
@Module({
  imports: [AgentOsSessionModule, OperationsModule],
  providers: [
    OperationDefinitionSnapshotAdapter,
    AgentSessionOwnedOperationService,
    {
      provide: AGENT_SESSION_OPERATION_PLATFORM_PORT,
      useExisting: OperationDefinitionSnapshotAdapter,
    },
    {
      provide: AGENT_SESSION_OWNED_OPERATION_PORT,
      useExisting: AgentSessionOwnedOperationService,
    },
  ],
  exports: [AGENT_SESSION_OWNED_OPERATION_PORT],
})
export class AgentOsApiExecutionModule {}
