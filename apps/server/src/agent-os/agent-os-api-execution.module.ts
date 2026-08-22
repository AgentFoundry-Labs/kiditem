import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { StorageModule } from '../common/storage/storage.module';
import { StorageAgentSessionArtifactAdapter } from './adapter/out/storage/storage-agent-session-artifact.adapter';
import { AGENT_SESSION_ARTIFACT_WRITER_PORT } from './application/port/in/session-execution/agent-session-artifact-writer.port';
import { AGENT_SESSION_ARTIFACT_STORAGE_PORT } from './application/port/out/storage/agent-session-artifact-storage.port';
import { OperationDefinitionSnapshotAdapter } from './adapter/out/operation/operation-definition-snapshot.adapter';
import { AGENT_SESSION_OWNED_OPERATION_PORT } from './application/port/in/session-control/agent-session-owned-operation.port';
import { AGENT_SESSION_OPERATION_PLATFORM_PORT } from './application/port/out/operation/agent-session-operation-platform.port';
import { AgentSessionOwnedOperationService } from './application/service/session-control/agent-session-owned-operation.service';
import { AgentSessionArtifactWriterService } from './application/service/session-execution/agent-session-artifact-writer.service';
import { AgentSessionDeletionExecutionService } from './application/service/session-execution/agent-session-deletion-execution.service';
import { OperationsAgentSessionOwnedOperationControlAdapter } from './adapter/out/operation/operations-agent-session-owned-operation-control.adapter';
import { AGENT_SESSION_DELETION_EXECUTION_PORT } from './application/port/in/session-execution/agent-session-deletion-execution.port';
import { AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT } from './application/port/out/operation/agent-session-owned-operation-control.port';
import { OPERATION_EXACT_RUN_CONTROL_PORT } from '../operations/application/port/in/operation-exact-run-control.port';
import { AgentOsSessionModule } from './agent-os-session.module';

/** API-only composition for Operations-backed AgentSession execution creation. */
@Module({
  imports: [AgentOsSessionModule, OperationsModule, StorageModule],
  providers: [
    OperationDefinitionSnapshotAdapter,
    AgentSessionOwnedOperationService,
    StorageAgentSessionArtifactAdapter,
    AgentSessionArtifactWriterService,
    AgentSessionDeletionExecutionService,
    {
      provide: AGENT_SESSION_OPERATION_PLATFORM_PORT,
      useExisting: OperationDefinitionSnapshotAdapter,
    },
    {
      provide: AGENT_SESSION_OWNED_OPERATION_PORT,
      useExisting: AgentSessionOwnedOperationService,
    },
    {
      provide: AGENT_SESSION_ARTIFACT_STORAGE_PORT,
      useExisting: StorageAgentSessionArtifactAdapter,
    },
    {
      provide: AGENT_SESSION_ARTIFACT_WRITER_PORT,
      useExisting: AgentSessionArtifactWriterService,
    },
    { provide: AGENT_SESSION_DELETION_EXECUTION_PORT, useExisting: AgentSessionDeletionExecutionService },
    {
      provide: AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT,
      inject: [OPERATION_EXACT_RUN_CONTROL_PORT],
      useFactory: (exact: import('../operations/application/port/in/operation-exact-run-control.port').OperationExactRunControlPort) =>
        new OperationsAgentSessionOwnedOperationControlAdapter({
          validateOwnedClosure: async (input) => input.operationRunIds.map((runId) => ({
            runId, operationKey: 'validated-by-deletion-snapshot', expectedAttemptToken: null,
          })),
        }, exact),
    },
  ],
  exports: [AGENT_SESSION_OWNED_OPERATION_PORT, AGENT_SESSION_ARTIFACT_WRITER_PORT, AGENT_SESSION_DELETION_EXECUTION_PORT],
})
export class AgentOsApiExecutionModule {}
