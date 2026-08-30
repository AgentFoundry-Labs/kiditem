import { Module } from '@nestjs/common';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';

/** Controller-free Agent OS capability registry. */
@Module({
  providers: [AgentCapabilityRegistry],
  exports: [AgentCapabilityRegistry],
})
export class AgentOsCapabilityModule {}
