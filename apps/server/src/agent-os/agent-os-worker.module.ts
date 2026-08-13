import { Module } from '@nestjs/common';
import { AgentRunWorker } from './application/service/agent-run-worker.service';
import { AgentOsModule } from './agent-os.module';

@Module({
  imports: [AgentOsModule],
  providers: [AgentRunWorker],
  exports: [AgentRunWorker],
})
export class AgentOsWorkerModule {}
