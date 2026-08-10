import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { AgentOsRepositoryAdapter } from '../adapter/out/repository/agent-os.repository.adapter';
import { AgentOsBoundaryError } from '../domain/agent-os.errors';

let prisma: PrismaClient | null = null;
let repository: AgentOsRepositoryAdapter;

async function seedClaimedRequest(
  organizationId: string,
  label: string,
  source = 'test.boundary',
) {
  const instance = await repository.createInstanceWithRuntimeState({
    organizationId,
    type: 'boundary_test',
    name: `${label} agent`,
    adapterType: 'claude_local',
    modelOverride: 'test-model',
  });
  const session = await repository.ensureTaskSession({
    organizationId,
    agentInstanceId: instance.id,
    adapterType: 'claude_local',
    taskKey: 'default',
  });
  const request = await repository.createRunRequest({
    organizationId,
    agentInstanceId: instance.id,
    taskSessionId: session.id,
    source,
    payload: { label },
    scheduledFor: new Date(),
  });
  const claimed = await repository.claimRunRequestById({
    workerId: 'boundary-test',
    now: new Date(),
    organizationId,
    requestId: request.id,
  });
  if (!claimed) throw new Error('Failed to claim seeded request');
  return { instance, session, request: claimed };
}

async function waitForLockWaiters(minimum: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await prisma!.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "pg_stat_activity"
      WHERE "datname" = current_database()
        AND "pid" <> pg_backend_pid()
        AND "wait_event_type" = 'Lock'
    `;
    if ((row?.count ?? 0) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${minimum} PostgreSQL lock waiters`);
}

async function seedRun(organizationId: string, label: string) {
  const { instance, session, request } = await seedClaimedRequest(
    organizationId,
    label,
  );
  const run = await repository.createRunForClaimedRequest({
    organizationId,
    agentInstanceId: instance.id,
    requestId: request.id,
    taskSessionId: session.id,
    attempt: 1,
    invocationSource: 'test',
    adapterType: 'claude_local',
    model: 'test-model',
    input: { label },
  });
  if (!run) throw new Error('Failed to create run for claimed request');
  return { instance, session, request, run };
}

beforeAll(async () => {
  prisma = makeTestPrisma();
  repository = new AgentOsRepositoryAdapter(prisma as never);
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
});

