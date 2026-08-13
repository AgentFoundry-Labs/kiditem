import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AgentWorkerApplicationModule } from '../agent-worker-application.module';
import { makeTestPrisma } from '../test-helpers/real-prisma';
import type { INestApplicationContext } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

const DISABLED_WORKER_ENV = {
  AGENT_RUNTIME_WORKER_ENABLED: '0',
  AI_DIRECT_JOB_WORKER_ENABLED: '0',
  OPERATION_RUNTIME_WORKER_ENABLED: '0',
  OPERATION_SCHEDULER_ENABLED: '0',
} as const;

type DisabledWorkerEnvKey = keyof typeof DISABLED_WORKER_ENV;

let prisma: PrismaClient | null = null;
let priorEnvironment: Partial<
  Record<DisabledWorkerEnvKey, string | undefined>
> = {};

async function resetStatementObservation(): Promise<void> {
  if (!prisma) throw new Error('Postgres observer was not initialized');
  await prisma.$queryRaw`SELECT pg_stat_statements_reset()`;
}

async function operationRunStatements(): Promise<string[]> {
  if (!prisma) throw new Error('Postgres observer was not initialized');
  const statements = await prisma.$queryRaw<Array<{ query: string }>>`
    SELECT query
    FROM pg_stat_statements
  `;
  return statements
    .map(({ query }) => query)
    .filter((query) => /\boperation_runs\b/i.test(query));
}

async function assertNoOperationRunStatements(): Promise<void> {
  const statements = await operationRunStatements();
  if (statements.length > 0) {
    throw new Error(
      `Agent worker root touched operation_runs:\n${statements.join('\n')}`,
    );
  }
}

beforeAll(async () => {
  priorEnvironment = Object.fromEntries(
    Object.keys(DISABLED_WORKER_ENV).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, DISABLED_WORKER_ENV);

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
  }
});

beforeEach(async () => {
  await resetStatementObservation();
});

describe('AgentWorkerApplicationModule (real Postgres)', () => {
  it('detects an injected operation_runs query at the database boundary', async () => {
    if (!prisma) throw new Error('Postgres observer was not initialized');
    await prisma.$queryRawUnsafe(
      'SELECT count(*) FROM operation_runs /* forbidden worker-root probe */',
    );

    await expect(assertNoOperationRunStatements()).rejects.toThrow(
      'Agent worker root touched operation_runs',
    );
  });

  it('boots the actual worker application context without operation_runs SQL', async () => {
    let context: INestApplicationContext | null = null;
    try {
      context = await NestFactory.createApplicationContext(
        AgentWorkerApplicationModule,
        { logger: false },
      );
      await expect(assertNoOperationRunStatements()).resolves.toBeUndefined();
    } finally {
      await context?.close();
    }
  });
});
