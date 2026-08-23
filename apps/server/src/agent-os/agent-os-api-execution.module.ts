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
import { AgentSessionDeletionOperationService } from './application/service/session-execution/agent-session-deletion-operation.service';
import { OperationsAgentSessionOwnedOperationControlAdapter } from './adapter/out/operation/operations-agent-session-owned-operation-control.adapter';
import { AGENT_SESSION_DELETION_EXECUTION_PORT } from './application/port/in/session-execution/agent-session-deletion-execution.port';
import { AGENT_SESSION_DELETION_OPERATION_PORT } from './application/port/in/session-execution/agent-session-deletion-operation.port';
import { AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT } from './application/port/out/operation/agent-session-owned-operation-control.port';
import { AgentSessionDeletionOperationHandler } from './adapter/in/operation/agent-session-deletion.operation-handler';
import { AgentSessionDeletionService } from './application/service/session-control/agent-session-deletion.service';
import { AgentSessionDeletionFinalizerRecoveryService } from './application/service/session-control/agent-session-deletion-finalizer-recovery.service';
import { AgentSessionDeletionRecoveryService } from './application/service/session-control/agent-session-deletion-recovery.service';
import { PrismaAgentSessionDeletionCommandTransaction } from './adapter/out/transaction/session-deletion/prisma-agent-session-deletion-command.transaction';
import { PrismaAgentSessionDeletionFinalizationTransaction } from './adapter/out/transaction/session-deletion/prisma-agent-session-deletion-finalization.transaction';
import { PrismaAgentSessionDeletionQueryRepository } from './adapter/out/repository/session-deletion/prisma-agent-session-deletion-query.repository';
import { AGENT_SESSION_DELETION_PORT } from './application/port/in/session-control/agent-session-deletion.port';
import { AGENT_SESSION_DELETION_QUERY } from './application/port/out/repository/session-deletion/agent-session-deletion-query.port';
import { AGENT_SESSION_DELETION_COMMAND_TRANSACTION } from './application/port/out/transaction/session-deletion/agent-session-deletion-command.transaction.port';
import { AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION } from './application/port/out/transaction/session-deletion/agent-session-deletion-finalization.transaction.port';
import { AgentOsSessionModule } from './agent-os-session.module';
import { AgentOsCatalogModule } from './agent-os-catalog.module';
import { AgentJudgmentSubmissionService } from './application/service/agent-judgment-submission.service';
import { AgentJudgmentDispatchService } from './application/service/session-control/agent-judgment-dispatch.service';
import { AgentJudgmentDispatchRecoveryService } from './application/service/session-control/agent-judgment-dispatch-recovery.service';
import { AgentSessionTaskDispatchService } from './application/service/session-control/agent-session-task-dispatch.service';
import { AGENT_JUDGMENT_SUBMISSION_PORT } from './application/port/in/judgment/agent-judgment-submission.port';
import { PrismaAgentJudgmentSubmissionTransaction } from './adapter/out/transaction/session-control/prisma-agent-judgment-submission.transaction';
import { PrismaAgentJudgmentDispatchOutboxTransaction } from './adapter/out/transaction/session-control/prisma-agent-judgment-dispatch-outbox.transaction';
import { AGENT_JUDGMENT_SUBMISSION_TRANSACTION } from './application/port/out/transaction/session-control/agent-judgment-submission.transaction.port';
import { AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION } from './application/port/out/transaction/session-control/agent-judgment-dispatch-outbox.transaction.port';
import { AgentSessionCancellationService } from './application/service/session-control/agent-session-cancellation.service';
import { AGENT_SESSION_CANCELLATION_PORT } from './application/port/in/session-control/agent-session-cancellation.port';
import { OperationRunAlertRuntimeModule } from '../automation/operation-run-alert-runtime.module';
import { OperationRunOperationAlertBridge } from './adapter/out/automation/operation-run-operation-alert.bridge';
import { AgentOsCapabilityModule } from './agent-os-capability.module';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { AgentRuntimeAdapterRegistry } from './application/service/agent-runtime-adapter.registry';
import { LocalCliRuntimeStartupRegistrar } from './adapter/out/runtime/local-cli-runtime-registrar';

