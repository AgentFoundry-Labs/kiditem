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
