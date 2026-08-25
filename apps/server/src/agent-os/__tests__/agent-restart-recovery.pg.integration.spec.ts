import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaAgentWorkTransaction } from '../adapter/out/transaction/work/prisma-agent-work.transaction';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { makeTestPrisma, resetDb } from '../../test-helpers/real-prisma';

const organizationId = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const userId = 'e1234567-89ab-4cde-8f01-23456789abc1';
const gitSha = 'a'.repeat(40);
let prisma: PrismaClient;
let work: PrismaAgentWorkTransaction;

beforeAll(async () => {
  prisma = makeTestPrisma();
  work = new PrismaAgentWorkTransaction(prisma);
  await prisma.$connect();
});
afterAll(async () => prisma.$disconnect());
beforeEach(async () => {
  await resetDb(prisma);
  await prisma.organization.create({ data: { id: organizationId, name: 'Restart recovery', slug: 'agent-restart-recovery' } });
  await prisma.user.create({ data: { id: userId, email: 'restart-recovery@test.local', name: 'Recovery' } });
  await prisma.organizationMembership.create({ data: { organizationId, userId, status: 'active' } });
});

async function root() {
  const version = await prisma.agentVersion.create({
    data: {
      agentDefinitionKey: 'restart_recovery_test', version: 1,
      assignedDomains: ['products'], capabilityKeys: ['products.write'],
      runtimeType: 'codex_cli', instructionProfileRef: 'test/v1', manifestHash: 'b'.repeat(64), activatedAt: new Date(),
    },
  });
  const admitted = await work.admitRootAttempt({
    organizationId, createdByUserId: userId, assignedAgentVersionId: version.id,
    objective: 'Restart', completionCriteria: 'Recover', inputResourceRefs: [],
    input: {}, applicationVersion: '1.0.0', authorizingGitSha: gitSha, cliVersion: '1.0.0',
  });
  return { ...admitted, version };
}

async function invocation(input: Awaited<ReturnType<typeof root>>, status: 'authorized' | 'approval_pending' | 'ready' | 'executing', effects: string[], suffix = status) {
  const canonicalInput = effects.includes('db_write') ? { version: 7, productId: `product-${suffix}` } : undefined;
  return prisma.agentCapabilityInvocation.create({
    data: {
      organizationId, sessionId: input.session.id, taskId: input.task.id, attemptId: input.attempt.id, agentVersionId: input.version.id,
      initiatingUserId: userId, capabilityKey: 'products.write', ownerDomain: 'products', authorizationKind: 'agent_default_scope',
      authorizationExpiresAt: new Date('2030-01-01T01:00:00.000Z'),
      inputHash: canonicalOwnerInputHash(canonicalInput ?? { inline: suffix }),
      canonicalInput,
      effects, approvalRisk: 'none', idempotencyRequirement: effects.includes('db_write') ? 'required' : 'none', ownerIdempotencyKey: effects.includes('db_write') ? `owner-key-${suffix}` : undefined,
      applicationVersion: '1.0.0', authorizingGitSha: gitSha, capabilityContractFingerprint: 'd'.repeat(64), runtimeType: 'codex_cli', status,
    },
  });
}

