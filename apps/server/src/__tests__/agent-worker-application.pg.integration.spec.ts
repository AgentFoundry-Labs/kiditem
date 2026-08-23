import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AgentWorkerApplicationModule } from '../agent-worker-application.module';
import { AiDirectJobWorkerService } from '../ai/application/service/ai-direct-job-worker.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
} from '../test-helpers/real-prisma';
import { seedAgentOs } from '../agent-os/seed-agent-os';
import type { INestApplicationContext } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

const DISABLED_WORKER_ENV = {
  OPERATION_RUNTIME_WORKER_ENABLED: '0',
  OPERATION_SCHEDULER_ENABLED: '0',
} as const;

type DisabledWorkerEnvKey = keyof typeof DISABLED_WORKER_ENV;

let prisma: PrismaClient | null = null;
let priorEnvironment: Partial<
  Record<DisabledWorkerEnvKey, string | undefined>
> = {};
let priorAiDirectJobWorkerEnabled: string | undefined;
let priorAgentDefaultModel: string | undefined;

async function resetStatementObservation(): Promise<void> {
  if (!prisma) throw new Error('Postgres observer was not initialized');
  await prisma.$queryRaw`SELECT pg_stat_statements_reset()`;
}

async function forbiddenWorkerRootStatements(): Promise<string[]> {
  if (!prisma) throw new Error('Postgres observer was not initialized');
  const statements = await prisma.$queryRaw<Array<{ query: string }>>`
    SELECT query
    FROM pg_stat_statements
  `;
  return statements
    .map(({ query }) => query)
    .filter((query) => /\b(?:operation_runs|ai_direct_jobs)\b/i.test(query));
}

async function assertNoForbiddenWorkerRootStatements(): Promise<void> {
  const statements = await forbiddenWorkerRootStatements();
  if (statements.length > 0) {
    throw new Error(
      `Agent worker root touched an API-owned run table:\n${statements.join('\n')}`,
    );
  }
}

beforeAll(async () => {
  priorEnvironment = Object.fromEntries(
    Object.keys(DISABLED_WORKER_ENV).map((key) => [key, process.env[key]]),
  );
  priorAiDirectJobWorkerEnabled = process.env.AI_DIRECT_JOB_WORKER_ENABLED;
  priorAgentDefaultModel = process.env.AGENT_DEFAULT_MODEL;
  Object.assign(process.env, DISABLED_WORKER_ENV);
  delete process.env.AI_DIRECT_JOB_WORKER_ENABLED;
  process.env.AGENT_DEFAULT_MODEL = 'gpt-test';

  prisma = makeTestPrisma();
  await prisma.$connect();
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`;
});

afterAll(async () => {
  try {
    await prisma?.$disconnect();
  } finally {
    for (const key of Object.keys(DISABLED_WORKER_ENV) as DisabledWorkerEnvKey[]) {
      const prior = priorEnvironment[key];
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
    if (priorAiDirectJobWorkerEnabled === undefined) {
      delete process.env.AI_DIRECT_JOB_WORKER_ENABLED;
    } else {
      process.env.AI_DIRECT_JOB_WORKER_ENABLED = priorAiDirectJobWorkerEnabled;
    }
    if (priorAgentDefaultModel === undefined) {
      delete process.env.AGENT_DEFAULT_MODEL;
    } else {
      process.env.AGENT_DEFAULT_MODEL = priorAgentDefaultModel;
    }
  }
});

beforeEach(async () => {
  await resetStatementObservation();
});

describe('AgentWorkerApplicationModule (real Postgres)', () => {
  it.each(['operation_runs', 'ai_direct_jobs'])(
    'detects an injected %s query at the database boundary',
    async (table) => {
      if (!prisma) throw new Error('Postgres observer was not initialized');
      await prisma.$queryRawUnsafe(
        `SELECT count(*) FROM ${table} /* forbidden worker-root probe */`,
      );

      await expect(assertNoForbiddenWorkerRootStatements()).rejects.toThrow(
        'Agent worker root touched an API-owned run table',
      );
    },
  );

  it('boots the actual worker context without Operations or AI direct-job poll SQL', async () => {
    await resetDb(prisma!);
    await seedBaseFixture(prisma!);
    await seedAgentOs(prisma!);
    await resetStatementObservation();

    let context: INestApplicationContext | null = null;
    try {
      context = await NestFactory.createApplicationContext(
        AgentWorkerApplicationModule,
        { abortOnError: false, logger: ['error'] },
      );
      expect(() =>
        context!.get(AiDirectJobWorkerService, { strict: false }),
      ).toThrow();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await expect(
        assertNoForbiddenWorkerRootStatements(),
      ).resolves.toBeUndefined();
    } finally {
      await context?.close();
    }
  });
});
