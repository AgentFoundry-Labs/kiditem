import { describe, expect, it, vi } from 'vitest';
import {
  loadHermesResumeSession,
  persistHermesRuntimeThread,
  readRuntimeThreadId,
} from '../hermes-task-session';

describe('Hermes task session helpers', () => {
  it('reads a trimmed runtimeThreadId from task session metadata', () => {
    expect(readRuntimeThreadId({ runtimeThreadId: ' hermes-session-1 ' })).toBe(
      'hermes-session-1',
    );
    expect(readRuntimeThreadId({ runtimeThreadId: '' })).toBeNull();
    expect(readRuntimeThreadId({ runtimeThreadId: 123 })).toBeNull();
  });

  it('loads the resume session through the repository organization boundary', async () => {
    const repository = {
      getTaskSession: vi.fn().mockResolvedValue({
        metadata: { runtimeThreadId: 'hermes-session-2' },
      }),
    };

    await expect(
      loadHermesResumeSession({
        repository,
        organizationId: 'org-1',
        taskSessionId: 'task-session-1',
      }),
    ).resolves.toBe('hermes-session-2');

    expect(repository.getTaskSession).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
    });
  });

  it('persists a returned session id as runtimeThreadId and skips empty ids', async () => {
    const repository = {
      updateTaskSessionMetadata: vi.fn().mockResolvedValue({}),
    };

    await persistHermesRuntimeThread({
      repository,
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
      sessionId: ' hermes-session-next ',
    });
    await persistHermesRuntimeThread({
      repository,
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
      sessionId: null,
    });

    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledTimes(1);
    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
      metadata: { runtimeThreadId: 'hermes-session-next' },
    });
  });
});
