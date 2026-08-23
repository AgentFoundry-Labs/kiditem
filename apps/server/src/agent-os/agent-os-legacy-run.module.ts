import { Module } from "@nestjs/common";
import { OperationAlertRuntimeModule } from "../automation/operation-alert-runtime.module";
import { ReadinessStateModule } from "../readiness/readiness-state.module";
import { AgentRunOperationAlertBridge } from "./adapter/out/automation/agent-run-operation-alert.bridge";
import { AgentOsLiveReadinessAdapter } from "./adapter/out/cross-domain/agent-os-live-readiness.adapter";
import { FilesystemAgentLogStoreAdapter } from "./adapter/out/log-store/filesystem-agent-log-store.adapter";
import { AgentLocalCliRuntimeAdapter } from "./adapter/out/runtime/agent-local-cli-runtime.adapter";
import { AgentLocalProcessRegistry } from "./adapter/out/runtime/agent-local-process-registry";
import { OpenAiResponsesOperatorRuntimeAdapter } from "./adapter/out/runtime/openai-responses-operator-runtime.adapter";
import { OperatorRuntimeHandler } from "./adapter/out/runtime/operator-runtime.handler";
import { RoutingRuntimeAdapter } from "./adapter/out/runtime/routing-runtime.adapter";
import { AGENT_INTERACTION_PORT } from "./application/port/in/legacy-run/agent-interaction.port";
import {
  LEGACY_AGENT_APPROVAL_PORT,
  LEGACY_AGENT_CONVERSATION_PORT,
  LEGACY_AGENT_OBSERVABILITY_PORT,
  LEGACY_AGENT_RUN_EXECUTION_PORT,
  LEGACY_AGENT_RUN_GRAPH_PORT,
} from "./application/port/in/legacy-run/legacy-agent-run.port";
import { AGENT_RUNNER_PORT } from "./application/port/in/agent-runner.port";
import { AGENT_OS_LIVE_READINESS_PORT } from "./application/port/out/cross-domain/agent-os-live-readiness.port";
import { AGENT_LOG_STORE_PORT } from "./application/port/out/storage/agent-log-store.port";
import { AGENT_RUNTIME_PORT } from "./application/port/out/runtime/agent-runtime.port";
import { AgentApprovalService } from "./application/service/agent-approval.service";
import { AgentConversationService } from "./application/service/agent-conversation.service";
import { AgentInteractionService } from "./application/service/agent-interaction.service";
import { AgentObservabilityService } from "./application/service/agent-observability.service";
import { AgentPlanValidator } from "./application/service/agent-plan-validator.service";
import { AgentRunCoordinator } from "./application/service/agent-run-coordinator.service";
import { AgentRunExecutor } from "./application/service/agent-run-executor.service";
import { AgentRunGraphService } from "./application/service/agent-run-graph.service";
import { AgentRuntimeHandlerRegistry } from "./application/service/agent-runtime-handler-registry.service";
import { AgentTaskDelegationService } from "./application/service/agent-task-delegation.service";
import { AgentToolRouter } from "./application/service/agent-tool-router.service";
import { KidItemMcpToolRegistry } from "./application/service/kiditem-mcp-tool-registry.service";
import { OperatorContextBuilder } from "./application/service/operator-context-builder.service";
import { OperatorDecisionExecutor } from "./application/service/operator-decision-executor.service";
import { OperatorDecisionParser } from "./application/service/operator-decision-parser.service";
import { AgentOsCapabilityModule } from "./agent-os-capability.module";
import { AgentOsCatalogModule } from "./agent-os-catalog.module";
import { AgentOsRuntimeSupportModule } from "./agent-os-runtime-support.module";

/** Temporary quarantine for the retained generic AgentRun worker lane. */
@Module({
  imports: [
    OperationAlertRuntimeModule,
    ReadinessStateModule,
    AgentOsCatalogModule,
    AgentOsCapabilityModule,
    AgentOsRuntimeSupportModule,
  ],
  providers: [
    AgentInteractionService,
    AgentApprovalService,
    AgentConversationService,
    AgentObservabilityService,
    AgentPlanValidator,
    OperatorContextBuilder,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentRuntimeHandlerRegistry,
    AgentTaskDelegationService,
    AgentToolRouter,
    KidItemMcpToolRegistry,
    OperatorDecisionExecutor,
    OperatorDecisionParser,
    OperatorRuntimeHandler,
    RoutingRuntimeAdapter,
    AgentLocalCliRuntimeAdapter,
    AgentLocalProcessRegistry,
    AgentRunOperationAlertBridge,
    AgentOsLiveReadinessAdapter,
    { provide: AGENT_INTERACTION_PORT, useExisting: AgentInteractionService },
    { provide: AGENT_RUNNER_PORT, useExisting: AgentRunCoordinator },
    { provide: AGENT_RUNTIME_PORT, useExisting: RoutingRuntimeAdapter },
    { provide: AGENT_LOG_STORE_PORT, useClass: FilesystemAgentLogStoreAdapter },
    {
      provide: AGENT_OS_LIVE_READINESS_PORT,
      useExisting: AgentOsLiveReadinessAdapter,
    },
    { provide: LEGACY_AGENT_APPROVAL_PORT, useExisting: AgentApprovalService },
    {
      provide: LEGACY_AGENT_CONVERSATION_PORT,
      useExisting: AgentConversationService,
    },
    { provide: LEGACY_AGENT_RUN_GRAPH_PORT, useExisting: AgentRunGraphService },
    { provide: LEGACY_AGENT_RUN_EXECUTION_PORT, useExisting: AgentRunExecutor },
    {
      provide: LEGACY_AGENT_OBSERVABILITY_PORT,
      useExisting: AgentObservabilityService,
    },
  ],
  exports: [
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentApprovalService,
    AgentConversationService,
    AgentObservabilityService,
    AgentPlanValidator,
    OperatorContextBuilder,
    AgentRuntimeHandlerRegistry,
    AgentTaskDelegationService,
    AgentToolRouter,
    OperatorDecisionExecutor,
    OperatorDecisionParser,
    AGENT_INTERACTION_PORT,
    AGENT_RUNNER_PORT,
    AGENT_RUNTIME_PORT,
    AGENT_OS_LIVE_READINESS_PORT,
    LEGACY_AGENT_APPROVAL_PORT,
    LEGACY_AGENT_CONVERSATION_PORT,
    LEGACY_AGENT_RUN_GRAPH_PORT,
    LEGACY_AGENT_RUN_EXECUTION_PORT,
    LEGACY_AGENT_OBSERVABILITY_PORT,
  ],
})
export class AgentOsLegacyRunModule {}
