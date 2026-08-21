import { Module } from '@nestjs/common';
import { AgentRunWorker } from './application/service/agent-run-worker.service';
import { AGENT_RUNNER_PORT } from './application/port/in/agent-runner.port';
import { AgentInteractionService } from './application/service/agent-interaction.service';
import { AgentObservabilityService } from './application/service/agent-observability.service';
import { AgentRunCoordinator } from './application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from './application/service/agent-run-executor.service';
import { AgentOsSessionModule } from './agent-os-session.module';

/** Temporary quarantine for the retained generic AgentRun worker lane. */
@Module({
  imports: [AgentOsSessionModule],
  providers: [AgentRunWorker],
  exports: [
    AgentRunWorker,
    AGENT_RUNNER_PORT,
    AgentInteractionService,
    AgentObservabilityService,
    AgentRunCoordinator,
    AgentRunExecutor,
  ],
})
export class AgentOsLegacyRunModule {}
