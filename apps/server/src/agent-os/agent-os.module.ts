import { Module } from '@nestjs/common';
import { AgentCatalogController } from './adapter/in/http/agent-catalog.controller';
import { AgentRunsController } from './adapter/in/http/agent-runs.controller';
import { AgentOsRepositoryAdapter } from './adapter/out/repository/agent-os.repository.adapter';
import { FilesystemAgentLogStoreAdapter } from './adapter/out/log-store/filesystem-agent-log-store.adapter';
import { LocalRuntimeAdapter } from './adapter/out/runtime/local-runtime.adapter';
import { AGENT_LOG_STORE_PORT } from './application/port/out/agent-log-store.port';
import { AGENT_OS_REPOSITORY_PORT } from './application/port/out/agent-os-repository.port';
import { AGENT_RUNTIME_PORT } from './application/port/out/agent-runtime.port';
import { AGENT_RUNNER_PORT } from './application/port/in/agent-runner.port';
import { AgentCatalogService } from './application/service/agent-catalog.service';
import { AgentObservabilityService } from './application/service/agent-observability.service';
import { AgentPolicyService } from './application/service/agent-policy.service';
import { AgentRunCoordinator } from './application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from './application/service/agent-run-executor.service';

@Module({
  controllers: [AgentCatalogController, AgentRunsController],
  providers: [
    AgentCatalogService,
    AgentObservabilityService,
    AgentPolicyService,
    AgentRunCoordinator,
    AgentRunExecutor,
    { provide: AGENT_RUNNER_PORT, useExisting: AgentRunCoordinator },
    { provide: AGENT_OS_REPOSITORY_PORT, useClass: AgentOsRepositoryAdapter },
    { provide: AGENT_RUNTIME_PORT, useClass: LocalRuntimeAdapter },
    { provide: AGENT_LOG_STORE_PORT, useClass: FilesystemAgentLogStoreAdapter },
  ],
  exports: [
    AGENT_RUNNER_PORT,
    AgentRunCoordinator,
    AgentRunExecutor,
    AgentCatalogService,
    AgentObservabilityService,
    AgentPolicyService,
  ],
})
export class AgentOsModule {}
