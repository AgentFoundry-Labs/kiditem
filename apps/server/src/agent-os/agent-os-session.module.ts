import { Module } from "@nestjs/common";
import { OperationAlertRuntimeModule } from "../automation/operation-alert-runtime.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReadinessStateModule } from "../readiness/readiness-state.module";
import { AgentOsCapabilityModule } from './agent-os-capability.module';
import { AgentOsCatalogModule } from './agent-os-catalog.module';
import { AgentOsPlatformProbeCapabilityAdapter } from "./adapter/in/agent/agent-os-platform-probe-capability.adapter";
import { AnalyticsOverviewAgentCapabilityAdapter } from "./adapter/in/agent/analytics-overview-agent-capability.adapter";
import { AgentOsRepositoryAdapter } from "./adapter/out/repository/agent-os.repository.adapter";
import { PrismaAgentSessionQueryRepository } from "./adapter/out/repository/interaction/prisma-agent-session-query.repository";
import { PrismaAgentConversationQueryRepository } from "./adapter/out/repository/interaction/prisma-agent-conversation-query.repository";
import { PrismaAgentExecutionQueryRepository } from "./adapter/out/repository/interaction/prisma-agent-execution-query.repository";
import { PrismaAgentRunAuthorizationTransaction } from "./adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction";
import { PrismaAgentConversationEventTransaction } from "./adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction";
import { PrismaAgentExecutionUsageTransaction } from "./adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction";
import { PrismaAgentVersionRepository } from "./adapter/out/repository/prisma-agent-version.repository";
import { PrismaAgentSessionControlQueryRepository } from "./adapter/out/repository/session-control/prisma-agent-session-control-query.repository";
import { PrismaAgentDelegationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-delegation.transaction";
import { PrismaAgentAttemptOperationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction";
import { PrismaAgentApprovalContinuationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction";
import { PrismaAgentSessionTransitionTransaction } from "./adapter/out/transaction/session-control/prisma-agent-session-transition.transaction";
import { PrismaAgentExecutionContextRepository } from "./adapter/out/repository/prisma-agent-execution-context.repository";
import { PrismaAgentConversationModelViewRepository } from "./adapter/out/repository/prisma-agent-conversation-model-view.repository";
import { InProcessAgentConversationLivePublisher } from "./adapter/out/event/in-process-agent-conversation-live-publisher.adapter";
import { FilesystemAgentLogStoreAdapter } from "./adapter/out/log-store/filesystem-agent-log-store.adapter";
import { AgentRunOperationAlertBridge } from "./adapter/out/automation/agent-run-operation-alert.bridge";
import { AgentOsLiveReadinessAdapter } from "./adapter/out/cross-domain/agent-os-live-readiness.adapter";
import { OpenAiResponsesOperatorRuntimeAdapter } from "./adapter/out/runtime/openai-responses-operator-runtime.adapter";
import { OperatorRuntimeHandler } from "./adapter/out/runtime/operator-runtime.handler";
import { RoutingRuntimeAdapter } from "./adapter/out/runtime/routing-runtime.adapter";
import { FilesystemAgentRuntimeAssetsAdapter } from "./adapter/out/runtime/filesystem-agent-runtime-assets.adapter";
import { AgentLocalCliRuntimeAdapter } from "./adapter/out/runtime/agent-local-cli-runtime.adapter";
import { AgentLocalProcessRegistry } from "./adapter/out/runtime/agent-local-process-registry";
import { HermesRuntimeStartupRegistrar } from "./adapter/out/runtime/hermes-runtime-registrar";
import { KidItemMcpSessionAdapter } from "./adapter/out/runtime/kiditem-mcp-session.adapter";
import { FilesystemAgentRuntimeManifestCatalog } from "./adapter/out/runtime/filesystem-agent-runtime-manifest-catalog";
import { FilesystemAgentDurableRuntimeAssetsAdapter } from "./adapter/out/runtime/filesystem-agent-durable-runtime-assets.adapter";
import { OpenAiConversationSummarizerAdapter } from "./adapter/out/runtime/openai-conversation-summarizer.adapter";
import { AGENT_LOG_STORE_PORT } from "./application/port/out/storage/agent-log-store.port";
import { AGENT_OS_LIVE_READINESS_PORT } from "./application/port/out/cross-domain/agent-os-live-readiness.port";
import { AGENT_OS_REPOSITORY_PORT } from "./application/port/out/repository/agent-os-repository.port";
import { AGENT_SESSION_QUERY_REPOSITORY } from "./application/port/out/repository/interaction/agent-session-query.repository.port";
import { AGENT_CONVERSATION_QUERY_REPOSITORY } from "./application/port/out/repository/interaction/agent-conversation-query.repository.port";
import { AGENT_EXECUTION_QUERY_REPOSITORY } from "./application/port/out/repository/interaction/agent-execution-query.repository.port";
import { AGENT_RUN_AUTHORIZATION_TRANSACTION } from "./application/port/out/transaction/interaction/agent-run-authorization.transaction.port";
import { AGENT_CONVERSATION_EVENT_TRANSACTION } from "./application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import { AGENT_EXECUTION_USAGE_TRANSACTION } from "./application/port/out/transaction/interaction/agent-execution-usage.transaction.port";
import { AGENT_VERSION_REPOSITORY } from "./application/port/out/repository/agent-version.repository.port";
import { AGENT_SESSION_CONTROL_QUERY_REPOSITORY } from "./application/port/out/repository/session-control/agent-session-control-query.repository.port";
import { AGENT_DELEGATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-delegation.transaction.port";
import { AGENT_ATTEMPT_OPERATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-attempt-operation.transaction.port";
import { AGENT_APPROVAL_CONTINUATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-approval-continuation.transaction.port";
import { AGENT_SESSION_TRANSITION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-session-transition.transaction.port";
import { AGENT_EXECUTION_CONTEXT_REPOSITORY } from "./application/port/out/repository/agent-execution-context.repository.port";
import { AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY } from "./application/port/out/repository/agent-conversation-model-view.repository.port";
import { AGENT_CONVERSATION_LIVE_PUBLISHER } from "./application/port/out/event/agent-conversation-live-publisher.port";
import { AGENT_RUNTIME_PORT } from "./application/port/out/runtime/agent-runtime.port";
import { AGENT_RUNTIME_ASSETS_PORT } from "./application/port/out/runtime/agent-runtime-assets.port";
import { AGENT_MCP_SESSION_PORT } from "./application/port/out/runtime/agent-mcp-session.port";
import { AGENT_DURABLE_RUNTIME_ASSETS_PORT } from "./application/port/out/runtime/agent-durable-runtime.port";
import { AGENT_SESSION_RESOURCE_VERSION_VALIDATOR } from "./application/port/out/resource/agent-session-resource-version-validator.port";
import { AGENT_RUNNER_PORT } from "./application/port/in/agent-runner.port";
import { AGENT_INTERACTION_PORT } from "./application/port/in/legacy-run/agent-interaction.port";
import { AGENT_SESSION_CAPABILITY_INVOCATION_PORT } from "./application/port/in/session-capability/agent-capability-invocation.port";
import {
  AGENT_API_CAPABILITY_GRANT_PORT,
} from "./application/port/in/capability/agent-api-capability-grant.port";
import {
  AGENT_CAPABILITY_REGISTRY_PORT,
} from "./application/port/in/capability/agent-capability-registry.port";
import {
  AGENT_OS_MCP_TOOL_EXECUTION_PORT,
} from "./application/port/in/capability/agent-os-mcp-tool-execution.port";
import {
  LEGACY_AGENT_APPROVAL_PORT,
  LEGACY_AGENT_CONVERSATION_PORT,
  LEGACY_AGENT_OBSERVABILITY_PORT,
  LEGACY_AGENT_RUN_EXECUTION_PORT,
  LEGACY_AGENT_RUN_GRAPH_PORT,
} from "./application/port/in/legacy-run/legacy-agent-run.port";
import { AgentCapabilityRegistry } from "./application/service/agent-capability-registry.service";
import { AgentApprovalService } from "./application/service/agent-approval.service";
import { AgentCatalogService } from "./application/service/agent-catalog.service";
import { AgentConversationService } from "./application/service/agent-conversation.service";
import { AgentObservabilityService } from "./application/service/agent-observability.service";
import { AgentPlanValidator } from "./application/service/agent-plan-validator.service";
import { AgentPolicyService } from "./application/service/agent-policy.service";
import { OperatorContextBuilder } from "./application/service/operator-context-builder.service";
import { AgentRunCoordinator } from "./application/service/agent-run-coordinator.service";
import { AgentRunExecutor } from "./application/service/agent-run-executor.service";
import { AgentRunGraphService } from "./application/service/agent-run-graph.service";
import { AgentRuntimeHandlerRegistry } from "./application/service/agent-runtime-handler-registry.service";
import { AgentTaskDelegationService } from "./application/service/agent-task-delegation.service";
import { AgentToolRouter } from "./application/service/agent-tool-router.service";
import { AgentOsMcpToolExecutor } from "./application/service/agent-os-mcp-tool-executor.service";
import { KidItemMcpToolRegistry } from "./application/service/kiditem-mcp-tool-registry.service";
import { OperatorDecisionExecutor } from "./application/service/operator-decision-executor.service";
import { OperatorDecisionParser } from "./application/service/operator-decision-parser.service";
import { AgentRuntimeAssetsStartupValidator } from "./application/service/agent-runtime-assets-startup-validator.service";
import { AgentInteractionService } from "./application/service/agent-interaction.service";
import {
  AGENT_RUNTIME_MANIFEST_CATALOG,
  AgentRuntimeCatalogStartupValidator,
} from "./application/service/agent-runtime-catalog-startup-validator.service";
import { AgentVersionPublisher } from "./application/service/agent-version-publisher.service";
import {
  AGENT_CONVERSATION_SUMMARIZER,
  AgentConversationModelViewService,
} from "./application/service/agent-conversation-model-view.service";
import { AgentExecutionContextBuilder } from "./application/service/agent-execution-context-builder.service";
import { AgentSessionCapabilityInvocationService } from "./application/service/agent-session-capability-invocation.service";
import { AgentRuntimeAdapterRegistry } from "./application/service/agent-runtime-adapter.registry";
import { resolveAgentOsRepositoryRoot } from "./seed-agent-os";
import { AgentApiCapabilityGrantService } from "./application/service/agent-api-capability-grant.service";

const agentInteractionProviders = [
  AgentInteractionService,
  {
    provide: AGENT_INTERACTION_PORT,
    useExisting: AgentInteractionService,
  },
];

@Module({
  imports: [
    PrismaModule,
    OperationAlertRuntimeModule,
    ReadinessStateModule,
    AgentOsCatalogModule,
    AgentOsCapabilityModule,
  ],
  providers: [
    ...agentInteractionProviders,
    AgentApprovalService,
    AgentConversationService,
    AgentObservabilityService,
    AgentPlanValidator,
    AgentPolicyService,
    OperatorContextBuilder,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentRuntimeHandlerRegistry,
    AgentRuntimeAdapterRegistry,
    {
      provide: HermesRuntimeStartupRegistrar,
      inject: [AgentRuntimeAdapterRegistry, AgentCapabilityRegistry],
      useFactory: (
        runtimes: AgentRuntimeAdapterRegistry,
        capabilities: AgentCapabilityRegistry,
      ) => new HermesRuntimeStartupRegistrar(runtimes, capabilities),
    },
    AgentConversationModelViewService,
    AgentExecutionContextBuilder,
    AgentSessionCapabilityInvocationService,
    AgentTaskDelegationService,
    AgentToolRouter,
    AgentOsMcpToolExecutor,
    KidItemMcpToolRegistry,
    OpenAiResponsesOperatorRuntimeAdapter,
    OpenAiConversationSummarizerAdapter,
    OperatorDecisionExecutor,
    OperatorDecisionParser,
    OperatorRuntimeHandler,
    RoutingRuntimeAdapter,
    AgentLocalCliRuntimeAdapter,
    AgentLocalProcessRegistry,
    KidItemMcpSessionAdapter,
    AgentApiCapabilityGrantService,
    {
      provide: AGENT_API_CAPABILITY_GRANT_PORT,
      useExisting: AgentApiCapabilityGrantService,
    },
    {
      provide: AGENT_OS_MCP_TOOL_EXECUTION_PORT,
      useExisting: AgentOsMcpToolExecutor,
    },
    { provide: LEGACY_AGENT_APPROVAL_PORT, useExisting: AgentApprovalService },
    { provide: LEGACY_AGENT_CONVERSATION_PORT, useExisting: AgentConversationService },
    { provide: LEGACY_AGENT_RUN_GRAPH_PORT, useExisting: AgentRunGraphService },
    { provide: LEGACY_AGENT_RUN_EXECUTION_PORT, useExisting: AgentRunExecutor },
    { provide: LEGACY_AGENT_OBSERVABILITY_PORT, useExisting: AgentObservabilityService },
    AgentRunOperationAlertBridge,
    AgentOsLiveReadinessAdapter,
    { provide: AGENT_RUNNER_PORT, useExisting: AgentRunCoordinator },
    {
      provide: AGENT_OS_LIVE_READINESS_PORT,
      useExisting: AgentOsLiveReadinessAdapter,
    },
    { provide: AGENT_OS_REPOSITORY_PORT, useClass: AgentOsRepositoryAdapter },
    {
      provide: AGENT_SESSION_QUERY_REPOSITORY,
      useClass: PrismaAgentSessionQueryRepository,
    },
    {
      provide: AGENT_CONVERSATION_QUERY_REPOSITORY,
      useClass: PrismaAgentConversationQueryRepository,
    },
    {
      provide: AGENT_EXECUTION_QUERY_REPOSITORY,
      useClass: PrismaAgentExecutionQueryRepository,
    },
    {
      provide: AGENT_RUN_AUTHORIZATION_TRANSACTION,
      useClass: PrismaAgentRunAuthorizationTransaction,
    },
    {
      provide: AGENT_CONVERSATION_EVENT_TRANSACTION,
      useClass: PrismaAgentConversationEventTransaction,
    },
    {
      provide: AGENT_EXECUTION_USAGE_TRANSACTION,
      useClass: PrismaAgentExecutionUsageTransaction,
    },
    { provide: AGENT_SESSION_CONTROL_QUERY_REPOSITORY, useClass: PrismaAgentSessionControlQueryRepository },
    { provide: AGENT_DELEGATION_TRANSACTION, useClass: PrismaAgentDelegationTransaction },
    { provide: AGENT_ATTEMPT_OPERATION_TRANSACTION, useClass: PrismaAgentAttemptOperationTransaction },
    { provide: AGENT_APPROVAL_CONTINUATION_TRANSACTION, useClass: PrismaAgentApprovalContinuationTransaction },
    { provide: AGENT_SESSION_TRANSITION_TRANSACTION, useClass: PrismaAgentSessionTransitionTransaction },
    {
      // Until each owner domain supplies a version resolver, only an approval
      // with no resource reference may be resumed. Unknown resources never
      // become implicit approval authority.
      provide: AGENT_SESSION_RESOURCE_VERSION_VALIDATOR,
      useValue: {
        areCurrent: async ({
          resourceVersions,
        }: {
          resourceVersions: readonly unknown[];
        }) => resourceVersions.length === 0,
      },
    },
    {
      provide: AGENT_EXECUTION_CONTEXT_REPOSITORY,
      useClass: PrismaAgentExecutionContextRepository,
    },
    PrismaAgentConversationModelViewRepository,
    {
      provide: AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY,
      useExisting: PrismaAgentConversationModelViewRepository,
    },
    {
      provide: AGENT_CONVERSATION_SUMMARIZER,
      useExisting: OpenAiConversationSummarizerAdapter,
    },
    InProcessAgentConversationLivePublisher,
    {
      provide: AGENT_CONVERSATION_LIVE_PUBLISHER,
      useExisting: InProcessAgentConversationLivePublisher,
    },
    {
      provide: AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
      useExisting: AgentSessionCapabilityInvocationService,
    },
    { provide: AGENT_RUNTIME_PORT, useExisting: RoutingRuntimeAdapter },
    {
      provide: AGENT_MCP_SESSION_PORT,
      useExisting: KidItemMcpSessionAdapter,
    },
    { provide: AGENT_LOG_STORE_PORT, useClass: FilesystemAgentLogStoreAdapter },
  ],
  exports: [
    AGENT_INTERACTION_PORT,
    AGENT_RUNNER_PORT,
    AGENT_OS_REPOSITORY_PORT,
    AgentApiCapabilityGrantService,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentApprovalService,
    AgentCapabilityRegistry,
    AgentConversationService,
    AgentObservabilityService,
    AgentPlanValidator,
    AgentPolicyService,
    OperatorContextBuilder,
    AgentRuntimeHandlerRegistry,
    AgentRuntimeAdapterRegistry,
    AgentExecutionContextBuilder,
    AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
    AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
    AGENT_DELEGATION_TRANSACTION,
    AGENT_ATTEMPT_OPERATION_TRANSACTION,
    AGENT_APPROVAL_CONTINUATION_TRANSACTION,
    AGENT_SESSION_TRANSITION_TRANSACTION,
    AGENT_CONVERSATION_LIVE_PUBLISHER,
    AGENT_SESSION_RESOURCE_VERSION_VALIDATOR,
    OpenAiResponsesOperatorRuntimeAdapter,
    AgentTaskDelegationService,
    AgentToolRouter,
    AgentOsMcpToolExecutor,
    OperatorDecisionExecutor,
    OperatorDecisionParser,
    AGENT_CAPABILITY_REGISTRY_PORT,
    AGENT_API_CAPABILITY_GRANT_PORT,
    AGENT_OS_MCP_TOOL_EXECUTION_PORT,
    LEGACY_AGENT_APPROVAL_PORT,
    LEGACY_AGENT_CONVERSATION_PORT,
    LEGACY_AGENT_RUN_GRAPH_PORT,
    LEGACY_AGENT_RUN_EXECUTION_PORT,
    LEGACY_AGENT_OBSERVABILITY_PORT,
  ],
})
/** Controller-free official session/runtime composition. */
export class AgentOsSessionModule {}
