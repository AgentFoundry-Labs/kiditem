import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { PrismaAgentSessionDeletionExecutionTransaction } from '../adapter/out/transaction/session-deletion/prisma-agent-session-deletion-execution.transaction';
import { PrismaAgentSessionDeletionFinalizationTransaction } from '../adapter/out/transaction/session-deletion/prisma-agent-session-deletion-finalization.transaction';
import { AgentSessionDeletionExecutionService } from '../application/service/session-execution/agent-session-deletion-execution.service';

const VERSION_ID = '00000000-0000-4000-8000-000000000101';
const AUTHORITY_VERSION_ID = '00000000-0000-4000-8000-000000000102';
const DELETE_ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000103';

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedSessionDependencies(prisma);
});

describe('AgentSession deletion graph finalization (PostgreSQL)', () => {
  it('records graph_deleted while deleting the graph in FK-safe task child-before-parent order', async () => {
    const fixture = await createFencedDeletionFixture();
    const execution = new PrismaAgentSessionDeletionExecutionTransaction(prisma as never);
    const snapshot = await execution.loadFencedSnapshot(fixture.attempt);
    expect(snapshot).toMatchObject({ kind: 'ready' });
    if (snapshot.kind !== 'ready') throw new Error('expected fenced deletion snapshot');

    await execution.deleteGraphAndCheckpoint({
      ...fixture.attempt,
      fencedClosureDigest: snapshot.snapshot.closureDigest,
    });

    await expect(prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } })).resolves.toBeNull();
    await expect(Promise.all([
      prisma!.agentSessionTask.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentExecution.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentExecutionAttempt.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentConversationEvent.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentConversationOutbox.count({ where: { event: { is: { sessionId: fixture.sessionId } } } }),
      prisma!.agentSessionApproval.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentSessionApprovalContinuation.count({
        where: { approval: { is: { sessionId: fixture.sessionId } } },
      }),
      prisma!.agentSessionArtifact.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentSessionArtifactMaterialization.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentExecutionUsage.count({ where: { execution: { is: { sessionId: fixture.sessionId } } } }),
      prisma!.agentExecutionAttemptOperationBinding.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.agentSessionOperationRunOwnership.count({ where: { sessionId: fixture.sessionId } }),
    ])).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(prisma!.operationRunCheckpoint.findFirst({
      where: { operationRunId: fixture.deletionRunId, kind: 'graph_deleted' },
      select: { state: true },
    })).resolves.toMatchObject({
      state: {
        sessionId: fixture.sessionId,
        retryGeneration: 1,
        closureDigest: snapshot.snapshot.closureDigest,
      },
    });
  });

  it('purges graph_deleted lineage after a crash without recreating the session', async () => {
    const fixture = await createFencedDeletionFixture();
    const execution = new PrismaAgentSessionDeletionExecutionTransaction(prisma as never);
    const snapshot = await execution.loadFencedSnapshot(fixture.attempt);
    if (snapshot.kind !== 'ready') throw new Error('expected fenced deletion snapshot');
    await execution.deleteGraphAndCheckpoint({
      ...fixture.attempt,
      fencedClosureDigest: snapshot.snapshot.closureDigest,
    });

    const finalization = new PrismaAgentSessionDeletionFinalizationTransaction(prisma as never);
    await finalization.purgeGraphDeletedLineage({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      currentOperationRunId: fixture.deletionRunId,
      expectedAttemptToken: DELETE_ATTEMPT_TOKEN,
    });

    await expect(Promise.all([
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
      prisma!.agentSessionDeletionOperationBinding.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.operationRun.findUnique({ where: { id: fixture.deletionRunId } }),
    ])).resolves.toEqual([null, 0, null]);
  });

  it('reconciles a lost graph commit acknowledgement and purges in the same lifecycle', async () => {
    const fixture = await createFencedDeletionFixture();
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(prisma as never);
    const finalization = new PrismaAgentSessionDeletionFinalizationTransaction(prisma as never);
    let reconciliationReads = 0;
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: transactions.loadFencedSnapshot.bind(transactions),
        terminalizeOwnedRun: transactions.terminalizeOwnedRun.bind(transactions),
        deleteGraphAndCheckpoint: async (input) => {
          await transactions.deleteGraphAndCheckpoint(input);
          throw new Error('commit_ack_lost');
        },
        hasGraphDeletedCheckpoint: async (input) => {
          reconciliationReads += 1;
          if (reconciliationReads === 1) throw new Error('transient_checkpoint_read');
          return transactions.hasGraphDeletedCheckpoint(input);
        },
      } as never,
      { fenceAndCancel: vi.fn().mockResolvedValue({ state: 'fenced' }) } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn().mockResolvedValue(undefined),
        confirmFenced: vi.fn().mockResolvedValue({ state: 'fenced' }),
      } as never,
      { abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: 'erased' }) } as never,
    );

    await expect(service.execute({
      ...fixture.attempt,
      enterEphemeralFinalization: vi.fn().mockResolvedValue({ signal: fixture.attempt.signal }),
    })).resolves.toEqual({ kind: 'completed' });
    expect(reconciliationReads).toBe(2);

    await finalization.purgeGraphDeletedLineage({
      signal: fixture.attempt.signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      currentOperationRunId: fixture.deletionRunId,
      expectedAttemptToken: DELETE_ATTEMPT_TOKEN,
    });
    await expect(Promise.all([
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
      prisma!.agentSessionDeletionOperationBinding.count({ where: { sessionId: fixture.sessionId } }),
      prisma!.operationRun.findUnique({ where: { id: fixture.deletionRunId } }),
    ])).resolves.toEqual([null, 0, null]);
  });

  it('marks the canonical session delete_failed with only an allowlisted exhaustion code', async () => {
    const fixture = await createFencedDeletionFixture();
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(prisma as never);

    await transactions.markDeleteFailed({
      ...fixture.attempt,
      failureCode: 'STORAGE_DELETE_UNKNOWN',
    });

    await expect(Promise.all([
      prisma!.agentSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
        select: { lifecycle: true, deletionFailureCode: true },
      }),
      prisma!.operationRun.findUniqueOrThrow({
        where: { id: fixture.deletionRunId }, select: { status: true, errorCode: true },
      }),
    ])).resolves.toEqual([
      { lifecycle: 'delete_failed', deletionFailureCode: 'STORAGE_DELETE_UNKNOWN' },
      { status: 'failed', errorCode: 'STORAGE_DELETE_UNKNOWN' },
    ]);
  });

  it('never creates a sixth cumulative attempt across lifecycle successors', async () => {
    const fixture = await createFencedDeletionFixture();
    const finalization = new PrismaAgentSessionDeletionFinalizationTransaction(prisma as never);
    await prisma!.operationRun.update({
      where: { id: fixture.deletionRunId },
      data: {
        status: 'cancelled', attempts: 1,
        errorCode: 'operation_server_lifecycle_expired', finishedAt: new Date(), attemptToken: null,
      },
    });

    for (let restart = 0; restart < 4; restart += 1) {
      const [candidate] = await finalization.listInterruptedDeletions({ limit: 100 });
      expect(candidate).toMatchObject({ sessionId: fixture.sessionId, consumedAttempts: restart + 1 });
      await expect(finalization.continueInterruptedDeletion(candidate!)).resolves.toBe('continued');
      const session = await prisma!.agentSession.findUniqueOrThrow({
        where: { id: fixture.sessionId }, select: { deletionOperationRunId: true },
      });
      await prisma!.operationRun.update({
        where: { id: session.deletionOperationRunId! },
        data: {
          status: 'cancelled', attempts: 1,
          errorCode: 'operation_server_lifecycle_expired', finishedAt: new Date(), attemptToken: null,
        },
      });
    }
    const [exhausted] = await finalization.listInterruptedDeletions({ limit: 100 });
    expect(exhausted).toMatchObject({ sessionId: fixture.sessionId, consumedAttempts: 5 });
    await expect(finalization.continueInterruptedDeletion(exhausted!)).resolves.toBe('failed');
    await expect(prisma!.agentSession.findUniqueOrThrow({
      where: { id: fixture.sessionId }, select: { lifecycle: true },
    })).resolves.toEqual({ lifecycle: 'delete_failed' });
  });

  it('fails closed for a scheduled cross-owner operation and preserves unrelated data', async () => {
    const fixture = await createFencedDeletionFixture();
    const schedule = await prisma!.operationSchedule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.cross-owner',
        cronExpression: '* * * * *',
        input: {},
      },
    });
    const unrelated = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'unrelated', definitionVersion: 1, ownerDomain: 'test', title: 'unrelated',
        engineType: 'agent_os', resourceClass: 'default', executionTimeoutMs: 1,
        status: 'completed', triggerSource: 'system', input: {},
      },
    });
    await prisma!.operationRun.update({
      where: { id: fixture.ownedRunId }, data: { scheduleId: schedule.id },
    });
    const transactions = new PrismaAgentSessionDeletionExecutionTransaction(prisma as never);

    await expect(transactions.loadFencedSnapshot(fixture.attempt)).resolves.toMatchObject({
      kind: 'retryable', code: 'SESSION_OPERATION_OWNERSHIP_INVALID',
    });
    await expect(Promise.all([
      prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } }),
      prisma!.operationRun.findUnique({ where: { id: unrelated.id } }),
    ])).resolves.toEqual([expect.any(Object), expect.any(Object)]);
  });
});

