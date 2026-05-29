import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { AgentCatalogController } from './adapter/in/http/agent-catalog.controller';
import { AgentConversationsController } from './adapter/in/http/agent-conversations.controller';
import { AgentExecutorController } from './adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from './adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from './adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from './adapter/in/http/agent-runs-query.controller';
import { AgentOsRepositoryAdapter } from './adapter/out/repository/agent-os.repository.adapter';
import { FilesystemAgentLogStoreAdapter } from './adapter/out/log-store/filesystem-agent-log-store.adapter';
import { AgentRunOperationAlertBridge } from './adapter/out/automation/agent-run-operation-alert.bridge';
import { RoutingRuntimeAdapter } from './adapter/out/runtime/routing-runtime.adapter';
import { AGENT_LOG_STORE_PORT } from './application/port/out/storage/agent-log-store.port';
import { AGENT_OS_REPOSITORY_PORT } from './application/port/out/repository/agent-os-repository.port';
import { AGENT_RUNTIME_PORT } from './application/port/out/runtime/agent-runtime.port';
import { AGENT_RUNNER_PORT } from './application/port/in/agent-runner.port';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { AgentCatalogService } from './application/service/agent-catalog.service';
import { AgentConversationService } from './application/service/agent-conversation.service';
import { AgentObservabilityService } from './application/service/agent-observability.service';
import { AgentPolicyService } from './application/service/agent-policy.service';
import { AgentRunCoordinator } from './application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from './application/service/agent-run-executor.service';
import { AgentRunGraphService } from './application/service/agent-run-graph.service';
import { AgentRunWorker } from './application/service/agent-run-worker.service';
import { AgentRuntimeHandlerRegistry } from './application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from './application/service/agent-tool-router.service';

@Module({
  imports: [AutomationModule],
  controllers: [
    AgentCatalogController,
    AgentRunRequestsController,
    AgentExecutorController,
    AgentRunsQueryController,
    AgentRunObservabilityController,
    AgentConversationsController,
  ],
  providers: [
    AgentCatalogService,
    AgentCapabilityRegistry,
    AgentConversationService,
    AgentObservabilityService,
    AgentPolicyService,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentRunGraphService,
    AgentRunWorker,
    AgentRuntimeHandlerRegistry,
    AgentToolRouter,
    RoutingRuntimeAdapter,
    AgentRunOperationAlertBridge,
    { provide: AGENT_RUNNER_PORT, useExisting: AgentRunCoordinator },
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
    AgentCatalogService,
    AgentCapabilityRegistry,
    AgentConversationService,
    AgentObservabilityService,
    AgentPolicyService,
    AgentRuntimeHandlerRegistry,
    AgentToolRouter,
  ],
})
export class AgentOsModule {}
