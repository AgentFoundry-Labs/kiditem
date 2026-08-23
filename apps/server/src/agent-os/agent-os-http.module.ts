import { Module } from "@nestjs/common";
import { OperationsModule } from "../operations/operations.module";
import { AgentRuntimeApplicationModule } from "../agent-runtime-application.module";
import { AgentCatalogController } from "./adapter/in/http/catalog/agent-catalog.controller";
import { AgentApprovalsController } from "./adapter/in/http/legacy-run/agent-approvals.controller";
import { AgentConversationsController } from "./adapter/in/http/legacy-run/agent-conversations.controller";
import { AgentExecutorController } from "./adapter/in/http/legacy-run/agent-executor.controller";
import { AgentInteractionActionsController } from "./adapter/in/http/interaction/agent-interaction-actions.controller";
import { AgentRunObservabilityController } from "./adapter/in/http/legacy-run/agent-run-observability.controller";
import { AgentRunRequestsController } from "./adapter/in/http/legacy-run/agent-run-requests.controller";
import { AgentRunsQueryController } from "./adapter/in/http/legacy-run/agent-runs-query.controller";
import { AgentSessionController } from "./adapter/in/http/session-control/agent-session.controller";
import { AgentSessionDeletionController } from "./adapter/in/http/session-control/agent-session-deletion.controller";
import { AgentSessionTaskOperationAdapter } from "./adapter/in/operation/session-execution/agent-session-task.operation-adapter";
import { OperationsSessionExecutionAdapter } from "./adapter/out/cross-domain/operations-session-execution.adapter";
import { OpenAiResponsesAguiRuntimeAdapter } from "./adapter/out/runtime/openai-responses-agui-runtime.adapter";
import { PrismaAguiRuntimeCleanupDependencies } from "./adapter/out/runtime/prisma-agui-runtime-cleanup-dependencies";
import { PrismaAgentAguiStartupRecoveryTransaction } from "./adapter/out/transaction/interaction/prisma-agent-agui-startup-recovery.transaction";
import { AGENT_AGUI_RUNNER_PORT } from "./application/port/in/agent-agui-runner.port";
import { AGENT_CATALOG_PORT } from "./application/port/in/catalog/agent-catalog.port";
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from "./application/port/in/interaction/agent-interaction-authorization.port";
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from "./application/port/in/interaction/agent-interaction-bootstrap.port";
import { AGENT_AGUI_PRODUCER_PORT } from "./application/port/in/interaction/agent-agui-producer.port";
import { AGENT_INTERACTION_LIVE_EVENTS_PORT } from "./application/port/in/interaction/agent-interaction-live-events.port";
import { AGENT_INTERACTION_PRESENTATION_PORT } from "./application/port/in/interaction/agent-interaction-presentation.port";
import { AGENT_SESSION_APPROVAL_DECISION_PORT } from "./application/port/in/session-control/agent-session-approval-decision.port";
import { AGENT_SESSION_TASK_CONTROL_PORT } from "./application/port/in/session-control/agent-session-task-control.port";
import { AGENT_SESSION_TASK_EXECUTION_PORT } from "./application/port/in/session-execution/agent-session-task-execution.port";
import { AGUI_RUNTIME_CLEANUP_DEPENDENCIES } from "./application/port/out/runtime/agent-agui-runtime-cleanup.port";
import { AGENT_AGUI_STARTUP_RECOVERY_TRANSACTION } from "./application/port/out/transaction/interaction/agent-agui-startup-recovery.transaction.port";
import { OPERATIONS_SESSION_EXECUTION_PORT } from "./application/port/out/cross-domain/operations-session-execution.port";
import { AgentAguiProducerCoordinator } from "./application/service/agent-agui-producer-coordinator.service";
import { AgentAguiRunService } from "./application/service/agent-agui-run.service";
import { AgentCatalogService } from "./application/service/agent-catalog.service";
import { AgentAguiRuntimeRegistry } from "./application/service/agent-agui-runtime-registry.service";
import { AgentAguiInProcessRunRegistry } from "./application/service/agent-agui-in-process-run-registry.service";
import { AgentInlineRunReconciler } from "./application/service/agent-inline-run-reconciler.service";
import { AgentApiStartupReconciler } from './application/service/work/agent-api-startup-reconciler.service';
import { AgentAttemptReconciler } from './application/service/work/agent-attempt-reconciler.service';
import { AgentInteractionPresentationService } from "./application/service/agent-interaction-presentation.service";
import { AgentInteractionAuthorizationService } from "./application/service/interaction/agent-interaction-authorization.service";
import { AgentInteractionBootstrapService } from "./application/service/interaction/agent-interaction-bootstrap.service";
import { AgentInteractionLiveEventsService } from "./application/service/interaction/agent-interaction-live-events.service";
import { AgentAguiStartupRecoveryService } from "./application/service/interaction/agent-agui-startup-recovery.service";
import { INTERACTION_CLOCK } from "./application/port/in/interaction/interaction-clock.port";
import { InteractionAllowedVersionResolver } from "./application/service/interaction/interaction-allowed-version-resolver";
import { AgentSessionApprovalService } from "./application/service/session-control/agent-session-approval.service";
import { AgentSessionDelegationService } from "./application/service/session-control/agent-session-delegation.service";
import { AgentSessionExecutionService } from "./application/service/session-control/agent-session-execution.service";
import { AgentSessionOperationContinuationService } from "./application/service/session-control/agent-session-operation-continuation.service";
import { AgentSessionRuntimeControlService } from "./application/service/session-control/agent-session-runtime-control.service";
import { AgentSessionTaskControlService } from "./application/service/session-control/agent-session-task-control.service";
import { AgentSessionTaskDispatchService } from "./application/service/session-control/agent-session-task-dispatch.service";
import { AgentSessionTaskExecutionService } from "./application/service/session-execution/agent-session-task-execution.service";
import { AgentOsModule } from "./agent-os.module";
import { AgentOsApiExecutionModule } from "./agent-os-api-execution.module";
import { AgentOsLegacyRunModule } from "./agent-os-legacy-run.module";
import { AgentOsRuntimeSupportModule } from "./agent-os-runtime-support.module";

