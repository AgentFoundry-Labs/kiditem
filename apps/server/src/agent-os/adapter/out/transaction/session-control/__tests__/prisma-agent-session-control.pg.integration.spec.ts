import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaAgentSessionLifecycleTransaction } from '../../interaction/prisma-agent-session-lifecycle.transaction';
import { PrismaAgentSessionLifecycleMaintenanceTransaction } from '../../interaction/prisma-agent-session-lifecycle-maintenance.transaction';
import { AgentSessionLifecycleMaintenanceService } from '../../../../../application/service/interaction/agent-session-lifecycle-maintenance.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../../test-helpers/real-prisma';
import { PrismaAgentExecutionContextRepository } from '../../../repository/prisma-agent-execution-context.repository';
import { SessionControlAdapterSet } from './session-control-adapter-set';
import { Prisma, type PrismaClient } from '@prisma/client';

const VERSION_FROM = '20000000-0000-4000-8000-000000000001';
const VERSION_TO = '20000000-0000-4000-8000-000000000002';
const AUTHORITY_VERSION = '20000000-0000-4000-8000-000000000003';
const OTHER_AUTHORITY_VERSION = '20000000-0000-4000-8000-000000000004';

let prisma: PrismaClient | null = null;
let repository: SessionControlAdapterSet;

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
});

