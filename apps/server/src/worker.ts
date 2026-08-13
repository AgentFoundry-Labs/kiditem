import { config } from 'dotenv';
import { resolve } from 'path';

// Keep runtime env loading aligned with main.ts. The container-level compose
// env still decides whether the Agent OS worker loop is enabled.
config({ path: resolve(__dirname, '..', '.env') });
config({ path: resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AgentWorkerApplicationModule } from './agent-worker-application.module';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AgentWorkerApplicationModule);
  app.enableShutdownHooks();

  const keepAlive = setInterval(() => undefined, 60 * 60 * 1000);
  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`Worker received ${signal}; shutting down`);
    clearInterval(keepAlive);
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log('Worker running with Nest application context');
}

bootstrapWorker().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
