import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from './agent-os-capability.module';
import { AgentOsSessionModule } from './agent-os-session.module';

/** Controller-free AgentOS facade for focused internal composition modules. */
@Module({
  imports: [
    AgentOsCapabilityModule,
    AgentOsSessionModule,
  ],
  exports: [
    AgentOsCapabilityModule,
    AgentOsSessionModule,
  ],
})
export class AgentOsModule {}
