import { describe, expect, it, vi } from 'vitest';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';
import { AgentOsInstanceSessionRepository } from '../agent-os.instance-session.repository';

const taskSessionRow = {
  id: 'session-1',
  organizationId: 'org-1',
  agentInstanceId: 'agent-1',
  adapterType: 'claude_local',
  taskKey: 'conversation:conversation-1',
  title: null,
  metadata: { retained: true },
  sessionDisplay: null,
  lastRunId: null,
  lastError: null,
};

describe('AgentOsInstanceSessionRepository task session metadata', () => {
  it('reads a task session by organization scope and id', async () => {
    const prisma = {
      agentTaskSession: {
        findFirst: vi.fn().mockResolvedValue(taskSessionRow),
      },
    };
    const repository = new AgentOsInstanceSessionRepository(prisma as never);

    const result = await repository.getTaskSession({
      organizationId: 'org-1',
      taskSessionId: 'session-1',
    });

    expect(result?.metadata).toEqual({ retained: true });
    expect(prisma.agentTaskSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', organizationId: 'org-1' },
    });
  });

  it('merges runtime thread metadata without deleting unrelated keys', async () => {
    const prisma = {
      agentTaskSession: {
        findFirst: vi.fn().mockResolvedValue({
          ...taskSessionRow,
          metadata: { retained: true, runtimeThreadId: 'old-thread' },
        }),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...taskSessionRow, metadata: data.metadata }),
        ),
      },
    };
    const repository = new AgentOsInstanceSessionRepository(prisma as never);

    const result = await repository.updateTaskSessionMetadata({
      organizationId: 'org-1',
      taskSessionId: 'session-1',
      metadata: { runtimeThreadId: 'thread-2' },
    });

    expect(result.metadata).toEqual({
      retained: true,
      runtimeThreadId: 'thread-2',
    });
    expect(prisma.agentTaskSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        metadata: {
          retained: true,
          runtimeThreadId: 'thread-2',
        },
      },
    });
  });

  it('clears runtime thread metadata with null', async () => {
    const prisma = {
      agentTaskSession: {
        findFirst: vi.fn().mockResolvedValue({
          ...taskSessionRow,
          metadata: { retained: true, runtimeThreadId: 'thread-2' },
        }),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...taskSessionRow, metadata: data.metadata }),
        ),
      },
    };
    const repository = new AgentOsInstanceSessionRepository(prisma as never);

    const result = await repository.updateTaskSessionMetadata({
      organizationId: 'org-1',
      taskSessionId: 'session-1',
      metadata: { runtimeThreadId: null },
    });

    expect(result.metadata).toEqual({
      retained: true,
      runtimeThreadId: null,
    });
  });

  it('fails when updating a task session outside the organization boundary', async () => {
    const repository = new AgentOsInstanceSessionRepository({
      agentTaskSession: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as never);

    await expect(
      repository.updateTaskSessionMetadata({
        organizationId: 'org-2',
        taskSessionId: 'session-1',
        metadata: { runtimeThreadId: 'thread-2' },
      }),
    ).rejects.toBeInstanceOf(AgentOsBoundaryError);
  });
});
