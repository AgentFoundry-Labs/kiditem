import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ApiApplicationModule } from '../../../../api-application.module';
import { seedAgentOs } from '../../../../agent-os/seed-agent-os';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../../../adapter/out/repository/operation.repository.adapter';
import { OPERATION_REPOSITORY_PORT } from '../../port/out/repository/operation.repository.port';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import { OperationHandlerRegistryService } from '../operation-handler-registry.service';
import { OperationRunWorkerService } from '../operation-run-worker.service';
import { OperationSchedulerService } from '../operation-scheduler.service';
import {
  OPERATION_LIFECYCLE_OPTIONS,
  OperationServerLifecycleService,
} from '../operation-server-lifecycle.service';
import type {
  INestApplication,
  INestApplicationContext,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';

const EXPECTED_CANONICAL_OPERATION_OWNER_DOMAINS = [
  'advertising',
  'agent-os',
  'channels',
  'inventory',
  'orders',
  'products',
  'sourcing',
] as const;
const LIFECYCLE_ACTIVE_STATUSES = [
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
] as const;

let canonicalOperationOwnerDomains: string[] = [];

async function readRegisteredOperationOwnerDomains(
  client: PrismaClient,
): Promise<string[]> {
  const disabledRuntimeEnvironment = {
    AGENT_RUNTIME_WORKER_ENABLED: '0',
    AI_DIRECT_JOB_WORKER_ENABLED: '0',
    OPERATION_RUNTIME_WORKER_ENABLED: '0',
    OPERATION_SCHEDULER_ENABLED: '0',
    INTERACTION_GATEWAY_SHARED_SECRET: 'x'.repeat(32),
    INTERACTION_PRINCIPAL_HMAC_KEY: 'x'.repeat(32),
    INTERACTION_RUN_INTENT_HMAC_KEY: 'x'.repeat(32),
    INTERACTION_REPLAY_CURSOR_HMAC_KEY: 'x'.repeat(32),
    INTERACTION_ANALYTICS_HMAC_KEY: 'x'.repeat(32),
    AGENT_DEFAULT_MODEL: 'gpt-test',
  } as const;
  const priorEnvironment = Object.fromEntries(
    Object.keys(disabledRuntimeEnvironment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, disabledRuntimeEnvironment);

  let context: INestApplicationContext | null = null;
  try {
    await seedAgentOs(client);
    context = await NestFactory.createApplicationContext(
      ApiApplicationModule,
      { logger: false },
    );
    const definitions = context
      .get(OperationHandlerRegistryService)
      .listDefinitions();
    return [...new Set(definitions.map(({ ownerDomain }) => ownerDomain))].sort();
  } finally {
    try {
      await context?.close();
    } finally {
      for (const key of Object.keys(disabledRuntimeEnvironment)) {
        const prior = priorEnvironment[key];
        if (prior === undefined) delete process.env[key];
        else process.env[key] = prior;
      }
    }
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function runtimeDoubles(events: string[] = []) {
  return {
    scheduler: {
      start: vi.fn(() => events.push('scheduler:start')),
      stopIntake: vi.fn(() => events.push('scheduler:stop')),
      drainUntil: vi.fn(async () => events.push('scheduler:drain')),
    },
    worker: {
      start: vi.fn(() => events.push('worker:start')),
      stopIntake: vi.fn(() => events.push('worker:stop')),
      abortActive: vi.fn(() => events.push('worker:abort')),
      drainUntil: vi.fn(async (_deadline: number, includeAttempts?: boolean) =>
        events.push(includeAttempts ? 'worker:drain:all' : 'worker:drain:intake')),
    },
  };
}

function lifecycle(
  repository: OperationRepositoryAdapter,
  gate: OperationLifecycleGateService,
  runtimes: ReturnType<typeof runtimeDoubles>,
  options = { batchSize: 100, startupTimeoutMs: 2_000, shutdownTimeoutMs: 500 },
) {
  return new OperationServerLifecycleService(
    repository,
    gate,
    runtimes.scheduler as never,
    runtimes.worker as never,
    options,
  );
}

describe('operation server lifecycle PostgreSQL integration', () => {
  let locker: PrismaClient;
  let updater: PrismaClient;
  let repository: OperationRepositoryAdapter;

  beforeAll(async () => {
    locker = makeTestPrisma();
    updater = makeTestPrisma();
    repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    await Promise.all([locker.$connect(), updater.$connect()]);
    await resetDb(locker);
    await seedBaseFixture(locker);
    canonicalOperationOwnerDomains = await readRegisteredOperationOwnerDomains(updater);
  });

  afterAll(async () => {
    await Promise.all([locker.$disconnect(), updater.$disconnect()]);
  });

  beforeEach(async () => {
    await resetDb(locker);
    await seedBaseFixture(locker);
  });

  it('cleans every active owner and missed schedule before opening intake', async () => {
    expect(canonicalOperationOwnerDomains).toEqual(
      EXPECTED_CANONICAL_OPERATION_OWNER_DOMAINS,
    );
    const startedAt = new Date('2026-08-13T00:00:00.000Z');
    for (const ownerDomain of canonicalOperationOwnerDomains) {
      for (const status of LIFECYCLE_ACTIVE_STATUSES) {
        await locker.operationRun.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            operationKey: `test.bootstrap.${ownerDomain}.${status}`,
            definitionVersion: 1,
            ownerDomain,
            title: `${ownerDomain} lifecycle run`,
            engineType: 'server',
            resourceClass: 'default',
            executionTimeoutMs: 60_000,
            status,
            triggerSource: 'dashboard',
            input: { ownerDomain, status },
            result: { preserved: `${ownerDomain}:${status}` },
            attempts: 2,
            maxAttempts: 4,
            startedAt,
            claimedBy: 'first-api',
            attemptToken: crypto.randomUUID(),
            claimedAt: startedAt,
            leaseExpiresAt: new Date(startedAt.getTime() + 60_000),
            createdAt: startedAt,
          },
        });
      }
    }
    const lastScheduledFor = new Date('2026-08-12T22:00:00.000Z');
    const schedules = await Promise.all(
      (['skip', 'catch_up_once'] as const).map((misfirePolicy) =>
        locker.operationSchedule.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            operationKey: `test.bootstrap.schedule.${misfirePolicy}`,
            cronExpression: '0 * * * *',
            timeZone: 'UTC',
            misfirePolicy,
            enabled: true,
            nextRunAt: new Date('2026-08-12T23:00:00.000Z'),
            lastScheduledFor,
            createdByUserId: TEST_USER_ID,
          },
        })),
    );
    const events: string[] = [];
    const runtimes = runtimeDoubles(events);
    const gate = new OperationLifecycleGateService();
    const service = lifecycle(repository, gate, runtimes);

    const cutoff = await repository.readLifecycleDatabaseTime();
    const cutoffSpy = vi
      .spyOn(repository, 'readLifecycleDatabaseTime')
      .mockResolvedValueOnce(cutoff);
    await service.onApplicationBootstrap();

    expect(cutoffSpy).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['scheduler:start', 'worker:start']);
    expect(gate.state()).toBe('ACCEPTING');
    const runs = await locker.operationRun.findMany({
      where: { operationKey: { startsWith: 'test.bootstrap.' } },
      orderBy: { operationKey: 'asc' },
    });
    expect(runs).toHaveLength(
      canonicalOperationOwnerDomains.length *
        LIFECYCLE_ACTIVE_STATUSES.length,
    );
    expect(
      runs.map((run) => {
        const input = run.input as { status: string };
        return `${run.ownerDomain}:${input.status}`;
      }),
    ).toEqual(
      canonicalOperationOwnerDomains.flatMap((ownerDomain) =>
        LIFECYCLE_ACTIVE_STATUSES.map(
          (status) => `${ownerDomain}:${status}`,
        ),
      ).sort(),
    );
    for (const run of runs) {
      const input = run.input as { ownerDomain: string; status: string };
      expect(run).toMatchObject({
        status: 'cancelled',
        errorCode: 'operation_server_lifecycle_expired',
        finishedAt: cutoff,
        attempts: 2,
        startedAt,
        claimedBy: null,
        attemptToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
        input,
        result: { preserved: `${run.ownerDomain}:${input.status}` },
      });
    }
    const advanced = await locker.operationSchedule.findMany({
      where: { id: { in: schedules.map(({ id }) => id) } },
    });
    expect(advanced).toHaveLength(2);
    for (const schedule of advanced) {
      expect(schedule.nextRunAt.getTime()).toBeGreaterThan(cutoff.getTime());
      expect(schedule.lastScheduledFor).toEqual(lastScheduledFor);
    }
    expect(await locker.operationRun.count()).toBe(
      canonicalOperationOwnerDomains.length *
        LIFECYCLE_ACTIVE_STATUSES.length,
    );
  });

  it('never requeues, resumes, or reclaims a first-context run in a second context', async () => {
    const firstGate = new OperationLifecycleGateService();
    const first = lifecycle(repository, firstGate, runtimeDoubles());
    await first.onApplicationBootstrap();
    const startedAt = new Date();
    const run = await locker.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.first-context',
        definitionVersion: 1,
        ownerDomain: 'listing',
        title: 'First-context run',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'running',
        triggerSource: 'dashboard',
        input: { preserved: true },
        attempts: 2,
        maxAttempts: 4,
        startedAt,
        claimedBy: 'first-api',
        attemptToken: crypto.randomUUID(),
        claimedAt: startedAt,
        leaseExpiresAt: new Date(startedAt.getTime() + 60_000),
      },
    });

    await first.onModuleDestroy();
    await first.beforeApplicationShutdown();

    const claimSpy = vi.spyOn(repository, 'claimNextRun');
    const resumeSpy = vi.spyOn(repository, 'listWaitingDependencyParents');
    const secondGate = new OperationLifecycleGateService();
    const second = lifecycle(repository, secondGate, runtimeDoubles());
    await second.onApplicationBootstrap();

    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: run.id },
      select: {
        status: true,
        errorCode: true,
        attempts: true,
        startedAt: true,
        input: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      errorCode: 'operation_server_shutdown',
      attempts: 2,
      startedAt,
      input: { preserved: true },
    });
    expect(claimSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
    expect(secondGate.state()).toBe('ACCEPTING');

    await second.onModuleDestroy();
    await second.beforeApplicationShutdown();
  });

  it('keeps HTTP listen closed when a locked lifecycle row outlives the startup budget', async () => {
    const run = await locker.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.locked-bootstrap',
        definitionVersion: 1,
        ownerDomain: 'automation',
        title: 'Locked bootstrap run',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'queued',
        triggerSource: 'dashboard',
        input: {},
        attempts: 0,
        maxAttempts: 3,
      },
    });
    const locked = deferred();
    const release = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM operation_runs
        WHERE id = ${run.id}::uuid
        FOR UPDATE
      `;
      locked.resolve();
      await release.promise;
    });
    await locked.promise;

    const gate = new OperationLifecycleGateService();
    const runtimes = runtimeDoubles();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationServerLifecycleService,
        { provide: OPERATION_REPOSITORY_PORT, useValue: repository },
        { provide: OperationLifecycleGateService, useValue: gate },
        { provide: OperationSchedulerService, useValue: runtimes.scheduler },
        { provide: OperationRunWorkerService, useValue: runtimes.worker },
        {
          provide: OPERATION_LIFECYCLE_OPTIONS,
          useValue: {
            batchSize: 100,
            startupTimeoutMs: 100,
            shutdownTimeoutMs: 500,
          },
        },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication({ logger: false });
    const started = Date.now();

    await expect(app.listen(0)).rejects.toThrow(
      'operation_server_lifecycle_startup_timeout',
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(app.getHttpServer().listening).toBe(false);
    expect(gate.state()).toBe('BOOTSTRAPPING');
    expect(runtimes.scheduler.start).not.toHaveBeenCalled();
    expect(runtimes.worker.start).not.toHaveBeenCalled();

    release.resolve();
    await lockTransaction;
    await app.close();
  });
});
