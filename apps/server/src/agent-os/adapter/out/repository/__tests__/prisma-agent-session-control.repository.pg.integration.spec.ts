import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import { PrismaAgentSessionControlRepository } from '../prisma-agent-session-control.repository';
import { PrismaAgentExecutionContextRepository } from '../prisma-agent-execution-context.repository';

const VERSION_FROM = '20000000-0000-4000-8000-000000000001';
const VERSION_TO = '20000000-0000-4000-8000-000000000002';
const AUTHORITY_VERSION = '20000000-0000-4000-8000-000000000003';
const OTHER_AUTHORITY_VERSION = '20000000-0000-4000-8000-000000000004';

let prisma: PrismaClient | null = null;
let repository: PrismaAgentSessionControlRepository;

beforeAll(async () => {
  prisma = makeTestPrisma();
  repository = new PrismaAgentSessionControlRepository(prisma as never);
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

describe('PrismaAgentSessionControlRepository', () => {
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
        engineType: 'agent-os',
        triggerSource: 'agent',
        input: {},
      },
    });
    await expect(repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      runtimeType: 'copilotkit_agui',
      operationRunId: operation.id,
      idempotencyKey: `operation:${operation.id}`,
    })).resolves.toMatchObject({ operationRunId: operation.id });
    await expect(repository.loadCancelableTask({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_USER_ID,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      expectedStatus: 'running',
    })).resolves.toEqual(expect.objectContaining({ operationRunId: operation.id }));
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
        engineType: 'agent-os',
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
    await expect(repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      runtimeType: 'copilotkit_agui',
      operationRunId: operation.id,
      idempotencyKey: `operation:${operation.id}`,
    })).resolves.toMatchObject({ id: reserved.id, state: 'running' });
  });

  it('binds an approval to one invocation attempt and decides it idempotently', async () => {
    const fixture = await createRootGraph();
    const attempt = await repository.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      runtimeType: 'codex_cli',
      idempotencyKey: 'attempt:approval',
    });
    await expect(repository.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      executionId: fixture.executionId,
      attemptId: attempt.id,
      runtimeType: 'codex_cli',
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
    await expect(repository.loadApproval({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: fixture.sessionId,
      approvalId: approval.id,
    })).resolves.toMatchObject({ runtimeGeneration: 4 });
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
  return { sessionId: session.id, taskId: task.id, executionId: execution.id };
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