describe('AgentOsRepositoryAdapter organization boundary', () => {
  it.each(['succeeded', 'failed'] as const)(
    'cannot overwrite reconciliation when a stale executor finalizes $status',
    async (status) => {
      const { instance, session, request } = await seedClaimedRequest(
        TEST_ORGANIZATION_ID,
        `finalize-${status}`,
        'sourcing_dashboard',
      );
      const run = await repository.createRunForClaimedRequest({
        organizationId: TEST_ORGANIZATION_ID,
        agentInstanceId: instance.id,
        requestId: request.id,
        taskSessionId: session.id,
        attempt: request.attempts,
        invocationSource: request.source,
        adapterType: request.adapterType,
        model: 'test-model',
        input: request.payload,
      });
      if (!run) throw new Error('Failed to create seeded running run');

      let runLocked = () => undefined;
      const blockerReady = new Promise<void>((resolve) => {
        runLocked = resolve;
      });
      let releaseRun = () => undefined;
      const holdRun = new Promise<void>((resolve) => {
        releaseRun = resolve;
      });
      const blocker = prisma!.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "agent_runs"
          WHERE "id" = ${run.id}::uuid
          FOR UPDATE
        `;
        runLocked();
        await holdRun;
      });
      await blockerReady;

      const reconciliation = repository.failInterruptedInlineRuns({
        source: 'sourcing_dashboard',
        requestStatuses: ['pending', 'claimed'],
        createdBefore: new Date(Date.now() + 1_000),
        errorCode: 'process_interrupted',
        errorMessage: 'Inline Agent OS process was interrupted before completion.',
        limit: 100,
      });
      let finalization: ReturnType<typeof repository.finalizeRun> | null = null;
      try {
        await waitForLockWaiters(1);
        finalization = repository.finalizeRun({
          organizationId: TEST_ORGANIZATION_ID,
          requestId: request.id,
          runId: run.id,
          status,
          ...(status === 'succeeded'
            ? { output: { stale: true } }
            : {
                errorCode: 'old_runtime_failed',
                errorMessage: 'Old runtime failed after restart.',
              }),
        });
        await waitForLockWaiters(2);
      } finally {
        releaseRun();
        await blocker;
      }
      if (!finalization) throw new Error('Late finalization did not start');

      await expect(reconciliation).resolves.toEqual([
        expect.objectContaining({ requestId: request.id, runId: run.id }),
      ]);
      await expect(finalization).resolves.toMatchObject({
        finalized: false,
        requestStatus: 'failed',
        run: expect.objectContaining({
          status: 'failed',
          errorCode: 'process_interrupted',
        }),
      });
      await expect(
        prisma!.agentRunRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
      ).resolves.toMatchObject({
        status: 'failed',
        lastErrorCode: 'process_interrupted',
      });
      await expect(
        prisma!.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
      ).resolves.toMatchObject({
        status: 'failed',
        errorCode: 'process_interrupted',
        output: null,
      });
    },
  );

  it('does not create a run when cancellation commits before the claimed-request lock', async () => {
    const { instance, session, request } = await seedClaimedRequest(
      TEST_ORGANIZATION_ID,
      'cancel-race',
    );
    let cancellationLocked = () => undefined;
    const lockHeld = new Promise<void>((resolve) => {
      cancellationLocked = resolve;
    });
    let releaseCancellation = () => undefined;
    const holdCancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const cancellation = prisma!.$transaction(async (tx) => {
      const updated = await tx.agentRunRequest.updateMany({
        where: {
          id: request.id,
          organizationId: TEST_ORGANIZATION_ID,
          status: 'claimed',
        },
        data: {
          status: 'cancelled',
          lastErrorCode: 'user_cancelled',
          finishedAt: new Date(),
        },
      });
      expect(updated.count).toBe(1);
      cancellationLocked();
      await holdCancellation;
    });
    await lockHeld;

    const runCreation = repository.createRunForClaimedRequest({
      organizationId: TEST_ORGANIZATION_ID,
      agentInstanceId: instance.id,
      requestId: request.id,
      taskSessionId: session.id,
      attempt: request.attempts,
      invocationSource: request.source,
      adapterType: request.adapterType,
      model: 'test-model',
      input: request.payload,
    });
    releaseCancellation();
    await cancellation;

    await expect(runCreation).resolves.toBeNull();
    await expect(
      prisma!.agentRun.count({ where: { requestId: request.id } }),
    ).resolves.toBe(0);
  });

  it('does not finalize another organization run before checking scope', async () => {
    const other = await seedRun(OTHER_ORGANIZATION_ID, 'other');

    await expect(
      repository.finalizeRun({
        organizationId: TEST_ORGANIZATION_ID,
        requestId: other.request.id,
        runId: other.run.id,
        status: 'succeeded',
        output: { ok: true },
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);

    const run = await prisma!.agentRun.findUniqueOrThrow({ where: { id: other.run.id } });
    const request = await prisma!.agentRunRequest.findUniqueOrThrow({ where: { id: other.request.id } });
    expect(run.status).toBe('running');
    expect(run.output).toBeNull();
    expect(request.status).toBe('claimed');
  });

  it('does not append events to another organization run', async () => {
    const other = await seedRun(OTHER_ORGANIZATION_ID, 'other');

    await expect(
      repository.appendRunEvent({
        organizationId: TEST_ORGANIZATION_ID,
        agentInstanceId: other.instance.id,
        runId: other.run.id,
        type: 'started',
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);

    const run = await prisma!.agentRun.findUniqueOrThrow({ where: { id: other.run.id } });
    expect(run.lastEventSeq).toBe(0);
    expect(await prisma!.agentRunEvent.count()).toBe(0);
  });

  it('does not append events with a mismatched agent instance', async () => {
    const mine = await seedRun(TEST_ORGANIZATION_ID, 'mine');
    const other = await seedRun(OTHER_ORGANIZATION_ID, 'other');

    await expect(
      repository.appendRunEvent({
        organizationId: TEST_ORGANIZATION_ID,
        agentInstanceId: other.instance.id,
        runId: mine.run.id,
        type: 'started',
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);

    const run = await prisma!.agentRun.findUniqueOrThrow({ where: { id: mine.run.id } });
    expect(run.lastEventSeq).toBe(0);
    expect(await prisma!.agentRunEvent.count()).toBe(0);
  });

  it('does not create approvals against another organization request', async () => {
    const other = await seedRun(OTHER_ORGANIZATION_ID, 'other');

    await expect(
      repository.createApprovalRequest({
        organizationId: TEST_ORGANIZATION_ID,
        agentInstanceId: other.instance.id,
        requestId: other.request.id,
        runId: other.run.id,
        prompt: 'Approve?',
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);

    const request = await prisma!.agentRunRequest.findUniqueOrThrow({ where: { id: other.request.id } });
    expect(request.status).toBe('claimed');
    expect(await prisma!.agentApprovalRequest.count()).toBe(0);
  });

  it('does not create approvals with a mismatched agent instance', async () => {
    const mine = await seedRun(TEST_ORGANIZATION_ID, 'mine');
    const other = await seedRun(OTHER_ORGANIZATION_ID, 'other');

    await expect(
      repository.createApprovalRequest({
        organizationId: TEST_ORGANIZATION_ID,
        agentInstanceId: other.instance.id,
        requestId: mine.request.id,
        runId: mine.run.id,
        prompt: 'Approve?',
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);

    const request = await prisma!.agentRunRequest.findUniqueOrThrow({ where: { id: mine.request.id } });
    expect(request.status).toBe('claimed');
    expect(await prisma!.agentApprovalRequest.count()).toBe(0);
  });

  it('does not resolve another organization approval', async () => {
    const other = await seedRun(OTHER_ORGANIZATION_ID, 'other');
    const approval = await repository.createApprovalRequest({
      organizationId: OTHER_ORGANIZATION_ID,
      agentInstanceId: other.instance.id,
      requestId: other.request.id,
      runId: other.run.id,
      prompt: 'Approve?',
    });

    await expect(
      repository.resolveApprovalRequest({
        organizationId: TEST_ORGANIZATION_ID,
        approvalRequestId: approval.id,
        status: 'approved',
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);

    const row = await prisma!.agentApprovalRequest.findUniqueOrThrow({ where: { id: approval.id } });
    const request = await prisma!.agentRunRequest.findUniqueOrThrow({ where: { id: other.request.id } });
    expect(row.status).toBe('pending');
    expect(row.decidedAt).toBeNull();
    expect(request.status).toBe('requires_approval');
  });
});
