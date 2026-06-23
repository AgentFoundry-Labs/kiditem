import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { AgentCatalogController } from './adapter/in/http/agent-catalog.controller';
import { AgentApprovalsController } from './adapter/in/http/agent-approvals.controller';
import { AgentConversationsController } from './adapter/in/http/agent-conversations.controller';
import { AgentExecutorController } from './adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from './adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from './adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from './adapter/in/http/agent-runs-query.controller';
import { AgentOsRepositoryAdapter } from './adapter/out/repository/agent-os.repository.adapter';
import { FilesystemAgentLogStoreAdapter } from './adapter/out/log-store/filesystem-agent-log-store.adapter';
import { AgentRunOperationAlertBridge } from './adapter/out/automation/agent-run-operation-alert.bridge';
import { AgentOsLiveReadinessAdapter } from './adapter/out/cross-domain/agent-os-live-readiness.adapter';
import { HermesOperatorRuntimeAdapter } from './adapter/out/runtime/hermes-operator-runtime.adapter';
import { HermesLeafRuntimeHandler } from './adapter/out/runtime/hermes-leaf-runtime.handler';
import { HermesRuntimeProfileService } from './adapter/out/runtime/hermes-runtime-profile.service';
import { OpenAiResponsesOperatorRuntimeAdapter } from './adapter/out/runtime/openai-responses-operator-runtime.adapter';
import { OperatorRuntimeHandler } from './adapter/out/runtime/operator-runtime.handler';
import { RoutingRuntimeAdapter } from './adapter/out/runtime/routing-runtime.adapter';
import { AGENT_LOG_STORE_PORT } from './application/port/out/storage/agent-log-store.port';
import { AGENT_OS_LIVE_READINESS_PORT } from './application/port/out/cross-domain/agent-os-live-readiness.port';
import { AGENT_OS_REPOSITORY_PORT } from './application/port/out/repository/agent-os-repository.port';
import { AGENT_RUNTIME_PORT } from './application/port/out/runtime/agent-runtime.port';
import { AGENT_RUNNER_PORT } from './application/port/in/agent-runner.port';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { AgentApprovalService } from './application/service/agent-approval.service';
import { AgentCatalogService } from './application/service/agent-catalog.service';
import { AgentConversationService } from './application/service/agent-conversation.service';
import { AgentObservabilityService } from './application/service/agent-observability.service';
import { AgentPlanValidator } from './application/service/agent-plan-validator.service';
import { AgentPolicyService } from './application/service/agent-policy.service';
import { OperatorContextBuilder } from './application/service/operator-context-builder.service';
import { AgentRunCoordinator } from './application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from './application/service/agent-run-executor.service';
import { AgentRunGraphService } from './application/service/agent-run-graph.service';
import { AgentRunWorker } from './application/service/agent-run-worker.service';
import { AgentRuntimeHandlerRegistry } from './application/service/agent-runtime-handler-registry.service';
import { AgentTaskDelegationService } from './application/service/agent-task-delegation.service';
import { AgentToolRouter } from './application/service/agent-tool-router.service';
import { AgentOsMcpToolExecutor } from './application/service/agent-os-mcp-tool-executor.service';
import { KidItemMcpToolRegistry } from './application/service/kiditem-mcp-tool-registry.service';
import { OperatorDecisionExecutor } from './application/service/operator-decision-executor.service';
import { OperatorDecisionParser } from './application/service/operator-decision-parser.service';

@Module({
  imports: [AutomationModule, ReadinessModule],
  controllers: [
    AgentCatalogController,
    AgentRunRequestsController,
    AgentExecutorController,
    AgentRunsQueryController,
    AgentRunObservabilityController,
    AgentApprovalsController,
    AgentConversationsController,
  ],
  providers: [
    AgentApprovalService,
    AgentCatalogService,
    AgentCapabilityRegistry,
    AgentConversationService,
    AgentObservabilityService,
    AgentPlanValidator,
    AgentPolicyService,
    OperatorContextBuilder,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentRunWorker,
    AgentRuntimeHandlerRegistry,
    AgentTaskDelegationService,
    AgentToolRouter,
    HermesOperatorRuntimeAdapter,
    HermesLeafRuntimeHandler,
    HermesRuntimeProfileService,
    AgentOsMcpToolExecutor,
    KidItemMcpToolRegistry,
    OpenAiResponsesOperatorRuntimeAdapter,
    OperatorDecisionExecutor,
    OperatorDecisionParser,
    OperatorRuntimeHandler,
    RoutingRuntimeAdapter,
    AgentRunOperationAlertBridge,
    AgentOsLiveReadinessAdapter,
    { provide: AGENT_RUNNER_PORT, useExisting: AgentRunCoordinator },
    {
      provide: AGENT_OS_LIVE_READINESS_PORT,
      useExisting: AgentOsLiveReadinessAdapter,
    },
    { provide: AGENT_OS_REPOSITORY_PORT, useClass: AgentOsRepositoryAdapter },
    { provide: AGENT_RUNTIME_PORT, useExisting: RoutingRuntimeAdapter },
    { provide: AGENT_LOG_STORE_PORT, useClass: FilesystemAgentLogStoreAdapter },
  ],
  exports: [
    AGENT_RUNNER_PORT,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentRunWorker,
    AgentApprovalService,
    AgentCatalogService,
    AgentCapabilityRegistry,
    AgentConversationService,
    AgentObservabilityService,
    AgentPlanValidator,
    AgentPolicyService,
    OperatorContextBuilder,
    AgentRuntimeHandlerRegistry,
    AgentTaskDelegationService,
    AgentToolRouter,
    AgentOsMcpToolExecutor,
    OperatorDecisionExecutor,
    OperatorDecisionParser,
  ],
})
export class AgentOsModule {}
