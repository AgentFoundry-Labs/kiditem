import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../../test-helpers/real-prisma';
import { PrismaAgentJudgmentSubmissionTransaction } from '../prisma-agent-judgment-submission.transaction';
import { PrismaAgentJudgmentDispatchOutboxTransaction } from '../prisma-agent-judgment-dispatch-outbox.transaction';
import { PrismaAgentSessionOwnedOperationTransaction } from '../prisma-agent-session-owned-operation.transaction';
import { AgentJudgmentDispatchService } from '../../../../../application/service/session-control/agent-judgment-dispatch.service';
import { AgentJudgmentDispatchRecoveryService } from '../../../../../application/service/session-control/agent-judgment-dispatch-recovery.service';
import { AgentSessionTaskDispatchService } from '../../../../../application/service/session-control/agent-session-task-dispatch.service';
import { AGENT_SESSION_TASK_OPERATION_KEY } from '../../../../../domain/operation/agent-os.operations';

const VERSION_ID = '90000000-0000-4000-8000-000000000001';
const AUTHORITY_PROFILE_ID = 'foundation_read_only_probe:v1';
const POLICY = { authorityClass: AUTHORITY_PROFILE_ID, capabilityKeys: [] };

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
});
afterAll(async () => prisma?.$disconnect());
beforeEach(async () => {
  if (!prisma) throw new Error('Prisma is not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await prisma.agentVersion.create({
    data: {
      id: VERSION_ID, agentDefinitionKey: 'ad_strategy', version: 1,
      displayName: 'Ad strategy', description: 'Test version',
      runtimeType: 'isolated_cli', modelIdentity: 'test-model',
      capabilityKeys: [], policyDocument: {}, manifestHash: 'ad-strategy-v1',
      runtimeManifest: {}, activatedAt: new Date(),
    },
  });
  await prisma.agentAuthorityProfileVersion.create({
    data: {
      id: AUTHORITY_PROFILE_ID, organizationId: TEST_ORGANIZATION_ID,
      profileKey: 'foundation_read_only_probe', version: 1,
      capabilityKeys: [], policyDocument: POLICY, policyHash: 'authority-hash',
    },
  });
});

