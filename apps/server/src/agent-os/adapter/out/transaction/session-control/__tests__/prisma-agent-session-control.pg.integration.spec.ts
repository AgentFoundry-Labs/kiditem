import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../../test-helpers/real-prisma';
import { PrismaAgentExecutionContextRepository } from '../../../repository/prisma-agent-execution-context.repository';
import { PrismaAgentSessionOwnedOperationTransaction } from '../prisma-agent-session-owned-operation.transaction';
import { PrismaAgentSessionCancellationTransaction } from '../prisma-agent-session-cancellation.transaction';
import { PrismaAgentSessionDeletionCommandTransaction } from '../../session-deletion/prisma-agent-session-deletion-command.transaction';
import { PrismaAgentSessionDeletionQueryRepository } from '../../../repository/session-deletion/prisma-agent-session-deletion-query.repository';
import { PrismaAgentSessionDeletionExecutionTransaction } from '../../session-deletion/prisma-agent-session-deletion-execution.transaction';
import {
  AGENT_SESSION_DELETE_OPERATION,
  AGENT_SESSION_DELETE_OPERATION_KEY,
} from '../../../../../domain/operation/agent-session-deletion.operations';
import {
  AgentSessionIdSchema,
  formatAgentSessionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { SessionControlAdapterSet } from './session-control-adapter-set';

const VERSION_FROM = '20000000-0000-4000-8000-000000000001';
const VERSION_TO = '20000000-0000-4000-8000-000000000002';
const AUTHORITY_VERSION = '20000000-0000-4000-8000-000000000003';
const OTHER_AUTHORITY_VERSION = '20000000-0000-4000-8000-000000000004';

let prisma: PrismaClient | null = null;
let repository: SessionControlAdapterSet;
let ownedOperations: PrismaAgentSessionOwnedOperationTransaction;
let cancellations: PrismaAgentSessionCancellationTransaction;
let deletionCommands: PrismaAgentSessionDeletionCommandTransaction;
let deletionQueries: PrismaAgentSessionDeletionQueryRepository;
let deletionExecutions: PrismaAgentSessionDeletionExecutionTransaction;

const sessionTaskDefinition = {
  key: 'agent-os.execute-session-task',
  version: 1,
  title: 'Execute session task',
  ownerDomain: 'agent-os',
  engineType: 'agent_os' as const,
  resourceClass: 'default' as const,
  executionTimeoutMs: 900_000,
  maxAttempts: 3,
  successPersistence: 'retained' as const,
};

beforeAll(async () => {
  prisma = makeTestPrisma();
  repository = new SessionControlAdapterSet(prisma as never);
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedControlFixture(prisma);
  ownedOperations = new PrismaAgentSessionOwnedOperationTransaction(prisma as never);
  cancellations = new PrismaAgentSessionCancellationTransaction(prisma as never);
  deletionCommands = new PrismaAgentSessionDeletionCommandTransaction(prisma as never);
  deletionQueries = new PrismaAgentSessionDeletionQueryRepository(prisma as never);
  deletionExecutions = new PrismaAgentSessionDeletionExecutionTransaction(prisma as never);
});

describe('Prisma Agent session-control transaction seams', () => {
  it('creates the run, ownership, attempt, and attempt binding in one transaction', async () => {
    const fixture = await createRootGraph();
    const idempotencyKey = `session-execution:${fixture.executionId}`;
    const input = {
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey,
      definition: sessionTaskDefinition,
      parsedInput: { execution: fixture.executionId },
    };

    const result = await ownedOperations.createExecutionRun(input);
    const replay = await ownedOperations.createExecutionRun(input);

    expect(replay).toEqual(result);
    await expect(prisma!.agentSessionOperationRunOwnership.findUnique({
      where: { operationRunId_organizationId: {
        operationRunId: result.operationRunId,
        organizationId: TEST_ORGANIZATION_ID,
      } },
    })).resolves.toMatchObject({ sessionId: fixture.sessionId });
    await expect(prisma!.agentExecutionAttemptOperationBinding.count({
      where: { operationRunId: result.operationRunId },
    })).resolves.toBe(1);
    await expect(prisma!.operationRun.count({ where: { idempotencyKey } })).resolves.toBe(1);
  });

  it('reuses the persisted start intent after a crash before runtime_starting and rejects a replacement UUID', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'start-intent-crash');
    const startIntentId = '20000000-0000-4000-8000-000000000010';
    const replacementIntentId = '20000000-0000-4000-8000-000000000011';
    const operation = await prisma!.operationRun.findUniqueOrThrow({
      where: { id: owned.operationRunId },
      select: { attemptToken: true },
    });
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: owned.operationRunId,
    });

    const first = await repository.persistRuntimeStartIntent({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: owned.attemptId,
      operationRunId: owned.operationRunId,
      attemptToken: operation.attemptToken,
      runtimeType: 'copilotkit_agui',
      startIntentId,
    });

    // Simulate process recreation after the transaction commits but before
    // the OperationRun runtime_starting checkpoint is written.
    const recreatedRepository = new SessionControlAdapterSet(prisma as never);
    const replay = await recreatedRepository.persistRuntimeStartIntent({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: owned.attemptId,
      operationRunId: owned.operationRunId,
      attemptToken: operation.attemptToken,
      runtimeType: 'copilotkit_agui',
      startIntentId,
    });

    expect(replay).toEqual(first);
    await expect(prisma!.operationRunCheckpoint.count({
      where: { operationRunId: owned.operationRunId },
    })).resolves.toBe(0);
    await expect(prisma!.agentExecutionAttempt.findUniqueOrThrow({
      where: { id: owned.attemptId },
      select: {
        runtimeStartIntentId: true,
        runtimeCredentialGeneration: true,
        externalRunId: true,
        encryptedHandleRef: true,
      },
    })).resolves.toEqual({
      runtimeStartIntentId: startIntentId,
      runtimeCredentialGeneration: first.runtimeCredentialGeneration,
      externalRunId: null,
      encryptedHandleRef: null,
    });
    await expect(recreatedRepository.persistRuntimeStartIntent({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: owned.attemptId,
      operationRunId: owned.operationRunId,
      attemptToken: operation.attemptToken,
      runtimeType: 'copilotkit_agui',
      startIntentId: replacementIntentId,
    })).rejects.toMatchObject({ code: 'AGENT_RUNTIME_START_INTENT_CONFLICT' });
  });

  it('recreates the exact MCP credential context only from its active persisted operation binding', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'mcp-context');
    const startIntentId = '20000000-0000-4000-8000-000000000022';
    const operation = await prisma!.operationRun.findUniqueOrThrow({
      where: { id: owned.operationRunId },
      select: { attemptToken: true },
    });
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: owned.operationRunId,
    });
    const credential = await repository.persistRuntimeStartIntent({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: owned.attemptId,
      operationRunId: owned.operationRunId,
      attemptToken: operation.attemptToken,
      runtimeType: 'copilotkit_agui',
      startIntentId,
    });
    await prisma!.operationRun.update({
      where: { id: owned.operationRunId }, data: { status: 'running' },
    });
    const contexts = new PrismaAgentExecutionContextRepository(prisma as never);
    const exact = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: owned.attemptId,
      startIntentId,
      runtimeCredentialGeneration: credential.runtimeCredentialGeneration,
    };
    await expect(contexts.loadRuntimeExecutionGraph(exact)).resolves.toMatchObject({
      sessionTaskId: fixture.taskId,
      operationRunId: owned.operationRunId,
      attemptState: 'running',
      operationStatus: 'running',
    });
    await expect(contexts.loadRuntimeExecutionGraph({
      ...exact,
      startIntentId: '20000000-0000-4000-8000-000000000023',
    })).resolves.toBeNull();
    await prisma!.operationRun.update({
      where: { id: owned.operationRunId }, data: { status: 'cancelled' },
    });
    await expect(contexts.loadRuntimeExecutionGraph(exact)).resolves.toBeNull();
  });

  it('rolls back every row when ownership cannot use the scoped session', async () => {
    const fixture = await createRootGraph();
    const foreignSession = await createRootGraph({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      authorityProfileVersionId: OTHER_AUTHORITY_VERSION,
    });
    const idempotencyKey = `session-execution:foreign:${fixture.executionId}`;

    await expect(ownedOperations.createExecutionRun({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: foreignSession.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey,
      definition: sessionTaskDefinition,
      parsedInput: { execution: fixture.executionId },
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });

    await expect(prisma!.operationRun.count({ where: { idempotencyKey } })).resolves.toBe(0);
    await expect(prisma!.agentSessionOperationRunOwnership.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma!.agentExecutionAttempt.count({
      where: { executionId: fixture.executionId },
    })).resolves.toBe(0);
  });

  it('creates exactly one system-only deletion run and immutable binding under concurrent canonical requests', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'credential-generation');
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );
    const input = deletionInput(session);

    const [first, second] = await Promise.all([
      deletionCommands.begin(input),
      deletionCommands.begin(input),
    ]);

    expect(first).toEqual({ state: 'deleting', failureCode: null });
    expect(second).toEqual({ state: 'deleting', failureCode: null });
    const run = await prisma!.operationRun.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: AGENT_SESSION_DELETE_OPERATION_KEY,
      },
      select: { id: true, triggerSource: true, requestedByUserId: true, input: true, maxAttempts: true },
    });
    expect(run).toMatchObject({
      triggerSource: 'system',
      requestedByUserId: TEST_USER_ID,
      input: { session, retryGeneration: 1 },
      maxAttempts: 5,
    });
    await expect(prisma!.agentSessionDeletionOperationBinding.findUnique({
      where: { operationRunId_organizationId: {
        operationRunId: run.id,
        organizationId: TEST_ORGANIZATION_ID,
      } },
    })).resolves.toMatchObject({
      sessionId: fixture.sessionId,
      sessionCreatorUserId: TEST_USER_ID,
      deletionRequestedByUserId: TEST_USER_ID,
      retryGeneration: 1,
      predecessorOperationRunId: null,
    });
    await expect(prisma!.agentSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
      select: { lifecycle: true, deletionOperationRunId: true, deletionFailureCode: true },
    })).resolves.toEqual({
      lifecycle: 'deleting', deletionOperationRunId: run.id, deletionFailureCode: null,
    });
    await expect(prisma!.operationRun.count({
      where: { organizationId: TEST_ORGANIZATION_ID, operationKey: AGENT_SESSION_DELETE_OPERATION_KEY },
    })).resolves.toBe(1);
    await expect(prisma!.agentExecutionAttempt.findUniqueOrThrow({
      where: { id: owned.attemptId },
      select: { runtimeCredentialGeneration: true },
    })).resolves.toEqual({ runtimeCredentialGeneration: 1 });
  });

  it('classifies no runtime evidence as never_started and a persisted runtime_starting CLI attempt without a handle as started', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'deletion-runtime-starting');
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );
    await deletionCommands.begin(deletionInput(session));
    const deletion = await prisma!.operationRun.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: AGENT_SESSION_DELETE_OPERATION_KEY,
      },
      select: { id: true },
    });
    const attemptToken = '20000000-0000-4000-8000-000000000012';
    await prisma!.operationRun.update({
      where: { id: deletion.id },
      data: { status: 'running', attempts: 2, attemptToken },
    });
    await expect(deletionExecutions.loadFencedSnapshot({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: deletion.id,
      attemptToken,
    })).resolves.toMatchObject({
      kind: 'ready',
      snapshot: { runtimeAttempts: [{ attemptId: owned.attemptId, state: 'never_started' }] },
    });

    await prisma!.$transaction([
      prisma!.operationRun.update({
        where: { id: owned.operationRunId },
        data: { status: 'running', attemptToken: '20000000-0000-4000-8000-000000000014' },
      }),
      prisma!.agentExecutionAttempt.update({
        where: { id: owned.attemptId },
        data: {
          runtimeType: 'codex_cli',
          runtimeStartIntentId: '20000000-0000-4000-8000-000000000013',
        },
      }),
      prisma!.operationRunCheckpoint.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          operationRunId: owned.operationRunId,
          sequence: 1n,
          kind: 'runtime_starting',
          state: {},
        },
      }),
    ]);

    await expect(deletionExecutions.loadFencedSnapshot({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: deletion.id,
      attemptToken,
    })).resolves.toMatchObject({
      kind: 'ready',
      snapshot: {
        consumedAttempts: 2,
        runtimeAttempts: [{
          attemptId: owned.attemptId,
          runtimeType: 'codex_cli',
          state: 'started',
          startIntentId: '20000000-0000-4000-8000-000000000013',
          handle: null,
        }],
        operationRuns: [expect.objectContaining({
          runId: owned.operationRunId,
          operationKey: sessionTaskDefinition.key,
        })],
      },
    });
  });

  it('closes recursively connected owned runs and preserves their exact control coordinates', async () => {
    const fixture = await createRootGraph();
    const root = await createOwnedExecutionOperation(fixture, 'deletion-closure-root');
    const child = await createOwnedChildOperation(fixture, root.operationRunId, 'deletion-closure-child');
    const grandchild = await createOwnedChildOperation(fixture, child.id, 'deletion-closure-grandchild');
    await prisma!.agentExecutionAttemptOperationBinding.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        executionAttemptId: root.attemptId,
        executionId: fixture.executionId,
        sessionId: fixture.sessionId,
        operationRunId: child.id,
        predecessorOperationRunId: root.operationRunId,
        continuationKey: `deletion-closure:${child.id}`,
      },
    });
    const deletion = await startDeletionExecution(fixture.sessionId);

    await expect(deletionExecutions.loadFencedSnapshot({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: deletion.operationRunId,
      attemptToken: deletion.attemptToken,
    })).resolves.toMatchObject({
      kind: 'ready',
      snapshot: {
        operationRuns: expect.arrayContaining([
          expect.objectContaining({
            runId: root.operationRunId,
            operationKey: sessionTaskDefinition.key,
            status: 'queued',
            expectedAttemptToken: null,
            nativeRunType: null,
            nativeRunId: null,
          }),
          expect.objectContaining({ runId: child.id, operationKey: sessionTaskDefinition.key }),
          expect.objectContaining({ runId: grandchild.id, operationKey: sessionTaskDefinition.key }),
        ]),
      },
    });
  });

  it('includes active artifacts without a transient multipart upload alongside materializing artifacts', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'deletion-active-artifact');
    const active = await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        artifactType: 'report',
        materializationOperationRunId: owned.operationRunId,
        sha256: 'a'.repeat(64),
        lifecycle: 'active',
        idempotencyKey: `deletion-active-artifact:${fixture.executionId}`,
      },
    });
    const deletion = await startDeletionExecution(fixture.sessionId);

    await expect(deletionExecutions.loadFencedSnapshot({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: deletion.operationRunId,
      attemptToken: deletion.attemptToken,
    })).resolves.toMatchObject({
      kind: 'ready',
      snapshot: {
        artifacts: [{
          artifactId: active.id,
          materializationOperationRunId: owned.operationRunId,
          providerUploadId: null,
        }],
      },
    });
  });

  it('rejects a scheduled or foreign-owned closure before issuing a partial snapshot', async () => {
    const scheduledFixture = await createRootGraph();
    const scheduled = await createOwnedExecutionOperation(scheduledFixture, 'deletion-scheduled');
    const schedule = await prisma!.operationSchedule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: `test-deletion-schedule:${scheduled.operationRunId}`,
        cronExpression: '0 * * * *',
        input: {},
        createdByUserId: TEST_USER_ID,
      },
    });
    await prisma!.operationRun.update({
      where: { id: scheduled.operationRunId },
      data: { scheduleId: schedule.id },
    });
    const scheduledDeletion = await startDeletionExecution(scheduledFixture.sessionId);
    await expect(deletionExecutions.loadFencedSnapshot({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: scheduledFixture.sessionId,
      operationRunId: scheduledDeletion.operationRunId,
      attemptToken: scheduledDeletion.attemptToken,
    })).resolves.toEqual({
      kind: 'retryable',
      code: 'SESSION_OPERATION_OWNERSHIP_INVALID',
      consumedAttempts: 2,
    });

    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'deletion-foreign-owner');
    const foreign = await createRootGraph();
    await createOwnedChildOperation(foreign, owned.operationRunId, 'deletion-foreign-child');
    const foreignDeletion = await startDeletionExecution(fixture.sessionId);
    await expect(deletionExecutions.loadFencedSnapshot({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: foreignDeletion.operationRunId,
      attemptToken: foreignDeletion.attemptToken,
    })).resolves.toEqual({
      kind: 'retryable',
      code: 'SESSION_OPERATION_OWNERSHIP_INVALID',
      consumedAttempts: 2,
    });
  });

  it('does not mutate an owned run for stale deletion tokens or a cross-session terminalization request', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'deletion-terminal-fence');
    const deletion = await startDeletionExecution(fixture.sessionId);
    const stale = '20000000-0000-4000-8000-000000000015';

    await expect(deletionExecutions.terminalizeOwnedRun({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: deletion.operationRunId,
      attemptToken: stale,
      ownedOperationRunId: owned.operationRunId,
    })).rejects.toThrow('SESSION_OPERATION_OWNERSHIP_INVALID');
    await expect(prisma!.operationRun.findUniqueOrThrow({
      where: { id: owned.operationRunId }, select: { status: true },
    })).resolves.toEqual({ status: 'queued' });

    const other = await createRootGraph();
    const otherOwned = await createOwnedExecutionOperation(other, 'deletion-terminal-cross-session');
    await expect(deletionExecutions.terminalizeOwnedRun({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: deletion.operationRunId,
      attemptToken: deletion.attemptToken,
      ownedOperationRunId: otherOwned.operationRunId,
    })).rejects.toThrow('SESSION_OPERATION_OWNERSHIP_INVALID');
    await expect(prisma!.operationRun.findUniqueOrThrow({
      where: { id: otherOwned.operationRunId }, select: { status: true },
    })).resolves.toEqual({ status: 'queued' });
  });

  it('rolls back the deletion lifecycle fence when immutable binding creation fails', async () => {
    const fixture = await createRootGraph();
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );
    const failingPrisma = new Proxy(prisma!, {
      get(target, key, receiver) {
        if (key !== '$transaction') return Reflect.get(target, key, receiver);
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          target.$transaction(async (transaction) => callback(new Proxy(transaction, {
            get(transactionTarget, transactionKey, transactionReceiver) {
              if (transactionKey !== 'agentSessionDeletionOperationBinding') {
                return Reflect.get(transactionTarget, transactionKey, transactionReceiver);
              }
              return new Proxy(transactionTarget.agentSessionDeletionOperationBinding, {
                get(bindingTarget, bindingKey, bindingReceiver) {
                  if (bindingKey === 'create') return async () => { throw new Error('binding_fault'); };
                  return Reflect.get(bindingTarget, bindingKey, bindingReceiver);
                },
              });
            },
          }) as Prisma.TransactionClient));
      },
    });
    const commands = new PrismaAgentSessionDeletionCommandTransaction(failingPrisma as never);

    await expect(commands.begin(deletionInput(session))).rejects.toThrow('binding_fault');
    await expect(prisma!.agentSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
      select: { lifecycle: true, deletionOperationRunId: true },
    })).resolves.toEqual({ lifecycle: 'active', deletionOperationRunId: null });
    await expect(prisma!.operationRun.count({
      where: { organizationId: TEST_ORGANIZATION_ID, operationKey: AGENT_SESSION_DELETE_OPERATION_KEY },
    })).resolves.toBe(0);
  });

  it('returns null without a typed scope leak for unknown and cross-organization begins and retries', async () => {
    const fixture = await createRootGraph();
    const unknown = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse('00000000-0000-4000-8000-000000000099'),
    );
    const foreign = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );

    await expect(deletionCommands.begin(deletionInput(unknown))).resolves.toBeNull();
    await expect(deletionCommands.retry(deletionRetryInput(unknown))).resolves.toBeNull();
    await expect(deletionCommands.begin(deletionInput(foreign, OTHER_ORGANIZATION_ID, OTHER_USER_ID)))
      .resolves.toBeNull();
    await expect(deletionCommands.retry(deletionRetryInput(foreign, OTHER_ORGANIZATION_ID, OTHER_USER_ID)))
      .resolves.toBeNull();
    await expect(prisma!.operationRun.count({
      where: { organizationId: TEST_ORGANIZATION_ID, operationKey: AGENT_SESSION_DELETE_OPERATION_KEY },
    })).resolves.toBe(0);
  });

  it('does not expose retry lifecycle state to an active ordinary member', async () => {
    const fixture = await createRootGraph();
    const ordinaryUserId = 'c1234567-89ab-4cde-8f01-23456789abcd';
    await prisma!.user.create({
      data: {
        id: ordinaryUserId,
        email: 'ordinary-deletion-member@test.local',
        name: 'Ordinary deletion member',
        role: 'member',
        type: 'human',
      },
    });
    await prisma!.organizationMembership.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        userId: ordinaryUserId,
        role: 'member',
        status: 'active',
      },
    });
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );

    await expect(deletionCommands.retry(
      deletionRetryInput(session, TEST_ORGANIZATION_ID, ordinaryUserId),
    )).resolves.toBeNull();
  });

  it('does not retain status access for a deletion requester demoted from administrator', async () => {
    const fixture = await createRootGraph();
    const adminUserId = 'd1234567-89ab-4cde-8f01-23456789abcd';
    await prisma!.user.create({
      data: {
        id: adminUserId,
        email: 'demoted-deletion-admin@test.local',
        name: 'Demoted deletion admin',
        role: 'admin',
        type: 'human',
      },
    });
    await prisma!.organizationMembership.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        userId: adminUserId,
        role: 'admin',
        status: 'active',
      },
    });
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );
    await deletionCommands.begin(deletionInput(session, TEST_ORGANIZATION_ID, adminUserId));
    await prisma!.organizationMembership.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, userId: adminUserId },
      data: { role: 'member' },
    });

    await expect(deletionQueries.findAuthorizedStatus({
      organizationId: TEST_ORGANIZATION_ID,
      actorUserId: adminUserId,
      session,
    })).resolves.toBeNull();
  });

  it.each(['deleting', 'delete_failed'] as const)(
    'hides %s sessions from ordinary task execution inspection',
    async (lifecycle) => {
      const fixture = await createRootGraph();
      await prisma!.agentSession.update({
        where: { id: fixture.sessionId },
        data: { lifecycle },
      });

      await expect(repository.loadTaskExecution({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        actorId: TEST_USER_ID,
      })).resolves.toBeNull();
    },
  );

  it('uses one fixed deletion attempt budget across lifecycle successors in the same generation', async () => {
    const fixture = await createRootGraph();
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
      AgentSessionIdSchema.parse(fixture.sessionId),
    );
    const first = await prisma!.operationRun.create({
      data: deletionOperationRun({
        idempotencyKey: `agent-session-delete:${fixture.sessionId}:generation:1:first`,
        attempts: 2,
      }),
    });
    const second = await prisma!.operationRun.create({
      data: deletionOperationRun({
        idempotencyKey: `agent-session-delete:${fixture.sessionId}:generation:1:second`,
        attempts: 3,
      }),
    });
    await prisma!.$transaction([
      prisma!.agentSessionDeletionOperationBinding.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: fixture.sessionId,
          sessionCreatorUserId: TEST_USER_ID,
          deletionRequestedByUserId: TEST_USER_ID,
          retryGeneration: 1,
          operationRunId: first.id,
          predecessorOperationRunId: null,
        },
      }),
      prisma!.agentSessionDeletionOperationBinding.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: fixture.sessionId,
          sessionCreatorUserId: TEST_USER_ID,
          deletionRequestedByUserId: TEST_USER_ID,
          retryGeneration: 1,
          operationRunId: second.id,
          predecessorOperationRunId: first.id,
        },
      }),
      prisma!.agentSession.update({
        where: { id: fixture.sessionId },
        data: {
          lifecycle: 'delete_failed',
          deletionOperationRunId: second.id,
          deletionFailureCode: 'RUNTIME_CLEANUP_UNKNOWN',
        },
      }),
    ]);

    await expect(deletionCommands.retry(deletionRetryInput(session))).resolves.toEqual({
      state: 'deleting',
      failureCode: null,
    });
    await expect(prisma!.agentSessionDeletionOperationBinding.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        retryGeneration: 2,
      },
      select: {
        predecessorOperationRunId: true,
        operationRun: { select: { maxAttempts: true } },
      },
    })).resolves.toEqual({
      predecessorOperationRunId: second.id,
      operationRun: { maxAttempts: 5 },
    });
  });

  it('keeps a successor OperationRun owned by the same session', async () => {
    const fixture = await createRootGraph();
    const initial = await ownedOperations.createExecutionRun({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: `session-execution:${fixture.executionId}`,
      definition: sessionTaskDefinition,
      parsedInput: { execution: fixture.executionId },
    });
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: initial.operationRunId,
    });
    await repository.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: initial.attemptId,
      runtimeType: 'copilotkit_agui',
      externalRunId: 'owned-continuation-runtime',
      encryptedHandleRef: 'vault://owned-continuation-runtime',
      runtimeGeneration: 1,
    });
    await prisma!.operationRun.update({
      where: { id: initial.operationRunId },
      data: {
        status: 'cancelled',
        errorCode: 'operation_server_lifecycle_expired',
        finishedAt: new Date(),
      },
    });

    const successor = await repository.continueOperationAttempt({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      attemptId: initial.attemptId,
      predecessorOperationRunId: initial.operationRunId,
      continuationKey: `lifecycle:${initial.operationRunId}`,
    });

    await expect(prisma!.agentSessionOperationRunOwnership.findUnique({
      where: { operationRunId_organizationId: {
        operationRunId: successor.operationRunId,
        organizationId: TEST_ORGANIZATION_ID,
      } },
    })).resolves.toMatchObject({ sessionId: fixture.sessionId });
    await expect(prisma!.agentSessionOperationRunOwnership.findUnique({
      where: { operationRunId_organizationId: {
        operationRunId: initial.operationRunId,
        organizationId: TEST_ORGANIZATION_ID,
      } },
    })).resolves.toMatchObject({ sessionId: fixture.sessionId });
  });

  it.each([
    ['missing successor owner', async (operationRunId: string) => {
      await prisma!.agentSessionOperationRunOwnership.delete({
        where: { operationRunId_organizationId: {
          operationRunId,
          organizationId: TEST_ORGANIZATION_ID,
        } },
      });
    }],
    ['drifted successor input', async (operationRunId: string) => {
      await prisma!.operationRun.update({
        where: { id: operationRunId },
        data: { input: { drifted: true } },
      });
    }],
  ] as const)(
    'rejects an exact continuation replay with %s',
    async (_scenario, corrupt) => {
      const fixture = await createRootGraph();
      const initial = await createOwnedExecutionOperation(fixture, `continuation-replay:${_scenario}`);
      await repository.activateAttemptForOperation({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        executionId: fixture.executionId,
        operationRunId: initial.operationRunId,
      });
      await repository.persistAttemptHandle({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        executionId: fixture.executionId,
        attemptId: initial.attemptId,
        runtimeType: 'copilotkit_agui',
        externalRunId: `continuation-replay:${_scenario}`,
        encryptedHandleRef: `vault://continuation-replay:${_scenario}`,
        runtimeGeneration: 1,
      });
      await prisma!.operationRun.update({
        where: { id: initial.operationRunId },
        data: {
          status: 'cancelled',
          errorCode: 'operation_server_lifecycle_expired',
          finishedAt: new Date(),
        },
      });
      const continuationKey = `lifecycle:${initial.operationRunId}`;
      const successor = await repository.continueOperationAttempt({
        signal: new AbortController().signal,
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        attemptId: initial.attemptId,
        predecessorOperationRunId: initial.operationRunId,
        continuationKey,
      });
      await corrupt(successor.operationRunId);

      await expect(repository.continueOperationAttempt({
        signal: new AbortController().signal,
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        attemptId: initial.attemptId,
        predecessorOperationRunId: initial.operationRunId,
        continuationKey,
      })).rejects.toMatchObject({
        code: 'AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT',
      });
    },
  );

  it('fails closed when a direct continuation has an unowned predecessor', async () => {
    const fixture = await createRootGraph();
    const predecessor = await createUnownedContinuationPredecessor(fixture);
    const continuationKey = `lifecycle:${predecessor.operationRunId}`;

    await expect(repository.continueOperationAttempt({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      attemptId: predecessor.attemptId,
      predecessorOperationRunId: predecessor.operationRunId,
      continuationKey,
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });

    await expect(prisma!.operationRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: `agent-session-continuation:${predecessor.attemptId}:${continuationKey}`,
      },
    })).resolves.toBe(0);
    await expect(prisma!.agentExecutionAttemptOperationBinding.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        executionAttemptId: predecessor.attemptId,
        continuationKey,
      },
    })).resolves.toBe(0);
    await expect(prisma!.operationRunCheckpoint.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
  });

  it('creates one idempotent delegated child and fences organization ownership', async () => {
    const fixture = await createRootGraph();
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      parentTaskId: fixture.taskId,
      fromAgentVersionId: VERSION_FROM,
      toAgentVersionId: VERSION_TO,
      objective: '상품 근거를 검증한다',
      authoritySubset: ['sourcing.retrieveWorkspaceEvidence'],
      depth: 1,
      idempotencyKey: 'delegate:sourcing:1',
    };

    const first = await repository.createDelegatedTask(input);
    const retry = await repository.createDelegatedTask(input);

    expect(retry).toEqual(first);
    await expect(repository.createDelegatedTask({
      ...input,
      organizationId: OTHER_ORGANIZATION_ID,
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
    await expect(prisma!.agentSessionTask.count({
      where: { sessionId: fixture.sessionId, isRoot: false },
    })).resolves.toBe(1);
    await expect(prisma!.agentSessionTaskDelegation.count({
      where: { sessionId: fixture.sessionId },
    })).resolves.toBe(1);
  });

  it.each([
    ['delegation', async () => {
      const fixture = await createRootGraph();
      await markDeleting(fixture.sessionId);
      return repository.createDelegatedTask({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        parentTaskId: fixture.taskId,
        fromAgentVersionId: VERSION_FROM,
        toAgentVersionId: VERSION_TO,
        objective: 'must not delegate after deletion begins',
        authoritySubset: ['sourcing.retrieveWorkspaceEvidence'],
        depth: 1,
        idempotencyKey: 'deleting:delegation',
      });
    }],
    ['approval', async () => {
      const fixture = await createRootGraph();
      const owned = await createOwnedExecutionOperation(fixture, 'deleting-approval');
      await repository.activateAttemptForOperation({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        executionId: fixture.executionId,
        operationRunId: owned.operationRunId,
      });
      await repository.persistAttemptHandle({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        executionId: fixture.executionId,
        attemptId: owned.attemptId,
        runtimeType: 'copilotkit_agui',
        externalRunId: 'deleting-approval-runtime',
        encryptedHandleRef: 'vault://deleting-approval-runtime',
        runtimeGeneration: 1,
      });
      await markDeleting(fixture.sessionId);
      return repository.requestApproval({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        attemptId: owned.attemptId,
        operationRunId: owned.operationRunId,
        capabilityKey: 'supply.submit_purchase_order',
        argumentsHash: 'a'.repeat(64),
        resourceSnapshot: [],
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        idempotencyKey: 'deleting:approval',
      });
    }],
    ['attempt', async () => {
      const fixture = await createRootGraph();
      await markDeleting(fixture.sessionId);
      return repository.startAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        executionId: fixture.executionId,
        runtimeType: 'copilotkit_agui',
        idempotencyKey: 'deleting:attempt',
      });
    }],
    ['retry', async () => {
      const fixture = await createRootGraph();
      await repository.transitionTask({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        expectedState: 'running',
        state: 'failed',
      });
      await prisma!.agentExecution.update({
        where: { id: fixture.executionId },
        data: { status: 'failed', finishedAt: new Date() },
      });
      await markDeleting(fixture.sessionId);
      return repository.createRetryExecution({
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_USER_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        expectedStatus: 'failed',
        idempotencyKey: 'deleting:retry',
      });
    }],
  ])('rejects %s after the deletion fence', async (_kind, mutate) => {
    await expect(mutate()).rejects.toMatchObject({
      code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT',
    });
  });

  it('anchors an official child execution to the canonical parent user event without copying a conversation turn', async () => {
    const fixture = await createRootGraph();

    const delegated = await repository.createDelegatedTask({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      parentTaskId: fixture.taskId,
      parentExecutionId: fixture.executionId,
      fromAgentVersionId: VERSION_FROM,
      toAgentVersionId: VERSION_TO,
      targetAgentDefinitionKey: 'sourcing',
      objective: '상품 근거를 검증한다',
      authoritySubset: ['sourcing.retrieveWorkspaceEvidence'],
      depth: 1,
      maxDepth: 2,
      maxChildrenPerTask: 5,
      idempotencyKey: 'delegate:official:1',
    });

    const childExecution = await prisma!.agentExecution.findUniqueOrThrow({
      where: { id: delegated.childExecutionId },
      select: { currentInput: true, resourceRefs: true },
    });
    expect(childExecution.currentInput).toMatchObject({
      userEvent: {
        externalEventId: expect.stringMatching(/^user-event:/),
        payload: { content: 'canonical root request' },
      },
      delegation: {
        objective: '상품 근거를 검증한다',
        parentExecutionId: fixture.executionId,
      },
    });
    await expect(prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(1);
    const attempt = await repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: delegated.childExecutionId,
      runtimeType: 'codex_cli',
      idempotencyKey: 'operation:official-child',
    });
    const contextRepository = new PrismaAgentExecutionContextRepository(
      prisma as never,
    );
    await expect(contextRepository.loadExecutionGraph({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      sessionTaskId: delegated.childTaskId,
      executionId: delegated.childExecutionId,
      attemptId: attempt.id,
    })).resolves.toMatchObject({
      currentUserEvent: {
        eventType: 'user_message',
        payload: { content: 'canonical root request' },
      },
    });
    await expect(repository.isExecutionCapabilityAllowed({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      sessionTaskId: delegated.childTaskId,
      executionId: delegated.childExecutionId,
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
    })).resolves.toBe(true);
    await expect(repository.isExecutionCapabilityAllowed({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      sessionTaskId: fixture.taskId,
      executionId: delegated.childExecutionId,
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
    })).resolves.toBe(false);
    await expect(repository.isExecutionCapabilityAllowed({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      sessionTaskId: delegated.childTaskId,
      executionId: delegated.childExecutionId,
      capabilityKey: 'supply.submit_purchase_order',
    })).resolves.toBe(false);
  });

  it('allows an active official execution to invoke a declared read capability while its root task is interpreting', async () => {
    const fixture = await createRootGraph();
    await prisma!.$transaction([
      prisma!.agentSessionTask.update({
        where: { id: fixture.taskId },
        data: { status: 'interpreting', assignedAgentVersionId: VERSION_TO },
      }),
      prisma!.agentPolicySnapshot.update({
        where: { id: fixture.policyId },
        data: { agentVersionId: VERSION_TO },
      }),
      prisma!.agentExecution.update({
        where: { id: fixture.executionId },
        data: { agentVersionId: VERSION_TO },
      }),
    ]);

    await expect(repository.isExecutionCapabilityAllowed({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      sessionTaskId: fixture.taskId,
      executionId: fixture.executionId,
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
    })).resolves.toBe(true);
  });

  it('rejects an idempotency key reused with different delegated input', async () => {
    const fixture = await createRootGraph();
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      parentTaskId: fixture.taskId,
      fromAgentVersionId: VERSION_FROM,
      toAgentVersionId: VERSION_TO,
      objective: '근거 확인',
      authoritySubset: ['sourcing.retrieveWorkspaceEvidence'],
      depth: 1,
      idempotencyKey: 'delegate:conflict:1',
    };
    await repository.createDelegatedTask(input);

    await expect(repository.createDelegatedTask({
      ...input,
      objective: '다른 목표',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT' });
  });

  it('serializes distinct child keys against the immutable max-children bound', async () => {
    const fixture = await createRootGraph();
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      parentTaskId: fixture.taskId,
      parentExecutionId: fixture.executionId,
      fromAgentVersionId: VERSION_FROM,
      toAgentVersionId: VERSION_TO,
      targetAgentDefinitionKey: 'sourcing',
      objective: '근거 확인',
      authoritySubset: ['sourcing.retrieveWorkspaceEvidence'],
      depth: 1,
      maxDepth: 2,
      maxChildrenPerTask: 1,
    };

    const outcomes = await Promise.allSettled([
      repository.createDelegatedTask({ ...base, idempotencyKey: 'delegate:limit:a' }),
      repository.createDelegatedTask({ ...base, idempotencyKey: 'delegate:limit:b' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    await expect(prisma!.agentSessionTask.count({
      where: { sessionId: fixture.sessionId, parentTaskId: fixture.taskId },
    })).resolves.toBe(1);
  });

  it('assigns an immutable sequential attempt number and terminals once', async () => {
    const fixture = await createRootGraph();
    const first = await repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      runtimeType: 'codex_cli',
      idempotencyKey: 'attempt:first',
    });
    expect((await repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      runtimeType: 'codex_cli',
      idempotencyKey: 'attempt:first',
    })).id).toBe(first.id);
    const second = await repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      runtimeType: 'codex_cli',
      idempotencyKey: 'attempt:second',
    });
    expect([first.attemptNumber, second.attemptNumber]).toEqual([1, 2]);

    await repository.finishAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: second.id,
      expectedState: 'running',
      state: 'succeeded',
    });
    await expect(repository.finishAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: second.id,
      expectedState: 'succeeded',
      state: 'failed',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' });
  });

  it('links one active execution attempt to its exact organization-scoped Operation run for cancellation', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'cancel-link');
    const operation = { id: owned.operationRunId };
    const reserved = { id: owned.attemptId };
    await expect(repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
    })).resolves.toMatchObject({ id: reserved.id, state: 'running' });
    await expect(prisma!.agentExecutionAttemptOperationBinding.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        executionAttemptId: reserved.id,
        operationRunId: operation.id,
      },
      select: { operationRunId: true },
    })).resolves.toEqual({ operationRunId: operation.id });
    await expect(cancellations.begin({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      idempotencyKey: 'cancel:active-link',
      fingerprint: '1'.repeat(64),
      expectedStatus: 'running',
      reason: 'operator_cancelled',
    })).resolves.toEqual({ kind: 'pending', operationRunId: operation.id });
  });

  it('does not enumerate a cancellable task through a foreign organization or actor scope', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'foreign-cancellation');
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: owned.operationRunId,
    });

    await expect(cancellations.begin({
      organizationId: OTHER_ORGANIZATION_ID,
      actorId: OTHER_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      idempotencyKey: 'cancel:foreign-org',
      fingerprint: '2'.repeat(64),
      expectedStatus: 'running',
      reason: 'operator_cancelled',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
    await expect(cancellations.begin({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: OTHER_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      idempotencyKey: 'cancel:foreign-actor',
      fingerprint: '3'.repeat(64),
      expectedStatus: 'running',
      reason: 'operator_cancelled',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
  });

  it('durably replays one completed cancellation and rejects idempotency drift', async () => {
    const fixture = await createRootGraph();
    const owned = await createOwnedExecutionOperation(fixture, 'durable-cancellation');
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: owned.operationRunId,
    });
    const command = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      actorId: TEST_USER_ID,
      idempotencyKey: 'cancel:durable',
      fingerprint: 'a'.repeat(64),
      expectedStatus: 'running',
      reason: 'operator_cancelled',
    };

    await expect(cancellations.begin(command)).resolves.toEqual({
      kind: 'pending',
      operationRunId: owned.operationRunId,
    });
    await expect(cancellations.complete({
      organizationId: command.organizationId,
      sessionId: command.sessionId,
      taskId: command.taskId,
      actorId: command.actorId,
      idempotencyKey: command.idempotencyKey,
      fingerprint: command.fingerprint,
      operationRunId: owned.operationRunId,
      status: 'cancelled',
    })).resolves.toEqual({ status: 'cancelled' });
    await prisma!.agentSessionTask.update({
      where: { id: fixture.taskId },
      data: { status: 'cancelled', finishedAt: new Date() },
    });

    const recreated = new PrismaAgentSessionCancellationTransaction(prisma as never);
    await expect(recreated.begin(command)).resolves.toEqual({
      kind: 'completed',
      status: 'cancelled',
    });
    await expect(recreated.begin({
      ...command,
      fingerprint: 'b'.repeat(64),
      reason: 'different_reason',
    })).rejects.toMatchObject({
      code: 'AGENT_SESSION_CANCELLATION_IDEMPOTENCY_CONFLICT',
    });
    await expect(recreated.begin({
      ...command,
      actorId: OTHER_USER_ID,
    })).rejects.toMatchObject({
      code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID',
    });
  });

  it('recovers the true latest lifecycle envelope after more than one bounded batch of historical bindings', async () => {
    const fixture = await createRootGraph();
    const initial = await createOwnedExecutionOperation(fixture, 'latest-envelope');
    const attempt = { id: initial.attemptId };
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: initial.operationRunId,
    });
    await repository.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      runtimeType: 'copilotkit_agui',
      externalRunId: 'runtime-latest-binding',
      encryptedHandleRef: 'vault://runtime-latest-binding',
      runtimeGeneration: 1,
    });

    let predecessorOperationRunId = initial.operationRunId;
    for (let index = 0; index <= 100; index += 1) {
      await prisma!.operationRun.update({
        where: { id: predecessorOperationRunId },
        data: {
          status: 'cancelled',
          errorCode: 'operation_server_lifecycle_expired',
          finishedAt: new Date(),
        },
      });
      const successor = await repository.continueOperationAttempt({
        signal: new AbortController().signal,
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        attemptId: attempt.id,
        predecessorOperationRunId,
        continuationKey: `lifecycle:${predecessorOperationRunId}`,
      });
      predecessorOperationRunId = successor.operationRunId;
    }
    await prisma!.operationRun.update({
      where: { id: predecessorOperationRunId },
      data: {
        status: 'cancelled',
        errorCode: 'operation_server_lifecycle_expired',
        finishedAt: new Date(),
      },
    });

    await expect(repository.listLifecycleRecoveryCandidates({ limit: 100 })).resolves.toEqual([
      {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        attemptId: attempt.id,
        predecessorOperationRunId,
      },
    ]);
  });

  it('creates a queued owned attempt before worker claim so explicit cancellation has an exact Operation run', async () => {
    const fixture = await createRootGraph();
    await prisma!.agentSessionTask.update({
      where: { id: fixture.taskId },
      data: { status: 'queued' },
    });
    const created = await createOwnedExecutionOperation(fixture, 'queued-cancellation');
    const operation = { id: created.operationRunId };
    const reserved = { id: created.attemptId, state: 'queued' };

    expect(reserved.state).toBe('queued');
    await expect(cancellations.begin({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      idempotencyKey: 'cancel:queued-link',
      fingerprint: '4'.repeat(64),
      expectedStatus: 'queued',
      reason: 'operator_cancelled',
    })).resolves.toEqual({ kind: 'pending', operationRunId: operation.id });
    await expect(repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
    })).resolves.toMatchObject({ id: reserved.id, state: 'running' });
  });

  it('binds an approval to one invocation attempt and decides it idempotently', async () => {
    const fixture = await createRootGraph();
    const created = await createOwnedExecutionOperation(fixture, 'approval');
    const operation = { id: created.operationRunId };
    const attempt = { id: created.attemptId };
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
    });
    await expect(repository.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      runtimeType: 'copilotkit_agui',
      externalRunId: 'runtime-approval-1',
      encryptedHandleRef: 'vault://runtime-approval-1',
      runtimeGeneration: 4,
    })).resolves.toMatchObject({ runtimeGeneration: 4 });
    const approval = await repository.requestApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      operationRunId: operation.id,
      capabilityKey: 'supply.submit_purchase_order',
      argumentsHash: 'a'.repeat(64),
      resourceSnapshot: [{ kind: 'purchase_order', id: 'po-1', version: '4' }],
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      idempotencyKey: 'approval:submit:1',
    });
    await expect(repository.requestApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      operationRunId: operation.id,
      capabilityKey: 'supply.submit_purchase_order',
      argumentsHash: 'b'.repeat(64),
      resourceSnapshot: [{ kind: 'purchase_order', id: 'po-1', version: '4' }],
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      idempotencyKey: 'approval:submit:2',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' });
    const decision = await repository.decideApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      approvalId: approval.id,
      expectedState: 'pending',
      decision: 'approved',
      actorType: 'user',
      actorId: TEST_USER_ID,
      idempotencyKey: 'approval-decision:1',
    });
    const detail = await repository.loadApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      approvalId: approval.id,
    });
    expect(detail).toMatchObject({
      runtimeGeneration: 4,
      operationRunId: operation.id,
      operationBindingId: expect.any(String),
    });
    await expect(prisma!.agentSessionApprovalContinuation.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, approvalId: approval.id },
      select: { state: true, successorOperationRunId: true },
    })).resolves.toEqual({ state: 'pending', successorOperationRunId: null });
    await expect(repository.decideApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      approvalId: approval.id,
      expectedState: 'pending',
      decision: 'approved',
      actorType: 'user',
      actorId: TEST_USER_ID,
      idempotencyKey: 'approval-decision:1',
    })).resolves.toEqual({ ...decision, changed: false });
    expect(decision.state).toBe('approved');
    await expect(repository.requestApproval({
      organizationId: OTHER_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      operationRunId: operation.id,
      capabilityKey: 'supply.submit_purchase_order',
      argumentsHash: 'a'.repeat(64),
      resourceSnapshot: [{ kind: 'purchase_order', id: 'po-1', version: '4' }],
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      idempotencyKey: 'approval:submit:1',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
  });

  it('reuses an exact retry after the first retry moves the task back to queued', async () => {
    const fixture = await createRootGraph();
    await repository.transitionTask({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedState: 'running',
      state: 'failed',
    });
    await prisma!.agentExecution.update({
      where: { id: fixture.executionId },
      data: { status: 'failed', finishedAt: new Date('2026-08-14T00:00:00.000Z') },
    });

    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedStatus: 'failed' as const,
      idempotencyKey: 'retry:root:one',
    };
    const first = await repository.createRetryExecution(input);
    const repeated = await repository.createRetryExecution(input);

    expect(repeated).toEqual(first);
    expect(first.taskStatus).toBe('queued');
    await expect(prisma!.agentExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(2);
  });

  it('enforces one-way terminal task and session transitions', async () => {
    const fixture = await createRootGraph();
    await repository.transitionTask({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedState: 'running',
      state: 'completed',
    });
    await expect(repository.transitionTask({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedState: 'completed',
      state: 'running',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' });
    await repository.transitionSession({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      expectedState: 'active',
      state: 'completed',
    });
    await expect(repository.transitionSession({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      expectedState: 'completed',
      state: 'active',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' });

    const archived = await createRootGraph();
    await repository.transitionSession({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: archived.sessionId,
      expectedState: 'active',
      state: 'archived',
    });
    await expect(repository.transitionSession({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: archived.sessionId,
      expectedState: 'archived',
      state: 'active',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' });

    await expect(repository.findTask({
      organizationId: OTHER_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
    })).resolves.toBeNull();
    await expect(repository.findSession({
      organizationId: OTHER_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
    })).resolves.toBeNull();
  });

});

async function seedControlFixture(client: PrismaClient): Promise<void> {
  const baseManifest = {
    schemaVersion: 1,
    runtimeKind: 'agent',
    runtimeType: 'codex_cli',
    modelIdentity: 'gpt-test',
    capabilityKeys: [],
    policyDocument: {},
    delegation: { role: 'leaf', allowedAgentDefinitionKeys: [], maxDepth: 0, maxChildrenPerTask: 0 },
    limits: { maxTurns: 20, maxContextTokens: 8_192, summaryTargetTokens: 512 },
    assets: {
      prompt: { path: 'agent-config/prompts/agents/sourcing.md', sha256: 'a'.repeat(64) },
      summaryPrompt: { path: 'agent-config/prompts/system/session-summary.md', sha256: 'b'.repeat(64) },
      skills: [],
      outputSchema: null,
    },
  };
  await client.agentVersion.createMany({
    data: [
      {
        id: VERSION_FROM,
        agentDefinitionKey: 'manager',
        version: 1,
        displayName: 'Operator',
        description: 'Operator',
        runtimeType: 'copilotkit_agui',
        modelIdentity: 'gpt-test',
        capabilityKeys: [],
        policyDocument: {},
        manifestHash: '1'.repeat(64),
        runtimeManifest: { ...baseManifest, agentDefinitionKey: 'manager', runtimeKind: 'coordinator' },
        activatedAt: new Date('2026-08-14T00:00:00.000Z'),
      },
      {
        id: VERSION_TO,
        agentDefinitionKey: 'sourcing',
        version: 1,
        displayName: 'Sourcing',
        description: 'Sourcing',
        runtimeType: 'codex_cli',
        modelIdentity: 'gpt-test',
        capabilityKeys: ['sourcing.retrieveWorkspaceEvidence'],
        policyDocument: {},
        manifestHash: '2'.repeat(64),
        runtimeManifest: {
          ...baseManifest,
          agentDefinitionKey: 'sourcing',
          capabilityKeys: ['sourcing.retrieveWorkspaceEvidence'],
        },
        activatedAt: new Date('2026-08-14T00:00:00.000Z'),
      },
    ],
  });
  await client.agentAuthorityProfileVersion.createMany({
    data: [
      {
        id: AUTHORITY_VERSION,
        organizationId: TEST_ORGANIZATION_ID,
        profileKey: 'foundation_read_only_probe',
        version: 1,
        capabilityKeys: ['sourcing.retrieveWorkspaceEvidence'],
        policyDocument: { sideEffects: ['read'] },
        policyHash: '3'.repeat(64),
      },
      {
        id: OTHER_AUTHORITY_VERSION,
        organizationId: OTHER_ORGANIZATION_ID,
        profileKey: 'foundation_read_only_probe',
        version: 1,
        capabilityKeys: ['sourcing.retrieveWorkspaceEvidence'],
        policyDocument: { sideEffects: ['read'] },
        policyHash: '4'.repeat(64),
      },
    ],
  });
}

async function createRootGraph(input: {
  organizationId?: string;
  userId?: string;
  authorityProfileVersionId?: string;
} = {}): Promise<{
  sessionId: string;
  taskId: string;
  policyId: string;
  executionId: string;
}> {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  const organizationId = input.organizationId ?? TEST_ORGANIZATION_ID;
  const userId = input.userId ?? TEST_USER_ID;
  const authorityProfileVersionId = input.authorityProfileVersionId ?? AUTHORITY_VERSION;
  const session = await prisma.agentSession.create({
    data: {
      organizationId,
      createdByUserId: userId,
      copilotThreadId: `control-${crypto.randomUUID()}`,
      primaryAgentVersionId: VERSION_FROM,
      authorityProfileVersionId,
      lifecycle: 'active',
    },
  });
  const task = await prisma.agentSessionTask.create({
    data: {
      organizationId,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_FROM,
      isRoot: true,
      status: 'running',
      idempotencyKey: 'root',
    },
  });
  const policy = await prisma.agentPolicySnapshot.create({
    data: {
      organizationId,
      sessionId: session.id,
      agentVersionId: VERSION_FROM,
      authorityProfileVersionId,
      capabilityKeys: ['sourcing.retrieveWorkspaceEvidence'],
      policyHash: '5'.repeat(64),
    },
  });
  const userEvent = {
    externalEventId: `user-event:${crypto.randomUUID()}`,
    schemaVersion: 1,
    payload: {
      phase: 'complete',
      messageId: `message-${crypto.randomUUID()}`,
      content: 'canonical root request',
    },
  };
  const currentInput = { userEvent };
  const execution = await prisma.agentExecution.create({
    data: {
      organizationId,
      sessionId: session.id,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: `run-${crypto.randomUUID()}`,
      agentVersionId: VERSION_FROM,
      runtimeType: 'copilotkit_agui',
      modelIdentity: 'gpt-test',
      policySnapshotId: policy.id,
      inputHash: createHash('sha256')
        .update(canonicalJson(currentInput))
        .digest('hex'),
      currentInput,
      resourceRefs: [],
      status: 'running',
    },
  });
  await prisma.agentConversationEvent.create({
    data: {
      organizationId,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: userEvent.externalEventId,
      sequence: 1n,
      eventType: 'user_message',
      schemaVersion: userEvent.schemaVersion,
      payload: userEvent.payload,
    },
  });
  await prisma.agentSession.update({
    where: { id: session.id },
    data: { lastEventSequence: 1n },
  });
  return { sessionId: session.id, taskId: task.id, policyId: policy.id, executionId: execution.id };
}

async function createOwnedExecutionOperation(
  fixture: { sessionId: string; taskId: string; executionId: string },
  suffix: string,
): Promise<{ operationRunId: string; attemptId: string }> {
  return ownedOperations.createExecutionRun({
    signal: new AbortController().signal,
    organizationId: TEST_ORGANIZATION_ID,
    sessionId: fixture.sessionId,
    taskId: fixture.taskId,
    executionId: fixture.executionId,
    requestedByUserId: TEST_USER_ID,
    idempotencyKey: `session-execution:${suffix}:${fixture.executionId}`,
    definition: sessionTaskDefinition,
    parsedInput: { execution: fixture.executionId },
  });
}

async function createUnownedContinuationPredecessor(
  fixture: { sessionId: string; taskId: string; executionId: string },
): Promise<{ operationRunId: string; attemptId: string }> {
  const operation = await prisma!.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: sessionTaskDefinition.key,
      definitionVersion: sessionTaskDefinition.version,
      ownerDomain: sessionTaskDefinition.ownerDomain,
      title: sessionTaskDefinition.title,
      engineType: sessionTaskDefinition.engineType,
      resourceClass: sessionTaskDefinition.resourceClass,
      executionTimeoutMs: sessionTaskDefinition.executionTimeoutMs,
      status: 'attention_required',
      triggerSource: 'agent',
      requestedByUserId: TEST_USER_ID,
      input: { execution: fixture.executionId },
      maxAttempts: sessionTaskDefinition.maxAttempts,
    },
  });
  const attempt = await prisma!.agentExecutionAttempt.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptNumber: 1,
      idempotencyKey: `unowned-continuation:${fixture.executionId}`,
      runtimeType: 'copilotkit_agui',
      externalRunId: 'unowned-continuation-runtime',
      encryptedHandleRef: 'vault://unowned-continuation-runtime',
      runtimeGeneration: 1,
      state: 'running',
    },
  });
  await prisma!.agentExecutionAttemptOperationBinding.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      executionAttemptId: attempt.id,
      executionId: fixture.executionId,
      sessionId: fixture.sessionId,
      operationRunId: operation.id,
      continuationKey: `initial:${operation.id}`,
    },
  });
  return { operationRunId: operation.id, attemptId: attempt.id };
}