/** API-only composition for Operations-backed AgentSession execution creation. */
@Module({
  imports: [
    AgentOsCatalogModule,
    AgentOsCapabilityModule,
    AgentOsSessionModule,
    OperationsModule,
    StorageModule,
    OperationRunAlertRuntimeModule,
  ],
  providers: [
    OperationDefinitionSnapshotAdapter,
    AgentSessionOwnedOperationService,
    AgentSessionCancellationService,
    AgentSessionTaskDispatchService,
    AgentJudgmentDispatchService,
    AgentJudgmentDispatchRecoveryService,
    AgentJudgmentSubmissionService,
    PrismaAgentJudgmentSubmissionTransaction,
    PrismaAgentJudgmentDispatchOutboxTransaction,
    OperationRunOperationAlertBridge,
    {
      provide: LocalCliRuntimeStartupRegistrar,
      inject: [
        AgentRuntimeAdapterRegistry,
        AgentCapabilityRegistry,
      ],
      useFactory: (
        runtimes: AgentRuntimeAdapterRegistry,
        capabilities: AgentCapabilityRegistry,
      ) => new LocalCliRuntimeStartupRegistrar(runtimes, capabilities),
    },
    StorageAgentSessionArtifactAdapter,
    AgentSessionArtifactWriterService,
    AgentSessionDeletionExecutionService,
    AgentSessionDeletionOperationService,
    AgentSessionDeletionOperationHandler,
    AgentSessionDeletionService,
    AgentSessionDeletionFinalizerRecoveryService,
    AgentSessionDeletionRecoveryService,
    PrismaAgentSessionDeletionCommandTransaction,
    PrismaAgentSessionDeletionFinalizationTransaction,
    PrismaAgentSessionDeletionQueryRepository,
    OperationsAgentSessionOwnedOperationControlAdapter,
    {
      provide: AGENT_SESSION_OPERATION_PLATFORM_PORT,
      useExisting: OperationDefinitionSnapshotAdapter,
    },
    {
      provide: AGENT_SESSION_OWNED_OPERATION_PORT,
      useExisting: AgentSessionOwnedOperationService,
    },
    {
      provide: AGENT_SESSION_CANCELLATION_PORT,
      useExisting: AgentSessionCancellationService,
    },
    { provide: AGENT_JUDGMENT_SUBMISSION_PORT, useExisting: AgentJudgmentSubmissionService },
    {
      provide: AGENT_JUDGMENT_SUBMISSION_TRANSACTION,
      useExisting: PrismaAgentJudgmentSubmissionTransaction,
    },
    {
      provide: AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION,
      useExisting: PrismaAgentJudgmentDispatchOutboxTransaction,
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
    { provide: AGENT_SESSION_DELETION_OPERATION_PORT, useExisting: AgentSessionDeletionOperationService },
    { provide: AGENT_SESSION_DELETION_PORT, useExisting: AgentSessionDeletionService },
    { provide: AGENT_SESSION_DELETION_COMMAND_TRANSACTION, useExisting: PrismaAgentSessionDeletionCommandTransaction },
    { provide: AGENT_SESSION_DELETION_QUERY, useExisting: PrismaAgentSessionDeletionQueryRepository },
    { provide: AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION, useExisting: PrismaAgentSessionDeletionFinalizationTransaction },
    {
      provide: AGENT_SESSION_OWNED_OPERATION_CONTROL_PORT,
      useExisting: OperationsAgentSessionOwnedOperationControlAdapter,
    },
  ],
  exports: [
    AGENT_SESSION_OWNED_OPERATION_PORT,
    AGENT_SESSION_CANCELLATION_PORT,
    AGENT_JUDGMENT_SUBMISSION_PORT,
    AGENT_SESSION_ARTIFACT_WRITER_PORT,
    AGENT_SESSION_DELETION_EXECUTION_PORT,
    AGENT_SESSION_DELETION_PORT,
  ],
})
export class AgentOsApiExecutionModule {}
