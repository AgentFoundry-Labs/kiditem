import { Module } from '@nestjs/common';
import { AGENT_VERSION_SEEDING_PORT } from './application/port/in/work/agent-version-seeding.port';
import { AgentVersionSeedingService } from './application/service/work/agent-version-seeding.service';

/** Minimal Nest composition root for the standalone AgentVersion seed command. */
@Module({
  providers: [
    {
      provide: AGENT_VERSION_SEEDING_PORT,
      useClass: AgentVersionSeedingService,
    },
  ],
  exports: [AGENT_VERSION_SEEDING_PORT],
})
export class AgentOsSeedModule {}