describe('Prisma judgment submission transaction', () => {
  it('commits the official graph and content-free pending dispatch outbox together', async () => {
    const transaction = new PrismaAgentJudgmentSubmissionTransaction(prisma as never);

    const first = await transaction.submit({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      agentDefinitionKey: 'ad_strategy',
      objective: 'Create an advertising strategy.',
      resourceRefs: [],
      idempotencyKey: 'judgment-1',
      fingerprint: 'fingerprint-1',
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      authorityProfilePolicyDocument: POLICY,
      authorityProfilePolicyHash: 'authority-hash',
      capabilityKeys: [],
    });
    expect(first).toMatchObject({ state: 'pending', operationRunId: null });
    await expect(prisma!.agentExecutionDispatchOutbox.findMany({
      select: {
        organizationId: true, sessionId: true, sessionTaskId: true, executionId: true,
        idempotencyKey: true, fingerprint: true, state: true, operationRunId: true,
      },
    })).resolves.toEqual([{
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: first.sessionId, sessionTaskId: first.taskId, executionId: first.executionId,
      idempotencyKey: 'judgment-1', fingerprint: 'fingerprint-1', state: 'pending', operationRunId: null,
    }]);
  });

  it('returns the exact graph for a retry and rejects a fingerprint mismatch', async () => {
    const transaction = new PrismaAgentJudgmentSubmissionTransaction(prisma as never);
    const input = submissionInput();
    const first = await transaction.submit(input);
    await expect(transaction.submit(input)).resolves.toEqual(first);
    await expect(transaction.submit({ ...input, objective: 'Changed objective.', fingerprint: 'different' }))
      .rejects.toMatchObject({ code: 'AGENT_JUDGMENT_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects a system actor and rolls back when the initial event conflicts', async () => {
    await prisma!.user.create({
      data: { id: '90000000-0000-4000-8000-000000000002', email: 'system@test.local', name: 'System', type: 'system' },
    });
    await prisma!.organizationMembership.create({
      data: { organizationId: TEST_ORGANIZATION_ID, userId: '90000000-0000-4000-8000-000000000002', role: 'member', status: 'active' },
    });
    const transaction = new PrismaAgentJudgmentSubmissionTransaction(prisma as never);
    await expect(transaction.submit({ ...submissionInput(), userId: '90000000-0000-4000-8000-000000000002' }))
      .rejects.toMatchObject({ code: 'AGENT_JUDGMENT_PRINCIPAL_NOT_ALLOWED' });
    const existing = await prisma!.agentSession.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, createdByUserId: TEST_USER_ID,
        copilotThreadId: 'other-thread', primaryAgentVersionId: VERSION_ID,
        authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      }, select: { id: true },
    });
    const rollbackInput = { ...submissionInput(), idempotencyKey: 'rollback' };
    await prisma!.agentConversationEvent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, sessionId: existing.id,
        externalEventId: judgmentExternalEventId(rollbackInput), sequence: 1n,
        eventType: 'user_message', schemaVersion: 1,
        payload: { phase: 'complete', messageId: 'existing', content: 'existing' },
      },
    });
    await expect(transaction.submit(rollbackInput)).rejects.toMatchObject({ code: 'AGENT_JUDGMENT_IDEMPOTENCY_CONFLICT' });
    await expect(Promise.all([
      prisma!.agentSession.count(), prisma!.agentExecution.count(), prisma!.agentExecutionDispatchOutbox.count(),
    ])).resolves.toEqual([1, 0, 0]);
  });

  it('recovers a committed pending handoff and creates exactly one owned Operation and attempt binding', async () => {
    const transaction = new PrismaAgentJudgmentSubmissionTransaction(prisma as never);
    const submitted = await transaction.submit(submissionInput());
    const outbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);
    const dispatch = makeDispatcher(outbox);

    const first = await dispatch.dispatch({
      organizationId: TEST_ORGANIZATION_ID, sessionId: submitted.sessionId,
      taskId: submitted.taskId, executionId: submitted.executionId, requestedByUserId: TEST_USER_ID,
    });
    await expect(dispatch.dispatch({
      organizationId: TEST_ORGANIZATION_ID, sessionId: submitted.sessionId,
      taskId: submitted.taskId, executionId: submitted.executionId, requestedByUserId: TEST_USER_ID,
    })).resolves.toEqual(first);
    await expect(Promise.all([
      prisma!.operationRun.count(),
      prisma!.agentSessionOperationRunOwnership.count(),
      prisma!.agentExecutionAttemptOperationBinding.count(),
      prisma!.agentExecutionDispatchOutbox.findFirstOrThrow({ select: { state: true, operationRunId: true } }),
    ])).resolves.toEqual([1, 1, 1, { state: 'dispatched', operationRunId: first.operationsRunId }]);
  });

  it('lists only content-free pending coordinates with the exact session requester', async () => {
    const submitted = await new PrismaAgentJudgmentSubmissionTransaction(prisma as never).submit(submissionInput());
    const outbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);

    await expect(outbox.listPending({ limit: 100 })).resolves.toEqual([{
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: submitted.sessionId,
      taskId: submitted.taskId,
      executionId: submitted.executionId,
      requestedByUserId: TEST_USER_ID,
    }]);
  });

  it('does not expose a pending handoff held by a live lease to recovery', async () => {
    const submitted = await new PrismaAgentJudgmentSubmissionTransaction(prisma as never).submit(submissionInput());
    await prisma!.agentExecutionDispatchOutbox.update({
      where: { executionId: submitted.executionId },
      data: {
        leaseToken: '90000000-0000-4000-8000-000000000003',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    const outbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);

    await expect(outbox.listPending({ limit: 100 })).resolves.toEqual([]);
  });

  it('recovers a committed session graph without an API submission retry', async () => {
    const submitted = await new PrismaAgentJudgmentSubmissionTransaction(prisma as never).submit(submissionInput());
    const outbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);
    const recovery = new AgentJudgmentDispatchRecoveryService(outbox, makeDispatcher(outbox), { register: () => undefined });

    await recovery.run(new AbortController().signal);

    await expect(Promise.all([
      prisma!.operationRun.count(),
      prisma!.agentSessionOperationRunOwnership.count(),
      prisma!.agentExecutionAttemptOperationBinding.count(),
      prisma!.agentExecutionDispatchOutbox.findFirstOrThrow({
        where: { executionId: submitted.executionId },
        select: { state: true, operationRunId: true },
      }),
    ])).resolves.toEqual([
      1,
      1,
      1,
      { state: 'dispatched', operationRunId: expect.any(String) },
    ]);
  });

  it('recovers after an Operation exists but before the dispatched mark and preserves one immutable operation', async () => {
    const submitted = await new PrismaAgentJudgmentSubmissionTransaction(prisma as never).submit(submissionInput());
    const realOutbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);
    const crashing = makeDispatcher({
      claim: realOutbox.claim.bind(realOutbox),
      markDispatched: async () => { throw new Error('crash-before-mark'); },
      release: realOutbox.release.bind(realOutbox),
    });
    const input = {
      organizationId: TEST_ORGANIZATION_ID, sessionId: submitted.sessionId,
      taskId: submitted.taskId, executionId: submitted.executionId, requestedByUserId: TEST_USER_ID,
    };
    await expect(crashing.dispatch(input)).rejects.toThrow('crash-before-mark');
    const recovery = new AgentJudgmentDispatchRecoveryService(
      realOutbox,
      makeDispatcher(realOutbox),
      { register: () => undefined },
    );
    await recovery.run(new AbortController().signal);
    await expect(Promise.all([
      prisma!.operationRun.count(), prisma!.agentSessionOperationRunOwnership.count(),
      prisma!.agentExecutionAttemptOperationBinding.count(),
      prisma!.agentExecutionDispatchOutbox.findFirstOrThrow({
        where: { executionId: submitted.executionId },
        select: { state: true, operationRunId: true },
      }),
    ])).resolves.toEqual([1, 1, 1, { state: 'dispatched', operationRunId: expect.any(String) }]);
  });

  it('serializes two dispatchers racing the same pending execution', async () => {
    const submitted = await new PrismaAgentJudgmentSubmissionTransaction(prisma as never).submit(submissionInput());
    const outbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);
    const input = {
      organizationId: TEST_ORGANIZATION_ID, sessionId: submitted.sessionId,
      taskId: submitted.taskId, executionId: submitted.executionId, requestedByUserId: TEST_USER_ID,
    };
    const [left, right] = await Promise.all([
      makeDispatcher(outbox).dispatch(input), makeDispatcher(outbox).dispatch(input),
    ]);
    expect(left).toEqual(right);
    await expect(Promise.all([
      prisma!.operationRun.count(), prisma!.agentSessionOperationRunOwnership.count(),
      prisma!.agentExecutionAttemptOperationBinding.count(),
    ])).resolves.toEqual([1, 1, 1]);
  });

  it('does not duplicate an Operation when competing recovery hooks see one pending execution', async () => {
    const submitted = await new PrismaAgentJudgmentSubmissionTransaction(prisma as never).submit(submissionInput());
    const outbox = new PrismaAgentJudgmentDispatchOutboxTransaction(prisma as never);
    const left = new AgentJudgmentDispatchRecoveryService(
      outbox,
      makeDispatcher(outbox),
      { register: () => undefined },
    );
    const right = new AgentJudgmentDispatchRecoveryService(
      outbox,
      makeDispatcher(outbox),
      { register: () => undefined },
    );

    await Promise.all([left.run(new AbortController().signal), right.run(new AbortController().signal)]);

    await expect(Promise.all([
      prisma!.operationRun.count(),
      prisma!.agentSessionOperationRunOwnership.count(),
      prisma!.agentExecutionAttemptOperationBinding.count(),
      prisma!.agentExecutionDispatchOutbox.findFirstOrThrow({
        where: { executionId: submitted.executionId },
        select: { state: true },
      }),
    ])).resolves.toEqual([1, 1, 1, { state: 'dispatched' }]);
  });
});

