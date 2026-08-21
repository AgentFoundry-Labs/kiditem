import { Module } from '@nestjs/common';
import { AgentOsLegacyRunModule } from './agent-os-legacy-run.module';

@Module({
  imports: [AgentOsLegacyRunModule],
  exports: [AgentOsLegacyRunModule],
})
export class AgentOsWorkerModule {}