describe('same-SHA Agent work restart recovery', () => {
  it('reclaims an expired mutation lease with exact persisted input and preserves durable work while interrupting live reads', async () => {
    const admitted = await root();
    const mutation = await invocation(admitted, 'executing', ['db_write'], 'expired');
    await prisma.agentCapabilityInvocation.update({ where: { id: mutation.id }, data: { leaseOwner: 'dead-worker', leaseExpiresAt: new Date('2029-12-31T23:59:59.000Z') } });
    const read = await invocation(admitted, 'authorized', ['read']);
    const claimed = await work.claimMutation({ workerId: 'new-worker', claimedAt: new Date('2030-01-01T00:00:00.000Z'), leaseExpiresAt: new Date('2030-01-01T00:01:00.000Z') });
    expect(claimed).toMatchObject({ invocationId: mutation.id, canonicalInput: { version: 7, productId: 'product-expired' }, ownerIdempotencyKey: 'owner-key-expired', leaseOwner: 'new-worker' });
    await work.finalizeMutation({ organizationId, invocationId: mutation.id, leaseOwner: 'new-worker', outcome: 'succeeded', result: { outcome: 'completed', summary: 'saved', resourceRefs: [], operationRefs: [], output: {} }, finishedAt: new Date('2030-01-01T00:00:01.000Z') });
    await expect(work.claimMutation({ workerId: 'third-worker', claimedAt: new Date('2030-01-01T00:00:01.000Z'), leaseExpiresAt: new Date('2030-01-01T00:01:01.000Z') })).resolves.toBeNull();
    await prisma.agentAttempt.update({ where: { id: admitted.attempt.id }, data: { status: 'running' } });
    await work.reconcile({ applicationVersion: '1.0.0', authorizingGitSha: gitSha, now: new Date('2030-01-01T00:00:02.000Z') });
    await expect(prisma.agentAttempt.findUnique({ where: { id: admitted.attempt.id }, select: { status: true } })).resolves.toEqual({ status: 'process_interrupted' });
    await expect(prisma.agentCapabilityInvocation.findUnique({ where: { id: read.id }, select: { status: true, error: true } })).resolves.toMatchObject({ status: 'failed', error: { code: 'process_interrupted' } });
    await expect(prisma.agentTask.findUnique({ where: { id: admitted.task.id }, select: { status: true } })).resolves.toEqual({ status: 'open' });
  });

  it('preserves ready mutations and pending Approvals while an expired executing lease reuses its existing owner idempotency key', async () => {
    const admitted = await root();
    await prisma.agentAttempt.update({ where: { id: admitted.attempt.id }, data: { status: 'running' } });
    const ready = await invocation(admitted, 'ready', ['db_write'], 'ready');
    const abandoned = await invocation(admitted, 'executing', ['db_write'], 'abandoned');
    await prisma.agentCapabilityInvocation.update({
      where: { id: abandoned.id },
      data: {
        leaseOwner: 'interrupted-worker',
        leaseExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    const awaitingApproval = await invocation(admitted, 'approval_pending', ['db_write'], 'approval');
    const pending = await prisma.agentCapabilityApproval.create({ data: { organizationId, sessionId: admitted.session.id, invocationId: awaitingApproval.id, inputHash: awaitingApproval.inputHash, status: 'pending', expiresAt: new Date('2030-01-02T00:00:00.000Z') } });
    await work.reconcile({ applicationVersion: '1.0.0', authorizingGitSha: gitSha, now: new Date('2030-01-01T00:00:02.000Z') });
    await expect(prisma.agentCapabilityInvocation.findMany({
      where: { id: { in: [ready.id, abandoned.id] } },
      select: { id: true, status: true, error: true, leaseOwner: true, leaseExpiresAt: true },
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ready.id, status: 'ready', error: null, leaseOwner: null, leaseExpiresAt: null }),
      expect.objectContaining({ id: abandoned.id, status: 'executing', error: null, leaseOwner: 'interrupted-worker' }),
    ]));
    await expect(work.claimMutation({ workerId: 'ready-worker', claimedAt: new Date('2030-01-01T00:00:03.000Z'), leaseExpiresAt: new Date('2030-01-01T00:01:03.000Z') }))
      .resolves.toMatchObject({ invocationId: ready.id, ownerIdempotencyKey: 'owner-key-ready' });
    await expect(work.claimMutation({ workerId: 'recovery-worker', claimedAt: new Date('2030-01-01T00:00:03.000Z'), leaseExpiresAt: new Date('2030-01-01T00:01:03.000Z') }))
      .resolves.toMatchObject({
        invocationId: abandoned.id,
        canonicalInput: { version: 7, productId: 'product-abandoned' },
        ownerIdempotencyKey: 'owner-key-abandoned',
        leaseOwner: 'recovery-worker',
      });
    await expect(prisma.agentCapabilityApproval.findUnique({ where: { id: pending.id }, select: { status: true } })).resolves.toEqual({ status: 'pending' });
    await expect(prisma.agentTask.findUnique({ where: { id: admitted.task.id }, select: { status: true } })).resolves.toEqual({ status: 'open' });
  });

  it('continues from process interruption by admitting a new immutable Attempt instead of resuming provider state', async () => {
    const admitted = await root();
    await prisma.agentAttempt.update({
      where: { id: admitted.attempt.id },
      data: {
        status: 'running',
        startedAt: new Date('2030-01-01T00:00:00.000Z'),
        inputTokens: 17,
        outputTokens: 31,
      },
    });
    await work.reconcile({ applicationVersion: '1.0.0', authorizingGitSha: gitSha, now: new Date('2030-01-01T00:00:02.000Z') });

    const continued = await work.admitAttempt({
      organizationId,
      sessionId: admitted.session.id,
      taskId: admitted.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: admitted.attempt.id,
      input: { continuation: 'Start a new local CLI process from the durable Task context.' },
      applicationVersion: '1.0.0',
      authorizingGitSha: gitSha,
      cliVersion: '1.0.0',
      reportedModel: 'fresh-model-selection',
    });
    const [predecessor, successor] = await Promise.all([
      prisma.agentAttempt.findUniqueOrThrow({
        where: { id: admitted.attempt.id },
        select: { id: true, status: true, inputTokens: true, outputTokens: true, finishedAt: true },
      }),
      prisma.agentAttempt.findUniqueOrThrow({
        where: { id: continued.attemptId },
        select: {
          id: true, ordinal: true, predecessorAttemptId: true, status: true,
          input: true, reportedModel: true, result: true, error: true,
          inputTokens: true, outputTokens: true, startedAt: true,
        },
      }),
    ]);

    expect(predecessor).toMatchObject({
      id: admitted.attempt.id,
      status: 'process_interrupted',
      inputTokens: 17,
      outputTokens: 31,
      finishedAt: new Date('2030-01-01T00:00:02.000Z'),
    });
    expect(successor).toEqual({
      id: continued.attemptId,
      ordinal: 2,
      predecessorAttemptId: admitted.attempt.id,
      status: 'starting',
      input: { continuation: 'Start a new local CLI process from the durable Task context.' },
      reportedModel: 'fresh-model-selection',
      result: null,
      error: null,
      inputTokens: null,
      outputTokens: null,
      startedAt: null,
    });
  });

  it('sweeps an authorized inline read left under an already terminal Attempt during restart recovery', async () => {
    const admitted = await root();
    const read = await invocation(admitted, 'authorized', ['read'], 'terminal-inline-read');
    const mutation = await invocation(admitted, 'ready', ['db_write'], 'terminal-durable-mutation');
    await prisma.agentAttempt.update({
      where: { id: admitted.attempt.id },
      data: { status: 'failed', finishedAt: new Date('2030-01-01T00:00:00.000Z') },
    });

    await expect(work.reconcile({
      applicationVersion: '1.0.0',
      authorizingGitSha: gitSha,
      now: new Date('2030-01-01T00:00:01.000Z'),
    })).resolves.toEqual({ reconciled: 0, attemptIds: [] });

    await expect(prisma.agentCapabilityInvocation.findMany({
      where: { id: { in: [read.id, mutation.id] } },
      select: { id: true, status: true, error: true },
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: read.id,
        status: 'failed',
        error: {
          code: 'process_interrupted',
          message: 'Inline read was interrupted before completion.',
        },
      }),
      expect.objectContaining({ id: mutation.id, status: 'ready', error: null }),
    ]));
  });

  it('keeps an already-ready mutation claimable after Task cancellation while rejecting a new attempt admission', async () => {
    const admitted = await root();
    const ready = await invocation(admitted, 'ready', ['db_write'], 'cancelled-ready');
    await work.transitionTask({ organizationId, sessionId: admitted.session.id, taskId: admitted.task.id, requestedByUserId: userId, to: 'cancelled', at: new Date('2030-01-01T00:00:00.000Z') });
    await expect(prisma.agentCapabilityInvocation.findUnique({ where: { id: ready.id }, select: { status: true } })).resolves.toEqual({ status: 'ready' });
    await expect(work.claimMutation({ workerId: 'cancel-worker', claimedAt: new Date('2030-01-01T00:00:01.000Z'), leaseExpiresAt: new Date('2030-01-01T00:01:01.000Z') })).resolves.toMatchObject({ invocationId: ready.id, canonicalInput: { version: 7, productId: 'product-cancelled-ready' }, ownerIdempotencyKey: 'owner-key-cancelled-ready' });
    await expect(work.admitAttempt({ organizationId, sessionId: admitted.session.id, taskId: admitted.task.id, requestedByUserId: userId, predecessorAttemptId: admitted.attempt.id, input: {}, applicationVersion: '1.0.0', authorizingGitSha: gitSha, cliVersion: '1.0.0' })).rejects.toMatchObject({ code: 'task_not_open' });
  });
});
