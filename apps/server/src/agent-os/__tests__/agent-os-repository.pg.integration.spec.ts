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

async function seedRun(organizationId: string, label: string) {
  const blueprint = await repository.upsertBlueprint({
    type: 'boundary_test',
    name: 'Boundary Test',
    promptPath: 'agent-config/prompts/agents/manager.md',
    defaultAdapterType: 'claude_local',
    defaultModel: 'test-model',
  });
  const instance = await repository.createInstanceWithRuntimeState({
    organizationId,
    blueprintId: blueprint.id,
    type: 'boundary_test',
    name: `${label} agent`,
    adapterType: 'claude_local',
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
    source: 'test.boundary',
    payload: { label },
    scheduledFor: new Date(),
  });
  const run = await repository.createRunForRequest({
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
  return { blueprint, instance, session, request, run };
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
    expect(request.status).toBe('pending');
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
    expect(request.status).toBe('pending');
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
    expect(request.status).toBe('pending');
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
