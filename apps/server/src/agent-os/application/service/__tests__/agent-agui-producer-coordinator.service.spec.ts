import { EventType } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentAguiProducerCoordinator } from '../agent-agui-producer-coordinator.service';

describe('AgentAguiProducerCoordinator', () => {
  it('shares one producer and rejects reuse after terminal completion', async () => {
    const coordinator = new AgentAguiProducerCoordinator();
    const factory = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' };
      },
    }));
    const first = coordinator.attach('operator:thread-1:run-1', factory);
    const second = coordinator.attach('operator:thread-1:run-1', factory);

    await expect(first[Symbol.asyncIterator]().next()).resolves.toMatchObject({ done: false });
    await expect(second[Symbol.asyncIterator]().next()).resolves.toMatchObject({ done: false });
    expect(factory).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(() => coordinator.attach('operator:thread-1:run-1', factory))
        .toThrow('already completed');
    });
  });
});
