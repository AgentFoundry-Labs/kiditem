import { Module } from '@nestjs/common';
import { AgentRunWorker } from './application/service/agent-run-worker.service';
import { AgentOsSessionModule } from './agent-os-session.module';

/** Temporary quarantine for the retained generic AgentRun worker lane. */
@Module({
  imports: [AgentOsSessionModule],
  providers: [AgentRunWorker],
  exports: [AgentRunWorker, AgentOsSessionModule],
})
export class AgentOsLegacyRunModule {}
