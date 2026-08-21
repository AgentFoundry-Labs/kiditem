import { Module } from '@nestjs/common';
import { AgentOsCapabilityModule } from './agent-os-capability.module';
import { AgentOsCatalogModule } from './agent-os-catalog.module';
import { AgentOsSessionModule } from './agent-os-session.module';

/** Controller-free AgentOS facade for focused internal composition modules. */
@Module({
  imports: [
    AgentOsCatalogModule,
    AgentOsCapabilityModule,
    AgentOsSessionModule,
  ],
  exports: [
    AgentOsCatalogModule,
    AgentOsCapabilityModule,
    AgentOsSessionModule,
  ],
})
export class AgentOsModule {}