async function createOwnedChildOperation(
  fixture: { sessionId: string; taskId: string; executionId: string },
  parentRunId: string,
  suffix: string,
) {
  const operation = await prisma!.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: sessionTaskDefinition.key,
      definitionVersion: sessionTaskDefinition.version,
      ownerDomain: sessionTaskDefinition.ownerDomain,
      title: sessionTaskDefinition.title,
      engineType: sessionTaskDefinition.engineType,
      resourceClass: sessionTaskDefinition.resourceClass,
      executionTimeoutMs: sessionTaskDefinition.executionTimeoutMs,
      status: 'queued',
      triggerSource: 'agent',
      requestedByUserId: TEST_USER_ID,
      parentRunId,
      idempotencyKey: `deletion-closure:${suffix}:${fixture.executionId}`,
      input: { execution: fixture.executionId },
      maxAttempts: sessionTaskDefinition.maxAttempts,
    },
  });
  await prisma!.agentSessionOperationRunOwnership.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      operationRunId: operation.id,
    },
  });
  return operation;
}

async function startDeletionExecution(sessionId: string): Promise<{
  operationRunId: string;
  attemptToken: string;
}> {
  const session = formatAgentSessionName(
    OrganizationIdSchema.parse(TEST_ORGANIZATION_ID),
    AgentSessionIdSchema.parse(sessionId),
  );
  await deletionCommands.begin(deletionInput(session));
  const deletion = await prisma!.operationRun.findFirstOrThrow({
    where: { organizationId: TEST_ORGANIZATION_ID, operationKey: AGENT_SESSION_DELETE_OPERATION_KEY },
    select: { id: true },
  });
  const attemptToken = crypto.randomUUID();
  await prisma!.operationRun.update({
    where: { id: deletion.id },
    data: { status: 'running', attempts: 2, attemptToken },
  });
  return { operationRunId: deletion.id, attemptToken };
}

