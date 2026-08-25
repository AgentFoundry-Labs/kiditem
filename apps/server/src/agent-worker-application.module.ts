import { Module } from '@nestjs/common';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';

@Module({
  imports: [AgentOsWorkerModule],
})
export class AgentWorkerApplicationModule {}
