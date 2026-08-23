import { NestFactory } from '@nestjs/core';
import {
  AGENT_VERSION_SEEDING_PORT,
  type AgentVersionSeedingPort,
} from '../../../application/port/in/work/agent-version-seeding.port';
import { AgentOsSeedModule } from '../../../agent-os-seed.module';

void NestFactory.createApplicationContext(AgentOsSeedModule, { logger: false })
  .then(async (application) => {
    try {
      const seeding = application.get<AgentVersionSeedingPort>(AGENT_VERSION_SEEDING_PORT);
      const count = await seeding.seed();
      console.log(`Published ${count} AgentVersions.`);
    } finally {
      await application.close();
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