describe('Prisma Agent session-control transaction seams', () => {
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
    const operation = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.execute-session-task',
        definitionVersion: 1,
        ownerDomain: 'agent-os',
        title: 'Execute agent task',
        engineType: 'agent_os',
        triggerSource: 'agent',
        input: {},
      },
    });
    const reserved = await repository.reserveAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
      idempotencyKey: `operation:${operation.id}`,
    });
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
    await expect(repository.loadCancelableTask({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedStatus: 'running',
    })).resolves.toEqual(expect.objectContaining({ operationRunId: operation.id }));
  });

  it('recovers the true latest lifecycle envelope after more than one bounded batch of historical bindings', async () => {
    const fixture = await createRootGraph();
    const initial = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.execute-session-task',
        definitionVersion: 1,
        ownerDomain: 'agent-os',
        title: 'Recover latest immutable envelope',
        engineType: 'agent_os',
        triggerSource: 'agent',
        input: {},
      },
    });
    const attempt = await repository.reserveAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      operationRunId: initial.id,
      idempotencyKey: `operation:${initial.id}`,
    });
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: initial.id,
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

    let predecessorOperationRunId = initial.id;
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

  it('reserves a queued attempt before worker claim so explicit queued cancellation has an exact Operation run', async () => {
    const fixture = await createRootGraph();
    await prisma!.agentSessionTask.update({
      where: { id: fixture.taskId },
      data: { status: 'queued' },
    });
    const operation = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.execute-session-task',
        definitionVersion: 1,
        ownerDomain: 'agent-os',
        title: 'Execute queued agent task',
        engineType: 'agent_os',
        triggerSource: 'agent',
        input: {},
      },
    });

    const reserved = await repository.reserveAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
      idempotencyKey: `operation:${operation.id}`,
    });

    expect(reserved.state).toBe('queued');
    await expect(repository.loadCancelableTask({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedStatus: 'queued',
    })).resolves.toEqual(expect.objectContaining({ operationRunId: operation.id }));
    await expect(repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
    })).resolves.toMatchObject({ id: reserved.id, state: 'running' });
  });

  it('binds an approval to one invocation attempt and decides it idempotently', async () => {
    const fixture = await createRootGraph();
    const operation = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.execute-session-task',
        definitionVersion: 1,
        ownerDomain: 'agent-os',
        title: 'Execute approved agent task',
        engineType: 'agent_os',
        triggerSource: 'agent',
        input: {},
      },
    });
    const attempt = await repository.reserveAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
      idempotencyKey: `operation:${operation.id}`,
    });
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

  it('appends an artifact with task/execution ownership and immutable hash', async () => {
    const fixture = await createRootGraph();
    const artifact = await repository.appendArtifact({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      artifactType: 'report',
      storageReference: 'artifact-store://reports/one',
      sha256: 'b'.repeat(64),
      metadata: { navigationActionId: 'sourcing.openRecommendationRun' },
      idempotencyKey: 'artifact:report:1',
    });
    expect((await repository.appendArtifact({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      artifactType: 'report',
      storageReference: 'artifact-store://reports/one',
      sha256: 'b'.repeat(64),
      metadata: { navigationActionId: 'sourcing.openRecommendationRun' },
      idempotencyKey: 'artifact:report:1',
    }))).toEqual(artifact);
    await expect(repository.appendArtifact({
      organizationId: OTHER_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      artifactType: 'report',
      storageReference: 'artifact-store://reports/one',
      sha256: 'b'.repeat(64),
      metadata: { navigationActionId: 'sourcing.openRecommendationRun' },
      idempotencyKey: 'artifact:report:1',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
    await expect(repository.appendArtifact({
      organizationId: OTHER_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      artifactType: 'report',
      storageReference: 'artifact-store://reports/two',
      sha256: 'c'.repeat(64),
      metadata: {},
      idempotencyKey: 'artifact:report:2',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
  });

  it('enforces the exact task/execution ownership tuple in PostgreSQL', async () => {
    const fixture = await createRootGraph();
    const unrelatedTask = await prisma!.agentSessionTask.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        parentTaskId: fixture.taskId,
        assignedAgentVersionId: VERSION_TO,
        objective: 'unrelated child',
        isRoot: false,
        status: 'queued',
        idempotencyKey: 'unrelated:child',
      },
    });

    await expect(prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: unrelatedTask.id,
        executionId: fixture.executionId,
        artifactType: 'report',
        storageReference: 'artifact-store://reports/mismatched-task',
        sha256: 'd'.repeat(64),
        metadata: {},
        idempotencyKey: 'artifact:mismatched-task:1',
      },
    })).rejects.toMatchObject({ code: 'P2003' });
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

  it('returns the archive result for an exact retry after the session becomes archived', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      actorId: TEST_USER_ID,
      reason: 'Archive the completed interaction',
      idempotencyKey: 'archive-session-key-01',
      terminalAt: new Date('2026-08-13T00:00:00.000Z'),
    };

    const first = await lifecycle.archiveSession(input);
    const retry = await lifecycle.archiveSession(input);

    expect(retry).toEqual(first);
    expect(first.retentionDueAt.toISOString()).toBe('2027-08-13T00:00:00.000Z');
  });

  it('sets retention due at in the same terminal session transition', async () => {
    const fixture = await createRootGraph();
    await repository.transitionSession({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      expectedState: 'active',
      state: 'completed',
    });

    await expect(prisma!.agentSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
      select: { completedAt: true, retentionDueAt: true },
    })).resolves.toMatchObject({
      completedAt: expect.any(Date),
      retentionDueAt: expect.any(Date),
    });
  });

  it('deletes due completed and cancelled sessions without rewriting their retention deadline', async () => {
    const dueAt = new Date('2026-08-13T00:00:00.000Z');
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);

    for (const terminalLifecycle of ['completed', 'cancelled'] as const) {
      const fixture = await createRootGraph();
      await repository.transitionSession({
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        expectedState: 'active',
        state: terminalLifecycle,
      });
      await prisma!.agentSession.update({
        where: { id: fixture.sessionId },
        data: { retentionDueAt: dueAt },
      });
      await expect(prisma!.agentSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
        select: { lifecycle: true, retentionDueAt: true },
      })).resolves.toEqual({ lifecycle: terminalLifecycle, retentionDueAt: dueAt });

      const input = lifecycleDeleteInput(fixture.sessionId, terminalLifecycle);
      const first = await lifecycle.deleteSession(input);
      await expect(lifecycle.deleteSession(input)).resolves.toEqual(first);
      await expect(prisma!.agentSession.findUnique({
        where: { id: fixture.sessionId },
      })).resolves.toBeNull();
    }
  });

  it('blocks deletion under legal hold for every terminal lifecycle', async () => {
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);

    for (const terminalLifecycle of ['completed', 'cancelled', 'archived'] as const) {
      const fixture = await createRootGraph();
      await prisma!.agentSession.update({
        where: { id: fixture.sessionId },
        data: {
          lifecycle: terminalLifecycle,
          legalHoldAt: new Date('2026-08-13T00:00:00.000Z'),
          legalHoldReason: 'preserve for legal inquiry',
          retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
        },
      });

      await expect(lifecycle.deleteSession(
        lifecycleDeleteInput(fixture.sessionId, `held-${terminalLifecycle}`),
      )).rejects.toMatchObject({ code: 'THREAD_LEGAL_HOLD' });
      await expect(prisma!.agentSession.findUnique({
        where: { id: fixture.sessionId },
      })).resolves.not.toBeNull();
    }
  });

  it('deletes a due archived session atomically, leaves a content-free tombstone, and accepts the exact retry', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        archivedAt: new Date('2026-08-13T00:00:00.000Z'),
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });
    const input = lifecycleDeleteInput(fixture.sessionId);

    const first = await lifecycle.deleteSession(input);
    const retry = await lifecycle.deleteSession(input);

    expect(retry).toEqual(first);
    await expect(prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } })).resolves.toBeNull();
    await expect(prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
    await expect(prisma!.agentConversationOutbox.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(prisma!.agentSessionTombstone.findFirstOrThrow({
      where: { idempotencyKeyHash: input.tombstone.idempotencyKeyHash.hash },
    })).resolves.toMatchObject({
      organizationIdHash: input.tombstone.organizationIdHash.hash,
      copilotThreadIdHash: input.tombstone.copilotThreadIdHash.hash,
      terminalLifecycle: 'deleted',
      deletionReasonCode: 'user_requested',
    });
    const tombstone = await prisma!.agentSessionTombstone.findFirstOrThrow({
      where: { idempotencyKeyHash: input.tombstone.idempotencyKeyHash.hash },
    });
    expect(Object.keys(tombstone).sort()).toEqual([
      'copilotThreadIdHash',
      'deletedAt',
      'deletionReasonCode',
      'hashKeyVersion',
      'id',
      'idempotencyKeyHash',
      'legalPolicyVersion',
      'organizationIdHash',
      'requestFingerprintHash',
      'terminalLifecycle',
    ]);
    await expect(prisma!.agentSessionLifecycleRequest.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    await expect(lifecycle.deleteSession({
      ...input,
      tombstone: {
        ...input.tombstone,
        requestFingerprintHash: { hash: `e${'0'.repeat(63)}`, hashKeyVersion: 'v1' },
      },
    })).rejects.toMatchObject({ code: 'THREAD_LIFECYCLE_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects a held session without removing canonical rows and fences the organization', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        legalHoldAt: new Date('2026-08-13T00:00:00.000Z'),
        legalHoldReason: 'preserve for legal inquiry',
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });

    await expect(lifecycle.deleteSession(lifecycleDeleteInput(fixture.sessionId))).rejects.toMatchObject({
      code: 'THREAD_LEGAL_HOLD',
    });
    await expect(lifecycle.readSession({
      organizationId: OTHER_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
    })).resolves.toBeNull();
    await expect(lifecycle.deleteSession({
      ...lifecycleDeleteInput(fixture.sessionId),
      organizationId: OTHER_ORGANIZATION_ID,
    })).rejects.toMatchObject({ code: 'THREAD_LIFECYCLE_SCOPE_INVALID' });
    await expect(prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(1);
  });

  it('does not delete canonical rows when the established idempotency receipt has a different fingerprint', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const input = lifecycleDeleteInput(fixture.sessionId);
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });
    await prisma!.agentSessionTombstone.create({
      data: {
        organizationIdHash: `f${'0'.repeat(63)}`,
        copilotThreadIdHash: input.tombstone.copilotThreadIdHash.hash,
        idempotencyKeyHash: input.tombstone.idempotencyKeyHash.hash,
        requestFingerprintHash: `h${'0'.repeat(63)}`,
        hashKeyVersion: 'v1',
        terminalLifecycle: 'deleted',
        deletionReasonCode: 'user_requested',
        deletedAt: new Date('2026-08-13T00:00:00.000Z'),
        legalPolicyVersion: 'kr-default-365-v1',
      },
    });

    await expect(lifecycle.deleteSession(input)).rejects.toMatchObject({
      code: 'THREAD_LIFECYCLE_IDEMPOTENCY_CONFLICT',
    });
    await expect(prisma!.agentSession.findUnique({ where: { id: fixture.sessionId } })).resolves.not.toBeNull();
    await expect(prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(1);
    await expect(prisma!.agentSessionLifecycleRequest.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
  });

  it('allows independent organizations and a later same-organization session to delete the same Copilot thread hash', async () => {
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const first = await createRootGraph();
    const firstSession = await prisma!.agentSession.findUniqueOrThrow({
      where: { id: first.sessionId },
      select: { copilotThreadId: true },
    });
    await markDueArchived(first.sessionId);

    const sharedThreadHash = {
      hash: createHash('sha256').update('shared-copilot-thread').digest('hex'),
      hashKeyVersion: 'v1',
    };
    await lifecycle.deleteSession({
      ...lifecycleDeleteInput(first.sessionId, 'same-thread-first'),
      tombstone: {
        ...lifecycleDeleteInput(first.sessionId, 'same-thread-first').tombstone,
        copilotThreadIdHash: sharedThreadHash,
      },
    });

    const crossOrganization = await prisma!.agentSession.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        createdByUserId: 'e2345678-9abc-4def-8012-3456789abcde',
        copilotThreadId: firstSession.copilotThreadId,
        primaryAgentVersionId: VERSION_FROM,
        authorityProfileVersionId: OTHER_AUTHORITY_VERSION,
        lifecycle: 'archived',
        archivedAt: new Date('2026-08-13T00:00:00.000Z'),
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });
    const crossOrganizationInput = lifecycleDeleteInput(
      crossOrganization.id,
      'same-thread-other-organization',
      { organizationId: OTHER_ORGANIZATION_ID, actorId: 'e2345678-9abc-4def-8012-3456789abcde' },
    );
    await lifecycle.deleteSession({
      ...crossOrganizationInput,
      tombstone: { ...crossOrganizationInput.tombstone, copilotThreadIdHash: sharedThreadHash },
    });

    const sameOrganizationReuse = await prisma!.agentSession.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        createdByUserId: TEST_USER_ID,
        copilotThreadId: firstSession.copilotThreadId,
        primaryAgentVersionId: VERSION_FROM,
        authorityProfileVersionId: AUTHORITY_VERSION,
        lifecycle: 'archived',
        archivedAt: new Date('2026-08-13T00:00:00.000Z'),
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });
    const reuseInput = lifecycleDeleteInput(sameOrganizationReuse.id, 'same-thread-reuse');
    await lifecycle.deleteSession({
      ...reuseInput,
      tombstone: { ...reuseInput.tombstone, copilotThreadIdHash: sharedThreadHash },
    });

    await expect(prisma!.agentSessionTombstone.count({
      where: { copilotThreadIdHash: sharedThreadHash.hash },
    })).resolves.toBe(3);
  });

  it('records the policy version resolved inside the locked deletion transaction', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    await markDueArchived(fixture.sessionId);
    await prisma!.agentInteractionRetentionPolicy.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        legalPolicyVersion: 'policy-before-lock',
      },
    });
    const input = lifecycleDeleteInput(fixture.sessionId, 'locked-policy-version');
    let deletion!: Promise<unknown>;
    await prisma!.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT organization_id
        FROM agent_interaction_retention_policies
        WHERE organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `);
      deletion = lifecycle.deleteSession(input);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await tx.agentInteractionRetentionPolicy.update({
        where: { organizationId: TEST_ORGANIZATION_ID },
        data: { legalPolicyVersion: 'policy-locked-current' },
      });
    });
    await expect(deletion).resolves.toBeDefined();
    await expect(prisma!.agentSessionTombstone.findFirstOrThrow({
      where: { idempotencyKeyHash: input.tombstone.idempotencyKeyHash.hash },
      select: { legalPolicyVersion: true },
    })).resolves.toEqual({ legalPolicyVersion: 'policy-locked-current' });
  });

  it('serializes same-key delete attempts and rejects a mismatched fingerprint', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });
    const input = lifecycleDeleteInput(fixture.sessionId);
    const outcomes = await Promise.allSettled([
      lifecycle.deleteSession(input),
      lifecycle.deleteSession({
        ...input,
        tombstone: {
          ...input.tombstone,
          requestFingerprintHash: { hash: `e${'0'.repeat(63)}`, hashKeyVersion: 'v1' },
        },
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { code: 'THREAD_LIFECYCLE_IDEMPOTENCY_CONFLICT' },
    });
    await expect(prisma!.agentSessionTombstone.count()).resolves.toBe(1);
  });

  it('projects only explicitly classified longer-basis artifact and usage audits without canonical content', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const independentDueAt = new Date('2033-08-13T00:00:00.000Z');
    const artifactOccurredAt = new Date('2026-07-13T00:00:00.000Z');
    const usageOccurredAt = new Date('2026-07-14T00:00:00.000Z');
    const sensitiveArtifactContent = 'never retain this artifact message or credential';
    const sensitiveUsageContent = 'never retain this usage model output';

    await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        artifactType: 'regulatory_evidence',
        storageReference: `vault://credential/${sensitiveArtifactContent}`,
        sha256: '1'.repeat(64),
        metadata: { content: sensitiveArtifactContent },
        idempotencyKey: 'artifact:independent-legal-audit',
        retentionClass: 'independent_legal_audit',
        independentLegalBasisCode: 'regulatory_inquiry',
        independentRetentionDueAt: independentDueAt,
        createdAt: artifactOccurredAt,
      },
    });
    await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        artifactType: 'ordinary_output',
        storageReference: 'vault://credential/ordinary',
        sha256: '2'.repeat(64),
        metadata: { content: 'ordinary artifact content' },
        idempotencyKey: 'artifact:ordinary-session-retention',
      },
    });
    await prisma!.agentExecutionUsage.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        executionId: fixture.executionId,
        modelIdentity: 'gpt-test',
        provider: 'openai',
        inputTokens: 17,
        outputTokens: 29,
        costMicros: 43n,
        currency: 'KRW',
        recordedAt: usageOccurredAt,
        retentionClass: 'independent_legal_audit',
        independentLegalBasisCode: 'regulatory_inquiry',
        independentRetentionDueAt: independentDueAt,
      },
    });
    await prisma!.agentExecutionUsage.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        executionId: fixture.executionId,
        modelIdentity: sensitiveUsageContent,
        provider: 'openai',
        inputTokens: 1,
        outputTokens: 1,
        costMicros: 1n,
        currency: 'USD',
      },
    });
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });

    await lifecycle.deleteSession(lifecycleDeleteInput(fixture.sessionId, 'retained-audits'));

    const projections = await prisma!.agentSessionLegalAuditProjection.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { recordKind: 'asc' },
    });
    expect(projections).toHaveLength(2);
    const projectionFacts = projections as unknown as Array<{
      recordKind: string;
      legalBasisCode: string;
      retentionDueAt: Date;
      sourceOccurredAt: Date;
      currency: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      costMicros: bigint | null;
      recordCount: number;
    }>;
    expect(projectionFacts).toEqual([
      expect.objectContaining({
        recordKind: 'artifact',
        legalBasisCode: 'regulatory_inquiry',
        retentionDueAt: independentDueAt,
        sourceOccurredAt: artifactOccurredAt,
        currency: null,
        inputTokens: null,
        outputTokens: null,
        costMicros: null,
        recordCount: 1,
      }),
      expect.objectContaining({
        recordKind: 'usage',
        legalBasisCode: 'regulatory_inquiry',
        retentionDueAt: independentDueAt,
        sourceOccurredAt: usageOccurredAt,
        currency: 'KRW',
        inputTokens: 17,
        outputTokens: 29,
        costMicros: 43n,
        recordCount: 1,
      }),
    ]);
    expect(Object.keys(projectionFacts[0]!).sort()).toEqual([
      'costMicros',
      'createdAt',
      'currency',
      'id',
      'inputTokens',
      'legalBasisCode',
      'organizationId',
      'outputTokens',
      'recordCount',
      'recordKind',
      'retentionDueAt',
      'sourceOccurredAt',
    ]);
    const retainedJson = JSON.stringify(
      projections,
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    );
    expect(retainedJson).not.toContain(fixture.sessionId);
    expect(retainedJson).not.toContain(sensitiveArtifactContent);
    expect(retainedJson).not.toContain(sensitiveUsageContent);
    expect(retainedJson).not.toContain('1'.repeat(64));
    expect(retainedJson).not.toContain('vault://credential');
    const erasureClaims = await prisma!.$queryRaw<Array<{
      referenceHash: string;
      dueAt: Date;
      status: string;
    }>>(Prisma.sql`
      SELECT reference_hash AS "referenceHash", due_at AS "dueAt", status
      FROM agent_session_artifact_erasure_claims
      WHERE organization_id = ${TEST_ORGANIZATION_ID}::uuid
      ORDER BY due_at ASC, reference_hash ASC
    `);
    expect(erasureClaims).toHaveLength(2);
    expect(erasureClaims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        referenceHash: createHash('sha256')
          .update(`vault://credential/${sensitiveArtifactContent}`)
          .digest('hex'),
        dueAt: independentDueAt,
        status: 'pending',
      }),
      expect.objectContaining({
        referenceHash: createHash('sha256')
          .update('vault://credential/ordinary')
          .digest('hex'),
        status: 'pending',
      }),
    ]));
    await expect(prisma!.agentSessionArtifact.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
    await expect(prisma!.agentExecutionUsage.count({
      where: { organizationId: TEST_ORGANIZATION_ID, executionId: fixture.executionId },
    })).resolves.toBe(0);
    await expect(prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
    await expect(prisma!.agentExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
  });

  it('fails closed and rolls back deletion when an independent-audit classification is invalid', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        artifactType: 'unvalidated_legal_audit',
        storageReference: 'vault://credential/must-not-delete-on-invalid-basis',
        sha256: '3'.repeat(64),
        metadata: { content: 'canonical content must survive the rejected deletion' },
        idempotencyKey: 'artifact:invalid-independent-legal-audit',
        retentionClass: 'independent_legal_audit',
        independentLegalBasisCode: null,
        independentRetentionDueAt: null,
      },
    });
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });

    await expect(lifecycle.deleteSession(
      lifecycleDeleteInput(fixture.sessionId, 'invalid-retention-audit'),
    )).rejects.toMatchObject({ code: 'THREAD_RETENTION_AUDIT_INVALID' });
    await expect(prisma!.agentSession.findUnique({
      where: { id: fixture.sessionId },
    })).resolves.not.toBeNull();
    await expect(prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(1);
    await expect(prisma!.agentSessionArtifact.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(1);
    await expect(prisma!.agentSessionLegalAuditProjection.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
  });

  it('fails closed when an independent legal-audit deadline has already expired at deletion', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        artifactType: 'expired_legal_audit',
        storageReference: 'https://storage.local/kiditem/agent-artifacts/expired-audit',
        sha256: '4'.repeat(64),
        metadata: {},
        idempotencyKey: 'artifact:expired-independent-legal-audit',
        retentionClass: 'independent_legal_audit',
        independentLegalBasisCode: 'regulatory_inquiry',
        independentRetentionDueAt: new Date('2026-08-20T00:00:00.000Z'),
      },
    });
    await markDueArchived(fixture.sessionId);

    await expect(lifecycle.deleteSession(
      lifecycleDeleteInput(fixture.sessionId, 'expired-retention-audit'),
    )).rejects.toMatchObject({ code: 'THREAD_RETENTION_AUDIT_INVALID' });
    await expect(prisma!.agentSessionArtifact.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(1);
  });

  it('serializes concurrent deletion claims for the same retained artifact reference', async () => {
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const first = await createRootGraph();
    const second = await createRootGraph();
    const storageReference = 'https://storage.local/kiditem/agent-artifacts/shared-retained-object';
    const retentionDueAt = new Date('2033-08-13T00:00:00.000Z');
    for (const fixture of [first, second]) {
      await prisma!.agentSessionArtifact.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sessionId: fixture.sessionId,
          taskId: fixture.taskId,
          executionId: fixture.executionId,
          artifactType: 'shared_regulatory_evidence',
          storageReference,
          sha256: `shared-${fixture.sessionId}`,
          metadata: {},
          idempotencyKey: `artifact:shared-retained:${fixture.sessionId}`,
          retentionClass: 'independent_legal_audit',
          independentLegalBasisCode: 'regulatory_inquiry',
          independentRetentionDueAt: retentionDueAt,
        },
      });
      await markDueArchived(fixture.sessionId);
    }

    await expect(Promise.all([
      lifecycle.deleteSession(lifecycleDeleteInput(first.sessionId, 'shared-retained-first')),
      lifecycle.deleteSession(lifecycleDeleteInput(second.sessionId, 'shared-retained-second')),
    ])).resolves.toHaveLength(2);
    await expect(prisma!.agentSessionArtifactErasureClaim.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        referenceHash: createHash('sha256').update(storageReference).digest('hex'),
        dueAt: retentionDueAt,
      },
    })).resolves.toBe(1);
  });

  it('fails closed when an existing erasure-reference hash maps to different raw storage content', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const storageReference = 'https://storage.local/kiditem/agent-artifacts/expected-reference';
    const independentDueAt = new Date('2033-08-13T00:00:00.000Z');
    await prisma!.agentSessionArtifactErasureClaim.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        storageReference: 'https://storage.local/kiditem/agent-artifacts/collision-reference',
        referenceHash: createHash('sha256').update(storageReference).digest('hex'),
        dueAt: new Date('2034-08-13T00:00:00.000Z'),
        availableAt: new Date('2034-08-13T00:00:00.000Z'),
        status: 'pending',
      },
    });
    await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        executionId: fixture.executionId,
        artifactType: 'collision_probe',
        storageReference,
        sha256: '6'.repeat(64),
        metadata: {},
        idempotencyKey: 'artifact:collision-probe',
        retentionClass: 'independent_legal_audit',
        independentLegalBasisCode: 'regulatory_inquiry',
        independentRetentionDueAt: independentDueAt,
      },
    });
    await markDueArchived(fixture.sessionId);

    await expect(lifecycle.deleteSession(
      lifecycleDeleteInput(fixture.sessionId, 'erasure-hash-collision'),
    )).rejects.toMatchObject({ code: 'THREAD_ARTIFACT_ERASURE_HASH_COLLISION' });
    await expect(prisma!.agentSession.findUnique({
      where: { id: fixture.sessionId },
    })).resolves.not.toBeNull();
  });

  it('reclaims a crashed erasure lease, preserves a shared live reference, and expires due legal-audit projections', async () => {
    const maintenanceTransactions = new PrismaAgentSessionLifecycleMaintenanceTransaction(
      prisma as never,
    );
    const now = new Date('2026-08-21T00:00:00.000Z');
    const storageReference = 'https://storage.local/kiditem/agent-artifacts/due-object';
    const objects = new Set([storageReference]);
    const eraser = {
      erase: async ({ storageReference: reference }: { storageReference: string }) => {
        objects.delete(reference);
        return { outcome: 'erased' as const };
      },
    };
    const service = new AgentSessionLifecycleMaintenanceService(
      maintenanceTransactions as never,
      eraser,
    );
    const referenceHash = createHash('sha256').update(storageReference).digest('hex');
    const crashedClaim = await prisma!.agentSessionArtifactErasureClaim.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        storageReference,
        referenceHash,
        dueAt: new Date('2026-08-20T00:00:00.000Z'),
        availableAt: new Date('2026-08-20T00:00:00.000Z'),
        status: 'pending',
      },
    });
    await maintenanceTransactions.claimDueArtifactErasures({
      now: new Date('2026-08-20T00:01:00.000Z'),
      claimToken: crypto.randomUUID(),
      leaseExpiredBefore: new Date('2026-08-20T00:00:00.000Z'),
      limit: 1,
    });
    const dueProjection = await prisma!.agentSessionLegalAuditProjection.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        recordKind: 'usage',
        legalBasisCode: 'financial_recordkeeping',
        retentionDueAt: new Date('2026-08-20T00:00:00.000Z'),
        sourceOccurredAt: new Date('2026-08-13T00:00:00.000Z'),
        inputTokens: 1,
        outputTokens: 2,
        costMicros: 3n,
        currency: 'KRW',
      },
    });
    const futureProjection = await prisma!.agentSessionLegalAuditProjection.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        recordKind: 'usage',
        legalBasisCode: 'financial_recordkeeping',
        retentionDueAt: new Date('2033-08-13T00:00:00.000Z'),
        sourceOccurredAt: new Date('2026-08-13T00:00:00.000Z'),
        inputTokens: 1,
        outputTokens: 2,
        costMicros: 3n,
        currency: 'KRW',
      },
    });

    await expect(service.drain({ now, limit: 10 })).resolves.toMatchObject({
      erased: 1,
      expiredAuditProjections: 1,
    });
    expect(objects.has(storageReference)).toBe(false);
    await expect(prisma!.agentSessionArtifactErasureClaim.findUnique({
      where: { id: crashedClaim.id },
    })).resolves.toBeNull();
    await expect(prisma!.agentSessionLegalAuditProjection.findUnique({
      where: { id: dueProjection.id },
    })).resolves.toBeNull();
    await expect(prisma!.agentSessionLegalAuditProjection.findUnique({
      where: { id: futureProjection.id },
    })).resolves.not.toBeNull();

    const liveFixture = await createRootGraph();
    await prisma!.agentSessionArtifact.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sessionId: liveFixture.sessionId,
        taskId: liveFixture.taskId,
        executionId: liveFixture.executionId,
        artifactType: 'live_shared',
        storageReference,
        sha256: '5'.repeat(64),
        metadata: {},
        idempotencyKey: 'artifact:live-shared-reference',
      },
    });
    const sharedClaim = await prisma!.agentSessionArtifactErasureClaim.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        storageReference,
        referenceHash,
        dueAt: new Date('2026-08-20T00:00:00.000Z'),
        availableAt: new Date('2026-08-20T00:00:00.000Z'),
        status: 'pending',
      },
    });
    objects.add(storageReference);

    await expect(service.drain({ now, limit: 10 })).resolves.toMatchObject({ deferred: 1 });
    expect(objects.has(storageReference)).toBe(true);
    await expect(prisma!.agentSessionArtifactErasureClaim.findUniqueOrThrow({
      where: { id: sharedClaim.id },
      select: { status: true, storageReference: true },
    })).resolves.toEqual({ status: 'deferred', storageReference });
    await prisma!.agentSessionArtifact.deleteMany({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: liveFixture.sessionId },
    });
    await expect(service.drain({
      now: new Date('2026-08-21T00:06:00.000Z'),
      limit: 10,
    })).resolves.toMatchObject({ erased: 1 });
    expect(objects.has(storageReference)).toBe(false);

    const erasedOrganizationId = crypto.randomUUID();
    const erasedReference = 'https://storage.local/kiditem/agent-artifacts/org-removal-erased';
    await prisma!.organization.create({
      data: {
        id: erasedOrganizationId,
        name: 'Erased claim owner',
        slug: `erased-claim-owner-${erasedOrganizationId}`,
      },
    });
    await prisma!.agentSessionArtifactErasureClaim.create({
      data: {
        organizationId: erasedOrganizationId,
        storageReference: erasedReference,
        referenceHash: createHash('sha256').update(erasedReference).digest('hex'),
        dueAt: new Date('2026-08-20T00:00:00.000Z'),
        availableAt: new Date('2026-08-20T00:00:00.000Z'),
        status: 'pending',
      },
    });
    objects.add(erasedReference);
    await service.drain({ now, limit: 10 });
    await expect(prisma!.agentSessionArtifactErasureClaim.count({
      where: { organizationId: erasedOrganizationId },
    })).resolves.toBe(0);
    await expect(prisma!.organization.delete({
      where: { id: erasedOrganizationId },
    })).resolves.toBeDefined();

    const protectedOrganizationId = crypto.randomUUID();
    const protectedReference = 'https://storage.local/kiditem/agent-artifacts/org-removal-pending';
    await prisma!.organization.create({
      data: {
        id: protectedOrganizationId,
        name: 'Pending claim owner',
        slug: `pending-claim-owner-${protectedOrganizationId}`,
      },
    });
    const protectedClaim = await prisma!.agentSessionArtifactErasureClaim.create({
      data: {
        organizationId: protectedOrganizationId,
        storageReference: protectedReference,
        referenceHash: createHash('sha256').update(protectedReference).digest('hex'),
        dueAt: new Date('2033-08-13T00:00:00.000Z'),
        availableAt: new Date('2033-08-13T00:00:00.000Z'),
        status: 'pending',
      },
    });
    await expect(prisma!.organization.delete({
      where: { id: protectedOrganizationId },
    })).rejects.toMatchObject({ code: 'P2003' });
    await prisma!.agentSessionArtifactErasureClaim.delete({
      where: { id: protectedClaim.id },
    });
    await prisma!.organization.delete({ where: { id: protectedOrganizationId } });
  });

  it('removes expired audit projections atomically across concurrent cleaners and does not block organization removal', async () => {
    const maintenanceTransactions = new PrismaAgentSessionLifecycleMaintenanceTransaction(
      prisma as never,
    );
    const now = new Date('2026-08-21T00:00:00.000Z');
    await prisma!.agentSessionLegalAuditProjection.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          recordKind: 'usage',
          legalBasisCode: 'financial_recordkeeping',
          retentionDueAt: new Date('2026-08-20T00:00:00.000Z'),
          sourceOccurredAt: new Date('2026-08-13T00:00:00.000Z'),
          inputTokens: 1,
          outputTokens: 2,
          costMicros: 3n,
          currency: 'KRW',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          recordKind: 'usage',
          legalBasisCode: 'financial_recordkeeping',
          retentionDueAt: new Date('2026-08-20T00:00:00.000Z'),
          sourceOccurredAt: new Date('2026-08-13T00:00:00.000Z'),
          inputTokens: 1,
          outputTokens: 2,
          costMicros: 3n,
          currency: 'KRW',
        },
      ],
    });
    const deleted = await Promise.all([
      maintenanceTransactions.deleteDueLegalAuditProjections({ now, limit: 10 }),
      maintenanceTransactions.deleteDueLegalAuditProjections({ now, limit: 10 }),
    ]);
    expect(deleted.reduce((total, count) => total + count, 0)).toBe(2);
    await expect(prisma!.agentSessionLegalAuditProjection.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(0);
    const removableOrganizationId = crypto.randomUUID();
    await prisma!.organization.create({
      data: {
        id: removableOrganizationId,
        name: 'Removable projection owner',
        slug: `removable-projection-owner-${removableOrganizationId}`,
      },
    });
    await prisma!.agentSessionLegalAuditProjection.create({
      data: {
        organizationId: removableOrganizationId,
        recordKind: 'usage',
        legalBasisCode: 'financial_recordkeeping',
        retentionDueAt: new Date('2033-08-13T00:00:00.000Z'),
        sourceOccurredAt: new Date('2026-08-13T00:00:00.000Z'),
        inputTokens: 1,
        outputTokens: 2,
        costMicros: 3n,
        currency: 'KRW',
      },
    });
    await prisma!.organization.delete({ where: { id: removableOrganizationId } });
    await expect(prisma!.agentSessionLegalAuditProjection.count({
      where: { organizationId: removableOrganizationId },
    })).resolves.toBe(0);
  });

  it('removes session control rows while retaining the external operation envelope', async () => {
    const fixture = await createRootGraph();
    const lifecycle = new PrismaAgentSessionLifecycleTransaction(prisma as never);
    const operation = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.execute-session-task',
        definitionVersion: 1,
        ownerDomain: 'agent-os',
        title: 'Delete retained operation envelope',
        engineType: 'agent_os',
        triggerSource: 'agent',
        input: {},
      },
    });
    const attempt = await repository.reserveAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
      idempotencyKey: `operation:${operation.id}`,
    });
    await repository.activateAttemptForOperation({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      operationRunId: operation.id,
    });
    const approval = await repository.requestApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      operationRunId: operation.id,
      capabilityKey: 'supply.submit_purchase_order',
      argumentsHash: 'a'.repeat(64),
      resourceSnapshot: [],
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      idempotencyKey: 'approval:delete:1',
    });
    await repository.decideApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      approvalId: approval.id,
      expectedState: 'pending',
      decision: 'approved',
      actorType: 'user',
      actorId: TEST_USER_ID,
      idempotencyKey: 'approval-delete-decision:1',
    });
    await prisma!.agentSession.update({
      where: { id: fixture.sessionId },
      data: {
        lifecycle: 'archived',
        retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
      },
    });

    await lifecycle.deleteSession(lifecycleDeleteInput(fixture.sessionId));

    await expect(prisma!.agentSessionApproval.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
    await expect(prisma!.agentSessionApprovalContinuation.count({
      where: { organizationId: TEST_ORGANIZATION_ID, approvalId: approval.id },
    })).resolves.toBe(0);
    await expect(prisma!.agentExecutionAttemptOperationBinding.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: fixture.sessionId },
    })).resolves.toBe(0);
    await expect(prisma!.operationRun.findUnique({ where: { id: operation.id } })).resolves.not.toBeNull();
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

