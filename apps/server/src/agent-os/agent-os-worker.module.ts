import { Module } from '@nestjs/common';
import { AgentRunWorker } from './application/service/agent-run-worker.service';
import { AgentOsLegacyRunModule } from './agent-os-legacy-run.module';

@Module({
  imports: [AgentOsLegacyRunModule],
  exports: [AgentRunWorker],
})
export class AgentOsWorkerModule {}