async function seedSessionDependencies(client: PrismaClient): Promise<void> {
  await client.agentVersion.create({
    data: {
      id: VERSION_ID,
      agentDefinitionKey: 'deletion-test-agent',
      version: 1,
      displayName: 'Deletion test agent',
      description: 'Deletion test agent',
      runtimeType: 'codex_cli',
      modelIdentity: 'test-model',
      capabilityKeys: [],
      policyDocument: {},
      manifestHash: 'a'.repeat(64),
      runtimeManifest: {
        schemaVersion: 1,
        agentDefinitionKey: 'deletion-test-agent',
        runtimeKind: 'agent',
        runtimeType: 'codex_cli',
        modelIdentity: 'test-model',
        capabilityKeys: [],
        policyDocument: {},
        delegation: { role: 'leaf', allowedAgentDefinitionKeys: [], maxDepth: 0, maxChildrenPerTask: 0 },
        limits: { maxTurns: 1, maxContextTokens: 1, summaryTargetTokens: 1 },
        assets: {
          prompt: { path: 'test', sha256: 'b'.repeat(64) },
          summaryPrompt: { path: 'test', sha256: 'c'.repeat(64) },
          skills: [], outputSchema: null,
        },
      },
      activatedAt: new Date(),
    },
  });
  await client.agentAuthorityProfileVersion.create({
    data: {
      id: AUTHORITY_VERSION_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: 'deletion-test',
      version: 1,
      capabilityKeys: [],
      policyDocument: {},
      policyHash: 'd'.repeat(64),
    },
  });
}

