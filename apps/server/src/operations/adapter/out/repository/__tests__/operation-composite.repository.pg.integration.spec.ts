import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import type { CreateOperationRunRecord } from '../../../../application/port/out/repository/operation.repository.port';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('operation composite repository PostgreSQL fencing', () => {
  let locker: PrismaClient;
  let updater: PrismaClient;

  beforeAll(async () => {
    locker = makeTestPrisma();
    updater = makeTestPrisma();
    await Promise.all([locker.$connect(), updater.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([locker.$disconnect(), updater.$disconnect()]);
  });

  beforeEach(async () => {
    await resetDb(locker);
    await seedBaseFixture(locker);
  });

  it.each([
    'stale token',
    'expired lease',
    'expired deadline',
    'tenant mismatch',
  ] as const)('creates zero child rows for %s parent fence loss', async (scenario) => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    if (scenario === 'expired lease') {
      await locker.operationRun.update({
        where: { id: runId },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      });
    }
    if (scenario === 'expired deadline') {
      await locker.operationRun.update({
        where: { id: runId },
        data: { deadlineAt: new Date(Date.now() - 1_000) },
      });
    }
    const organizationId = scenario === 'tenant mismatch'
      ? OTHER_ORGANIZATION_ID
      : TEST_ORGANIZATION_ID;
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    await expect(repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: organizationId,
      parentRunId: runId,
      expectedAttemptToken: scenario === 'stale token'
        ? randomUUID()
        : attemptToken,
      child: childInput(organizationId, runId),
    })).resolves.toBeNull();
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(0);
  });

  it('rolls back every plural child when its parent lock is released after the deadline', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    const [{ deadline_at: deadlineAt }] = await locker.$queryRaw<
      Array<{ deadline_at: Date }>
    >`SELECT clock_timestamp() + interval '2 seconds' AS deadline_at`;
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(deadlineAt.getTime() + 10_000),
      deadlineAt,
    });
    const lockAcquired = deferred();
    const childRequestStarted = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM operation_runs
        WHERE id = ${runId}::uuid
        FOR UPDATE
      `;
      lockAcquired.resolve();
      await childRequestStarted.promise;
      await transaction.$queryRaw`
        SELECT pg_sleep(
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (${deadlineAt}::timestamptz - clock_timestamp())) + 0.2
          )
        ) IS NULL AS slept
      `;
    });
    await lockAcquired.promise;
    const [{ before_deadline: beforeDeadline }] = await updater.$queryRaw<
      Array<{ before_deadline: boolean }>
    >`SELECT clock_timestamp() < ${deadlineAt}::timestamptz AS before_deadline`;
    expect(beforeDeadline).toBe(true);
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const children = repository.createChildrenAndWaitForDependencies({
      signal: new AbortController().signal,
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      children: pluralChildInputs(TEST_ORGANIZATION_ID, runId),
    });
    childRequestStarted.resolve();

    await lockTransaction;
    await expect(children).resolves.toBeNull();
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(0);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', attemptToken });
  });

  it('keeps repeated valid child requests idempotent', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const request = {
      signal: new AbortController().signal,
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      child: childInput(TEST_ORGANIZATION_ID, runId),
    };

    const results = await Promise.all([
      repository.createChildAndWaitForDependency(request),
      repository.createChildAndWaitForDependency(request),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(1);
    await expect(locker.agentSessionOperationRunOwnership.count({
      where: { operationRun: { parentRunId: runId } },
    })).resolves.toBe(0);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'waiting_dependency', attemptToken: null });
  });

  it('propagates an owned parent session edge to its child in the same transaction', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const sessionId = await createOwnedSession(locker);
    await locker.agentSessionOperationRunOwnership.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId,
        operationRunId: runId,
      },
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    const child = await repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      child: childInput(TEST_ORGANIZATION_ID, runId),
    });

    await expect(locker.agentSessionOperationRunOwnership.findUnique({
      where: { operationRunId_organizationId: {
        operationRunId: child!.id,
        organizationId: TEST_ORGANIZATION_ID,
      } },
    })).resolves.toMatchObject({ sessionId });
  });

  it('rejects a preexisting child owned by a different session without changing the parent', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const parentSessionId = await createOwnedSession(locker);
    const childSessionId = await createOwnedSession(locker);
    await locker.agentSessionOperationRunOwnership.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: parentSessionId,
        operationRunId: runId,
      },
    });
    const child = await locker.operationRun.create({ data: childInput(TEST_ORGANIZATION_ID, runId) });
    await locker.agentSessionOperationRunOwnership.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: childSessionId,
        operationRunId: child.id,
      },
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    await expect(repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      child: childInput(TEST_ORGANIZATION_ID, runId),
    })).rejects.toThrow('operation_composite_child_scope_invalid');
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', attemptToken });
  });

  it('rejects an owned child after the session deletion lifecycle fence and leaves no unowned child', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const sessionId = await createOwnedSession(locker);
    await locker.agentSessionOperationRunOwnership.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId,
        operationRunId: runId,
      },
    });
    const fenceLocked = deferred();
    const childStarted = deferred();
    const deletionFence = locker.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(
          ${`agent-session-lifecycle:${TEST_ORGANIZATION_ID}:${sessionId}`},
          0
        ))
      `;
      await transaction.$queryRaw`
        SELECT id
        FROM agent_sessions
        WHERE id = ${sessionId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      fenceLocked.resolve();
      await childStarted.promise;
      await transaction.agentSession.update({
        where: { id: sessionId },
        data: { lifecycle: 'archived' },
      });
    });
    await fenceLocked.promise;
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const child = repository.createChildAndWaitForDependency({
      signal: new AbortController().signal,
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      child: childInput(TEST_ORGANIZATION_ID, runId),
    });
    childStarted.resolve();

    await deletionFence;
    await expect(child).resolves.toBeNull();
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(0);
  });

  it('atomically creates one exact set of plural children under concurrent duplicate requests', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const firstRepository = new OperationRepositoryAdapter(
      locker as unknown as PrismaService,
    );
    const secondRepository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const request = {
      signal: new AbortController().signal,
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      children: pluralChildInputs(TEST_ORGANIZATION_ID, runId),
    };

    const results = await Promise.all([
      firstRepository.createChildrenAndWaitForDependencies(request),
      secondRepository.createChildrenAndWaitForDependencies(request),
    ]);

    const created = results.filter((result) => result !== null);
    expect(created).toHaveLength(1);
    expect(created[0]).toHaveLength(3);
    await expect(locker.operationRun.findMany({
      where: { parentRunId: runId },
      orderBy: { operationKey: 'asc' },
      select: { operationKey: true, idempotencyKey: true, status: true },
    })).resolves.toEqual([
      { operationKey: 'test.composite_child_1688', idempotencyKey: `child:${runId}:1688`, status: 'queued' },
      { operationKey: 'test.composite_child_naver', idempotencyKey: `child:${runId}:naver`, status: 'queued' },
      { operationKey: 'test.composite_child_shorts', idempotencyKey: `child:${runId}:shorts`, status: 'queued' },
    ]);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'waiting_dependency', attemptToken: null });
  });

  it('serializes parent cancellation against plural child creation with no active orphan', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const creator = new OperationRepositoryAdapter(
      locker as unknown as PrismaService,
    );
    const canceller = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    const [creation, cancellation] = await Promise.all([
      creator.createChildrenAndWaitForDependencies({
        signal: new AbortController().signal,
        parentOrganizationId: TEST_ORGANIZATION_ID,
        parentRunId: runId,
        expectedAttemptToken: attemptToken,
        children: pluralChildInputs(TEST_ORGANIZATION_ID, runId),
      }),
      canceller.cancelRunAndActiveChildren({
        signal: new AbortController().signal,
        organizationId: TEST_ORGANIZATION_ID,
        parentRunId: runId,
        parentErrorCode: 'cancelled_by_operator',
        parentErrorMessage: 'stop composite',
        childErrorCode: 'cancelled_by_operator',
        childErrorMessage: 'stop composite',
        finishedAt: new Date(),
      }),
    ]);

    expect(cancellation?.parent).toMatchObject({
      id: runId,
      status: 'cancelled',
      attemptToken: null,
    });
    expect(creation === null || creation.length === 3).toBe(true);
    const children = await locker.operationRun.findMany({
      where: { parentRunId: runId },
      select: { status: true, attemptToken: true, leaseExpiresAt: true },
    });
    expect(children).toHaveLength(creation === null ? 0 : 3);
    expect(children.every((child) => (
      child.status === 'cancelled'
      && child.attemptToken === null
      && child.leaseExpiresAt === null
    ))).toBe(true);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true, leaseExpiresAt: true },
    })).resolves.toEqual({
      status: 'cancelled',
      attemptToken: null,
      leaseExpiresAt: null,
    });
  });

  it('rejects a cross-organization composite cancellation without touching the parent', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    await expect(repository.cancelRunAndActiveChildren({
      signal: new AbortController().signal,
      organizationId: OTHER_ORGANIZATION_ID,
      parentRunId: runId,
      parentErrorCode: 'cancelled_by_operator',
      parentErrorMessage: 'wrong tenant',
      childErrorCode: 'cancelled_by_operator',
      childErrorMessage: 'wrong tenant',
      finishedAt: new Date(),
    })).resolves.toBeNull();
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', attemptToken });
  });
});

async function createRunningParent(
  prisma: PrismaClient,
  input: {
    runId: string;
    attemptToken: string;
    leaseExpiresAt: Date;
    deadlineAt: Date;
  },
): Promise<void> {
  await prisma.operationRun.create({
    data: {
      id: input.runId,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'test.composite_parent_fence',
      definitionVersion: 1,
      ownerDomain: 'operations',
      title: 'Composite parent fence test',
      engineType: 'composite',
      resourceClass: 'default',
      executionTimeoutMs: 10_000,
      status: 'running',
      triggerSource: 'dashboard',
      input: {},
      attempts: 1,
      maxAttempts: 3,
      claimedBy: 'operations:integration-test',
      attemptToken: input.attemptToken,
      claimedAt: new Date(),
      leaseExpiresAt: input.leaseExpiresAt,
      deadlineAt: input.deadlineAt,
      startedAt: new Date(),
    },
  });
}

async function createOwnedSession(prisma: PrismaClient): Promise<string> {
  const versionId = randomUUID();
  const authorityProfileVersionId = randomUUID();
  await prisma.agentVersion.create({
    data: {
      id: versionId,
      agentDefinitionKey: `composite-owner-${versionId}`,
      version: 1,
      displayName: 'Composite owner',
      description: 'Composite owner',
      runtimeType: 'codex_cli',
      modelIdentity: 'test-model',
      capabilityKeys: [],
      policyDocument: {},
      manifestHash: randomUUID().replaceAll('-', ''),
      runtimeManifest: {},
      activatedAt: new Date(),
    },
  });
  await prisma.agentAuthorityProfileVersion.create({
    data: {
      id: authorityProfileVersionId,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: `composite-owner-${authorityProfileVersionId}`,
      version: 1,
      capabilityKeys: [],
      policyDocument: {},
      policyHash: randomUUID().replaceAll('-', ''),
    },
  });
  const session = await prisma.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: `composite-owner-${randomUUID()}`,
      primaryAgentVersionId: versionId,
      authorityProfileVersionId,
      lifecycle: 'active',
    },
  });
  return session.id;
}

function childInput(
  organizationId: string,
  parentRunId: string,
  suffix?: string,
): Omit<CreateOperationRunRecord, 'signal'> {
  return {
    organizationId,
    operationKey: suffix ? `test.composite_child_${suffix}` : 'test.composite_child',
    definitionVersion: 1,
    ownerDomain: 'operations',
    title: 'Composite child fence test',
    engineType: 'server',
    resourceClass: 'default',
    executionTimeoutMs: 10_000,
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId,
    scheduleId: null,
    idempotencyKey: suffix ? `child:${parentRunId}:${suffix}` : `child:${parentRunId}`,
    input: {},
    maxAttempts: 3,
    scheduledFor: null,
  };
}

function pluralChildInputs(
  organizationId: string,
  parentRunId: string,
): Array<Omit<CreateOperationRunRecord, 'signal'>> {
  return ['naver', '1688', 'shorts'].map((suffix) =>
    childInput(organizationId, parentRunId, suffix));
}