async function createRootGraph(): Promise<{
  sessionId: string;
  taskId: string;
  policyId: string;
  executionId: string;
}> {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  const session = await prisma.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: `control-${crypto.randomUUID()}`,
      primaryAgentVersionId: VERSION_FROM,
      authorityProfileVersionId: AUTHORITY_VERSION,
      lifecycle: 'active',
    },
  });
  const task = await prisma.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_FROM,
      isRoot: true,
      status: 'running',
      idempotencyKey: 'root',
    },
  });
  const policy = await prisma.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: VERSION_FROM,
      authorityProfileVersionId: AUTHORITY_VERSION,
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
      organizationId: TEST_ORGANIZATION_ID,
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
      organizationId: TEST_ORGANIZATION_ID,
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

async function markDueArchived(sessionId: string): Promise<void> {
  await prisma!.agentSession.update({
    where: { id: sessionId },
    data: {
      lifecycle: 'archived',
      archivedAt: new Date('2026-08-13T00:00:00.000Z'),
      retentionDueAt: new Date('2026-08-13T00:00:00.000Z'),
    },
  });
}

function lifecycleDeleteInput(
  sessionId: string,
  variant = 'default',
  scope: { organizationId: string; actorId: string } = {
    organizationId: TEST_ORGANIZATION_ID,
    actorId: TEST_USER_ID,
  },
) {
  const hash = (kind: string) => createHash('sha256').update(`${kind}:${variant}`).digest('hex');
  return {
    organizationId: scope.organizationId,
    sessionId,
    actorId: scope.actorId,
    reason: 'Delete the due interaction',
    idempotencyKey: 'delete-session-key-01',
    tombstone: {
      organizationIdHash: { hash: hash('organization'), hashKeyVersion: 'v1' },
      copilotThreadIdHash: { hash: hash('thread'), hashKeyVersion: 'v1' },
      idempotencyKeyHash: { hash: hash('idempotency'), hashKeyVersion: 'v1' },
      requestFingerprintHash: { hash: hash('fingerprint'), hashKeyVersion: 'v1' },
    },
  };
}