function deletionInput(
  session: string,
  organizationId = TEST_ORGANIZATION_ID,
  actorUserId = TEST_USER_ID,
) {
  return {
    organizationId,
    actorUserId,
    session: session as never,
    signal: new AbortController().signal,
    definition: AGENT_SESSION_DELETE_OPERATION,
    parsedInput: { session, retryGeneration: 1 },
  };
}

function deletionRetryInput(
  session: string,
  organizationId = TEST_ORGANIZATION_ID,
  actorUserId = TEST_USER_ID,
) {
  return {
    organizationId,
    actorUserId,
    session: session as never,
    signal: new AbortController().signal,
    definition: AGENT_SESSION_DELETE_OPERATION,
  };
}

function deletionOperationRun(input: {
  idempotencyKey: string;
  attempts: number;
}) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    operationKey: AGENT_SESSION_DELETE_OPERATION_KEY,
    definitionVersion: AGENT_SESSION_DELETE_OPERATION.version,
    ownerDomain: AGENT_SESSION_DELETE_OPERATION.ownerDomain,
    title: AGENT_SESSION_DELETE_OPERATION.title,
    engineType: AGENT_SESSION_DELETE_OPERATION.engineType,
    resourceClass: AGENT_SESSION_DELETE_OPERATION.resourceClass,
    executionTimeoutMs: AGENT_SESSION_DELETE_OPERATION.executionTimeoutMs,
    status: 'failed',
    triggerSource: 'system',
    requestedByUserId: TEST_USER_ID,
    idempotencyKey: input.idempotencyKey,
    input: { session: 'test', retryGeneration: 1 },
    attempts: input.attempts,
    maxAttempts: AGENT_SESSION_DELETE_OPERATION.maxAttempts,
    finishedAt: new Date(),
  };
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    .join(',')}}`;
}

async function markDeleting(sessionId: string): Promise<void> {
  await prisma!.agentSession.update({
    where: { id: sessionId },
    data: { lifecycle: 'deleting' },
  });
}