async function createFencedDeletionFixture(): Promise<{
  sessionId: string;
  deletionRunId: string;
  ownedRunId: string;
  attempt: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    operationRunId: string;
    attemptToken: string;
  };
}> {
  const client = prisma!;
  const session = await client.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: `deletion-${randomUUID()}`,
      primaryAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      lifecycle: 'active',
    },
  });
  const root = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_ID,
      isRoot: true,
      status: 'completed',
      idempotencyKey: 'root',
    },
  });
  const child = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: root.id,
      assignedAgentVersionId: VERSION_ID,
      status: 'completed',
      idempotencyKey: 'child',
    },
  });
  const grandchild = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: child.id,
      assignedAgentVersionId: VERSION_ID,
      status: 'completed',
      idempotencyKey: 'grandchild',
    },
  });
  await client.agentSessionTaskDelegation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: root.id,
      childTaskId: child.id,
      fromAgentVersionId: VERSION_ID,
      toAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      authoritySubset: {},
      depth: 1,
      idempotencyKey: 'root-child',
      state: 'completed',
    },
  });
  await client.agentSessionTaskDelegation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      parentTaskId: child.id,
      childTaskId: grandchild.id,
      fromAgentVersionId: VERSION_ID,
      toAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      authoritySubset: {},
      depth: 2,
      idempotencyKey: 'child-grandchild',
      state: 'completed',
    },
  });
  const policy = await client.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_VERSION_ID,
      capabilityKeys: [],
      policyHash: 'e'.repeat(64),
    },
  });
  const execution = await client.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: grandchild.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: `run-${randomUUID()}`,
      agentVersionId: VERSION_ID,
      runtimeType: 'codex_cli',
      modelIdentity: 'test-model',
      policySnapshotId: policy.id,
      inputHash: createHash('sha256').update(session.id).digest('hex'),
      currentInput: {},
      resourceRefs: [],
      status: 'completed',
    },
  });
  const attempt = await client.agentExecutionAttempt.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      attemptNumber: 1,
      idempotencyKey: 'attempt',
      runtimeType: 'codex_cli',
      state: 'succeeded',
    },
  });
  await client.agentExecutionUsage.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      executionId: execution.id,
      modelIdentity: 'test-model',
      provider: 'test',
      inputTokens: 1,
      outputTokens: 1,
      costMicros: 1n,
    },
  });
  const ownedRun = await createTerminalRun(client, session.id, 'owned');
  const artifactRun = await createTerminalRun(client, session.id, 'artifact');
  await client.agentExecutionAttemptOperationBinding.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      executionAttemptId: attempt.id,
      executionId: execution.id,
      sessionId: session.id,
      operationRunId: ownedRun.id,
      continuationKey: 'initial',
    },
  });
  const approval = await client.agentSessionApproval.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      taskId: grandchild.id,
      executionId: execution.id,
      attemptId: attempt.id,
      operationBindingId: (await client.agentExecutionAttemptOperationBinding.findFirstOrThrow({
        where: { operationRunId: ownedRun.id }, select: { id: true },
      })).id,
      predecessorOperationRunId: ownedRun.id,
      capabilityKey: 'test.capability',
      argumentsHash: '1'.repeat(64),
      resourceSnapshot: {},
      state: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: 'approval',
    },
  });
  await client.agentSessionApprovalContinuation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      approvalId: approval.id,
      state: 'pending',
    },
  });
  const artifact = await client.agentSessionArtifact.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      taskId: grandchild.id,
      executionId: execution.id,
      artifactType: 'test',
      materializationOperationRunId: artifactRun.id,
      sha256: 'f'.repeat(64),
      lifecycle: 'materializing',
      idempotencyKey: 'artifact',
    },
  });
  await client.agentSessionArtifactMaterialization.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      artifactId: artifact.id,
      materializationOperationRunId: artifactRun.id,
      providerUploadId: 'upload',
    },
  });
  const event = await client.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: `event-${randomUUID()}`,
      sequence: 1n,
      eventType: 'test',
      schemaVersion: 1,
      payload: {},
    },
  });
  await client.agentConversationOutbox.create({
    data: { organizationId: TEST_ORGANIZATION_ID, eventId: event.id },
  });
  const deletionRun = await client.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'agent-os.delete-session',
      definitionVersion: 1,
      ownerDomain: 'agent-os',
      title: 'Delete session',
      engineType: 'agent_os',
      resourceClass: 'default',
      executionTimeoutMs: 1,
      status: 'running',
      triggerSource: 'system',
      requestedByUserId: TEST_USER_ID,
      input: {},
      attempts: 1,
      maxAttempts: 5,
      attemptToken: DELETE_ATTEMPT_TOKEN,
    },
  });
  await client.agentSessionDeletionOperationBinding.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionCreatorUserId: TEST_USER_ID,
      deletionRequestedByUserId: TEST_USER_ID,
      retryGeneration: 1,
      operationRunId: deletionRun.id,
    },
  });
  await client.agentSession.update({
    where: { id: session.id },
    data: { lifecycle: 'deleting', deletionOperationRunId: deletionRun.id },
  });
  return {
    sessionId: session.id,
    deletionRunId: deletionRun.id,
    ownedRunId: ownedRun.id,
    attempt: {
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      operationRunId: deletionRun.id,
      attemptToken: DELETE_ATTEMPT_TOKEN,
    },
  };
}

async function createTerminalRun(
  client: PrismaClient,
  sessionId: string,
  suffix: string,
) {
  const run = await client.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: `agent-os.test-${suffix}`,
      definitionVersion: 1,
      ownerDomain: 'agent-os',
      title: suffix,
      engineType: 'agent_os',
      resourceClass: 'default',
      executionTimeoutMs: 1,
      status: 'cancelled',
      triggerSource: 'agent',
      input: {},
    },
  });
  await client.agentSessionOperationRunOwnership.create({
    data: { organizationId: TEST_ORGANIZATION_ID, sessionId, operationRunId: run.id },
  });
  return run;
}
