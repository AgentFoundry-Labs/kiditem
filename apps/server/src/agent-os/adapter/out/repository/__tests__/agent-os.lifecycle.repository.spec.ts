import { describe, expect, it, vi } from 'vitest';
import { AgentOsRunLifecycleRepository } from '../agent-os.lifecycle.repository';

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

describe('AgentOsRunLifecycleRepository', () => {
  it('changes only a still-claimed request during pre-run failure', async () => {
    const prisma = {
      agentRunRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

    await expect(repository.failClaimedRequest({
      organizationId: 'org-1',
      requestId: 'request-1',
      errorCode: 'model_required',
      errorMessage: 'Model is required.',
    })).resolves.toBe(false);

    expect(prisma.agentRunRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'request-1',
          organizationId: 'org-1',
          status: 'claimed',
        },
      }),
    );
  });

  it('cancels the request and matching running run under one transaction', async () => {
    const cancelledRun = runRow({
      status: 'cancelled',
      errorCode: 'user_cancelled',
      errorMessage: 'User cancelled the request.',
      finishedAt: new Date('2026-05-31T00:01:00.000Z'),
    });
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'request-1' }])
        .mockResolvedValueOnce([{ id: 'run-1' }]),
      agentRunRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      agentRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue(cancelledRun),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

    const result = await repository.cancelRequestAndRun({
      organizationId: 'org-1',
      requestId: 'request-1',
      expectedRunId: 'run-1',
      currentRequestStatuses: ['pending', 'claimed', 'requires_approval'],
      errorCode: 'user_cancelled',
      errorMessage: 'User cancelled the request.',
      payload: { operationCancellation: { result: 'cancelled' } },
    });

    expect(result).toMatchObject({
      requestId: 'request-1',
      run: expect.objectContaining({ id: 'run-1', status: 'cancelled' }),
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect((tx.$queryRaw.mock.calls[0]?.[0] as string[]).join(' ')).toContain(
      'agent_run_requests',
    );
    expect((tx.$queryRaw.mock.calls[1]?.[0] as string[]).join(' ')).toContain(
      'agent_runs',
    );
    expect(tx.agentRunRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.agentRun.updateMany).toHaveBeenCalledTimes(1);
  });

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
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

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
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

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

  it('locks request then run and preserves a reconciliation terminal state', async () => {
    const reconciledRun = runRow({
      status: 'failed',
      errorCode: 'process_interrupted',
      errorMessage: 'Interrupted during restart reconciliation.',
      finishedAt: new Date('2026-05-31T00:01:00.000Z'),
    });
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'request-1', status: 'failed' }])
        .mockResolvedValueOnce([reconciledRun]),
      agentRun: {
        findFirst: vi.fn().mockResolvedValue(reconciledRun),
        updateMany: vi.fn(),
      },
      agentRunRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'request-1',
          status: 'failed',
        }),
        updateMany: vi.fn(),
      },
      agentRuntimeState: {
        update: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

    const result = await repository.finalizeRun({
      organizationId: 'org-1',
      requestId: 'request-1',
      runId: 'run-1',
      status: 'succeeded',
      nextRequestStatus: 'succeeded',
      output: { stale: true },
    });

    expect(result).toMatchObject({
      finalized: false,
      requestStatus: 'failed',
      run: expect.objectContaining({
        status: 'failed',
        errorCode: 'process_interrupted',
      }),
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const requestLock = (tx.$queryRaw.mock.calls[0]?.[0] as string[]).join(' ');
    const runLock = (tx.$queryRaw.mock.calls[1]?.[0] as string[]).join(' ');
    expect(requestLock).toContain('"agent_run_requests"');
    expect(requestLock).toContain('FOR UPDATE');
    expect(runLock).toContain('"agent_runs"');
    expect(runLock).toContain('FOR UPDATE');
    expect(tx.agentRun.updateMany).not.toHaveBeenCalled();
    expect(tx.agentRunRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.agentRuntimeState.update).not.toHaveBeenCalled();
  });

  it('finalizes the run without overwriting a request that is waiting for approval', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'request-1', status: 'requires_approval' },
        ])
        .mockResolvedValueOnce([runRow()]),
      agentRun: {
        findFirst: vi.fn().mockResolvedValue(runRow()),
        update: vi.fn().mockResolvedValue(runRow({ status: 'succeeded' })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi
          .fn()
          .mockResolvedValue(runRow({ status: 'succeeded' })),
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
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

    const result = await repository.finalizeRun({
      organizationId: 'org-1',
      requestId: 'request-1',
      runId: 'run-1',
      status: 'succeeded',
      nextRequestStatus: 'succeeded',
      output: { status: 'waiting_approval' },
    });

    expect(result).toMatchObject({
      finalized: true,
      requestStatus: 'requires_approval',
      run: expect.objectContaining({ status: 'succeeded' }),
    });
    expect(tx.agentRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'running' }),
        data: expect.objectContaining({
          status: 'succeeded',
          output: { status: 'waiting_approval' },
        }),
      }),
    );
    expect(tx.agentRunRequest.updateMany).not.toHaveBeenCalled();
  });

  it('requeues a retryable failure in the same transaction that fails the run', async () => {
    const failedRun = runRow({
      status: 'failed',
      errorCode: 'transient_error',
      errorMessage: 'Temporarily unavailable.',
      finishedAt: new Date('2026-05-31T00:01:00.000Z'),
    });
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'request-1', status: 'claimed' }])
        .mockResolvedValueOnce([runRow()]),
      agentRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue(failedRun),
      },
      agentRunRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      agentRuntimeState: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsRunLifecycleRepository(prisma as never);

    const result = await repository.finalizeRun({
      organizationId: 'org-1',
      requestId: 'request-1',
      runId: 'run-1',
      status: 'failed',
      nextRequestStatus: 'pending',
      errorCode: 'transient_error',
      errorMessage: 'Temporarily unavailable.',
    });

    expect(result).toMatchObject({
      finalized: true,
      requestStatus: 'pending',
      run: expect.objectContaining({ status: 'failed' }),
    });
    expect(tx.agentRunRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        organizationId: 'org-1',
        status: 'claimed',
      },
      data: expect.objectContaining({
        status: 'pending',
        claimedAt: null,
        claimedBy: null,
        finishedAt: null,
        lastErrorCode: 'transient_error',
      }),
    });
  });

});