@Module({
  imports: [
    AgentOsModule,
    AgentOsLegacyRunModule,
    AgentOsRuntimeSupportModule,
    OperationsModule,
    AgentOsApiExecutionModule,
    AgentRuntimeApplicationModule,
  ],
  controllers: [
    AgentCatalogController,
    AgentRunRequestsController,
    AgentExecutorController,
    AgentRunsQueryController,
    AgentRunObservabilityController,
    AgentApprovalsController,
    AgentConversationsController,
    AgentInteractionActionsController,
    AgentSessionController,
    AgentSessionDeletionController,
  ],
  providers: [
    { provide: INTERACTION_CLOCK, useValue: (): Date => new Date() },
    AgentInlineRunReconciler,
    {
      provide: AgentApiStartupReconciler,
      inject: [AgentAttemptReconciler],
      useFactory: (attempts: AgentAttemptReconciler) => new AgentApiStartupReconciler(attempts),
    },
    AgentInteractionAuthorizationService,
    AgentInteractionBootstrapService,
    InteractionAllowedVersionResolver,
    AgentInteractionLiveEventsService,
    AgentAguiStartupRecoveryService,
    PrismaAgentAguiStartupRecoveryTransaction,
    {
      provide: AGENT_AGUI_STARTUP_RECOVERY_TRANSACTION,
      useExisting: PrismaAgentAguiStartupRecoveryTransaction,
    },
    AgentAguiRunService,
    AgentAguiProducerCoordinator,
    AgentAguiRuntimeRegistry,
    AgentAguiInProcessRunRegistry,
    PrismaAguiRuntimeCleanupDependencies,
    {
      provide: AGUI_RUNTIME_CLEANUP_DEPENDENCIES,
      useExisting: PrismaAguiRuntimeCleanupDependencies,
    },
    OpenAiResponsesAguiRuntimeAdapter,
    {
      provide: AgentInteractionPresentationService,
      useFactory: () => new AgentInteractionPresentationService(),
    },
    AgentSessionRuntimeControlService,
    AgentSessionOperationContinuationService,
    AgentSessionApprovalService,
    AgentSessionExecutionService,
    AgentSessionTaskControlService,
    AgentSessionTaskDispatchService,
    AgentSessionDelegationService,
    OperationsSessionExecutionAdapter,
    AgentSessionTaskExecutionService,
    AgentSessionTaskOperationAdapter,
    {
      provide: AGENT_AGUI_RUNNER_PORT,
      useExisting: AgentAguiRunService,
    },
    { provide: AGENT_CATALOG_PORT, useExisting: AgentCatalogService },
    {
      provide: AGENT_INTERACTION_BOOTSTRAP_PORT,
      useExisting: AgentInteractionBootstrapService,
    },
    {
      provide: AGENT_AGUI_PRODUCER_PORT,
      useExisting: AgentAguiProducerCoordinator,
    },
    {
      provide: AGENT_INTERACTION_AUTHORIZATION_PORT,
      useExisting: AgentInteractionAuthorizationService,
    },
    {
      provide: AGENT_INTERACTION_LIVE_EVENTS_PORT,
      useExisting: AgentInteractionLiveEventsService,
    },
    {
      provide: AGENT_INTERACTION_PRESENTATION_PORT,
      useExisting: AgentInteractionPresentationService,
    },
    {
      provide: AGENT_SESSION_TASK_CONTROL_PORT,
      useExisting: AgentSessionTaskControlService,
    },
    {
      provide: AGENT_SESSION_APPROVAL_DECISION_PORT,
      useExisting: AgentSessionApprovalService,
    },
    {
      provide: OPERATIONS_SESSION_EXECUTION_PORT,
      useExisting: OperationsSessionExecutionAdapter,
    },
    {
      provide: AGENT_SESSION_TASK_EXECUTION_PORT,
      useExisting: AgentSessionTaskExecutionService,
    },
  ],
  exports: [
    AGENT_AGUI_RUNNER_PORT,
    AGENT_AGUI_PRODUCER_PORT,
    AGENT_INTERACTION_AUTHORIZATION_PORT,
    AGENT_INTERACTION_BOOTSTRAP_PORT,
    AGENT_INTERACTION_LIVE_EVENTS_PORT,
    AGENT_SESSION_APPROVAL_DECISION_PORT,
  ],
})
export class AgentOsHttpModule {}
