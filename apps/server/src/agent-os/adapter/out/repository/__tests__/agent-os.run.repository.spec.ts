import { describe, expect, it, vi } from 'vitest';
import { AgentOsRunRepository } from '../agent-os.run.repository';

const now = new Date('2026-05-31T00:00:00.000Z');

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    organizationId: 'org-1',
    agentInstanceId: 'agent-1',
    requestId: 'request-1',
    taskSessionId: 'session-1',
    retryOfRunId: null,
    status: 'running',
    attempt: 1,
    invocationSource: 'test',
    adapterType: 'claude_local',
    model: 'gpt-test',
    provider: null,
    taskKey: 'test',
    startedAt: now,
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    output: null,
    lastEventSeq: 0,
    ...overrides,
  };
}

describe('AgentOsRunRepository', () => {
  it('does not create a run when cancellation wins the claimed-request lock', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      agentTaskSession: {
        findFirst: vi.fn(),
      },
      agentRun: {
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsRunRepository(prisma as never);

    const result = await repository.createRunForClaimedRequest({
      organizationId: 'org-1',
      agentInstanceId: 'agent-1',
      requestId: 'request-1',
      taskSessionId: 'session-1',
      attempt: 1,
      invocationSource: 'test',
      adapterType: 'claude_local',
      model: 'gpt-test',
      input: { prompt: 'test' },
    });

    expect(result).toBeNull();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [queryParts, ...queryValues] = tx.$queryRaw.mock.calls[0] ?? [];
    const query = (queryParts as string[]).join(' ');
    expect(query).toContain('"status" = \'claimed\'');
    expect(query).toContain('FOR UPDATE');
    expect(queryValues).toEqual([
      'request-1',
      'org-1',
      'agent-1',
      'session-1',
    ]);
    expect(tx.agentTaskSession.findFirst).not.toHaveBeenCalled();
    expect(tx.agentRun.create).not.toHaveBeenCalled();
  });

  it('creates the run inside the transaction while the claimed row is locked', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'request-1' }]),
      agentTaskSession: {
        findFirst: vi.fn().mockResolvedValue({ taskKey: 'session-task' }),
      },
      agentRun: {
        create: vi.fn().mockResolvedValue(runRow()),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsRunRepository(prisma as never);

    const result = await repository.createRunForClaimedRequest({
      organizationId: 'org-1',
      agentInstanceId: 'agent-1',
      requestId: 'request-1',
      taskSessionId: 'session-1',
      attempt: 1,
      invocationSource: 'test',
      adapterType: 'claude_local',
      model: 'gpt-test',
      input: { prompt: 'test' },
    });

    expect(result).toMatchObject({ id: 'run-1', status: 'running' });
    expect(tx.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        requestId: 'request-1',
        taskKey: 'session-task',
      }),
    });
  });

  it('finalizes the run without overwriting a request that is waiting for approval', async () => {
    const tx = {
      agentRun: {
        findFirst: vi.fn().mockResolvedValue(runRow()),
        update: vi.fn().mockResolvedValue(runRow({ status: 'succeeded' })),
      },
      agentRunRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'request-1',
          status: 'requires_approval',
        }),
        updateMany: vi.fn(),
      },
      agentRuntimeState: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsRunRepository(prisma as never);

    const result = await repository.finalizeRun({
      organizationId: 'org-1',
      requestId: 'request-1',
      runId: 'run-1',
      status: 'succeeded',
      output: { status: 'waiting_approval' },
    });

    expect(result.requestStatus).toBe('requires_approval');
    expect(tx.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'succeeded',
          output: { status: 'waiting_approval' },
        }),
      }),
    );
    expect(tx.agentRunRequest.updateMany).not.toHaveBeenCalled();
  });
});