function makeDispatcher(outbox: ConstructorParameters<typeof AgentJudgmentDispatchService>[0]) {
  const operations = new PrismaAgentSessionOwnedOperationTransaction(prisma as never);
  const taskDispatch = new AgentSessionTaskDispatchService({
    startExecution: (input) => operations.createExecutionRun({
      ...input,
      signal: new AbortController().signal,
      definition: {
        key: AGENT_SESSION_TASK_OPERATION_KEY, version: 1, title: 'AgentOS session task execution',
        ownerDomain: 'agent-os', engineType: 'agent_os', resourceClass: 'default',
        executionTimeoutMs: 60 * 60_000, maxAttempts: 5, successPersistence: 'retained',
      },
      parsedInput: { session: input.sessionId, task: input.taskId, execution: input.executionId },
    }),
    startCapability: async () => { throw new Error('not used'); },
  });
  return new AgentJudgmentDispatchService(outbox as never, taskDispatch);
}

function submissionInput() {
  return {
    organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID,
    agentDefinitionKey: 'ad_strategy', objective: 'Create an advertising strategy.',
    resourceRefs: [], idempotencyKey: 'judgment-1', fingerprint: 'fingerprint-1',
    authorityProfileVersionId: AUTHORITY_PROFILE_ID,
    authorityProfilePolicyDocument: POLICY, authorityProfilePolicyHash: 'authority-hash', capabilityKeys: [],
  };
}

function judgmentExternalEventId(input: ReturnType<typeof submissionInput>): string {
  const identity = createHash('sha256').update(JSON.stringify([
    'agent-judgment', input.organizationId, input.userId,
    input.agentDefinitionKey, input.idempotencyKey,
  ])).digest('hex');
  return `judgment.${identity}`;
}
