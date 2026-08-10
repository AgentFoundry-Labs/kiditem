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

let prisma: PrismaClient | null = null;
let repository: AgentOsRepositoryAdapter;

async function seedRequest(input: {
  organizationId: string;
  label: string;
  source: string;
  status?: 'pending' | 'claimed' | 'running';
}) {
  const instance = await repository.createInstanceWithRuntimeState({
    organizationId: input.organizationId,
    type: `reconcile_${input.label}`,
    name: `${input.label} agent`,
    adapterType: 'codex_cli',
    modelOverride: 'gpt-test',
  });
  const session = await repository.ensureTaskSession({
    organizationId: input.organizationId,
    agentInstanceId: instance.id,
    adapterType: 'codex_cli',
    taskKey: input.label,
  });
  const request = await repository.createRunRequest({
    organizationId: input.organizationId,
    agentInstanceId: instance.id,
    taskSessionId: session.id,
    source: input.source,
    payload: { label: input.label },
    scheduledFor: new Date('2026-08-09T00:00:00.000Z'),
    maxAttempts: 1,
  });
  if (!input.status || input.status === 'pending') {
    return { instance, session, request, run: null };
  }
  const claimed = await repository.claimRunRequestById({
    workerId: 'inline-test',
    now: new Date('2026-08-10T00:00:00.000Z'),
    organizationId: input.organizationId,
    requestId: request.id,
  });
  if (!claimed) throw new Error('Failed to claim seeded request');
  if (input.status === 'claimed') {
    return { instance, session, request: claimed, run: null };
  }
  const run = await repository.createRunForClaimedRequest({
    organizationId: input.organizationId,
    agentInstanceId: instance.id,
    requestId: request.id,
    taskSessionId: session.id,
    attempt: 1,
    invocationSource: input.source,
    adapterType: 'codex_cli',
    model: 'gpt-test',
    input: { label: input.label },
  });
  if (!run) throw new Error('Failed to create run for claimed request');
  return { instance, session, request: claimed, run };
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

describe('Agent OS inline dashboard interruption lifecycle', () => {
  it('keeps dashboard requests out of generic claims', async () => {
    const dashboard = await seedRequest({
      organizationId: TEST_ORGANIZATION_ID,
      label: 'dashboard',
      source: 'sourcing_dashboard',
    });
    const generic = await seedRequest({
      organizationId: TEST_ORGANIZATION_ID,
      label: 'generic',
      source: 'test.generic',
    });

    const claimed = await repository.claimNextRunRequest({
      workerId: 'worker-generic',
      now: new Date('2026-08-10T00:00:00.000Z'),
      organizationId: TEST_ORGANIZATION_ID,
      excludedSources: ['sourcing_dashboard'],
    });

    expect(claimed?.id).toBe(generic.request.id);
    expect(
      await prisma!.agentRunRequest.findUniqueOrThrow({
        where: { id: dashboard.request.id },
      }),
    ).toMatchObject({ status: 'pending', claimedBy: null });
  });

  it('atomically fails stale pending, claimed, and running dashboard work without requeueing', async () => {
    const pending = await seedRequest({
      organizationId: TEST_ORGANIZATION_ID,
      label: 'pending',
      source: 'sourcing_dashboard',
    });
    const claimed = await seedRequest({
      organizationId: TEST_ORGANIZATION_ID,
      label: 'claimed',
      source: 'sourcing_dashboard',
      status: 'claimed',
    });
    const running = await seedRequest({
      organizationId: OTHER_ORGANIZATION_ID,
      label: 'running',
      source: 'sourcing_dashboard',
      status: 'running',
    });
    const unrelated = await seedRequest({
      organizationId: OTHER_ORGANIZATION_ID,
      label: 'unrelated',
      source: 'test.generic',
    });

    const interrupted = await repository.failInterruptedInlineRuns({
      source: 'sourcing_dashboard',
      requestStatuses: ['pending', 'claimed', 'requires_approval'],
      createdBefore: new Date('2026-08-11T00:00:00.000Z'),
      errorCode: 'process_interrupted',
      errorMessage: 'Inline process interrupted.',
      limit: 100,
    });

    expect(interrupted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: TEST_ORGANIZATION_ID,
          requestId: pending.request.id,
          runId: null,
        }),
        expect.objectContaining({
          organizationId: TEST_ORGANIZATION_ID,
          requestId: claimed.request.id,
          runId: null,
        }),
        expect.objectContaining({
          organizationId: OTHER_ORGANIZATION_ID,
          requestId: running.request.id,
          runId: running.run!.id,
        }),
      ]),
    );
    const rows = await prisma!.agentRunRequest.findMany({
      where: { id: { in: [pending.request.id, claimed.request.id, running.request.id] } },
      orderBy: { id: 'asc' },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === 'failed')).toBe(true);
    expect(rows.every((row) => row.lastErrorCode === 'process_interrupted')).toBe(
      true,
    );
    expect(rows.some((row) => row.status === 'pending')).toBe(false);

    expect(
      await prisma!.agentRun.findUniqueOrThrow({ where: { id: running.run!.id } }),
    ).toMatchObject({
      organizationId: OTHER_ORGANIZATION_ID,
      status: 'failed',
      errorCode: 'process_interrupted',
    });
    expect(
      await prisma!.agentRunRequest.findUniqueOrThrow({
        where: { id: unrelated.request.id },
      }),
    ).toMatchObject({ status: 'pending', lastErrorCode: null });
  });
});
