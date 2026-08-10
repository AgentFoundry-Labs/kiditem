import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AgentLocalProcessRegistry } from '../agent-local-process-registry';

function childWithPid(pid: number) {
  const child = new EventEmitter() as EventEmitter & { pid: number };
  child.pid = pid;
  return child;
}

describe('AgentLocalProcessRegistry', () => {
  it('waits for the registered process group to close after SIGTERM', async () => {
    const killProcessGroup = vi.fn();
    const registry = new AgentLocalProcessRegistry({
      capacity: 2,
      capacityWaitMs: 5_000,
      killGraceMs: 2_000,
      killProcessGroup,
    });
    const child = childWithPid(321);
    registry.attach('run-1', child as never);

    const cancellation = registry.cancel('run-1', 'user_cancelled');
    let settled = false;
    void cancellation.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(killProcessGroup).toHaveBeenCalledWith(321, 'SIGTERM');
    expect(registry.reasonFor('run-1')).toBe('user_cancelled');
    expect(settled).toBe(false);

    child.emit('close', 0);
    await expect(cancellation).resolves.toBe(true);
  });

  it('waits for close after the SIGKILL fallback', async () => {
    vi.useFakeTimers();
    try {
      const killProcessGroup = vi.fn();
      const registry = new AgentLocalProcessRegistry({
        capacity: 2,
        capacityWaitMs: 5_000,
        killGraceMs: 20,
        killProcessGroup,
      });
      const child = childWithPid(456);
      registry.attach('run-1', child as never);

      const cancellation = registry.cancel('run-1', 'user_cancelled');
      await vi.advanceTimersByTimeAsync(20);
      expect(killProcessGroup).toHaveBeenNthCalledWith(1, 456, 'SIGTERM');
      expect(killProcessGroup).toHaveBeenNthCalledWith(2, 456, 'SIGKILL');

      let settled = false;
      void cancellation.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      child.emit('close', null, 'SIGKILL');
      await expect(cancellation).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves after a bounded post-SIGKILL deadline when close never arrives', async () => {
    vi.useFakeTimers();
    try {
      const registry = new AgentLocalProcessRegistry({
        capacity: 2,
        capacityWaitMs: 5_000,
        killGraceMs: 20,
        killExitWaitMs: 30,
        killProcessGroup: vi.fn(),
      });
      registry.attach('run-1', childWithPid(789) as never);

      const cancellation = registry.cancel('run-1', 'user_cancelled');
      await vi.advanceTimersByTimeAsync(49);
      let settled = false;
      void cancellation.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(cancellation).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects capacity waits with the stable busy code', async () => {
    const registry = new AgentLocalProcessRegistry({
      capacity: 1,
      capacityWaitMs: 5,
      killGraceMs: 2_000,
      killProcessGroup: vi.fn(),
    });
    const release = await registry.acquire('run-1');

    await expect(registry.acquire('run-2')).rejects.toMatchObject({ code: 'busy' });
    release();
  });

  it('reserves released capacity for the next queued run before allowing a new run', async () => {
    const registry = new AgentLocalProcessRegistry({
      capacity: 1,
      capacityWaitMs: 5_000,
      killGraceMs: 2_000,
      killProcessGroup: vi.fn(),
    });
    const releaseFirst = await registry.acquire('run-1');
    const second = registry.acquire('run-2');

    releaseFirst();
    const third = registry.acquire('run-3');
    const releaseSecond = await second;
    let thirdAcquired = false;
    void third.then(() => {
      thirdAcquired = true;
    });
    await Promise.resolve();

    expect(thirdAcquired).toBe(false);
    releaseSecond();
    const releaseThird = await third;
    releaseThird();
  });

  it('marks attached runs interrupted before terminating them on shutdown', async () => {
    const killProcessGroup = vi.fn();
    const registry = new AgentLocalProcessRegistry({
      capacity: 2,
      capacityWaitMs: 5_000,
      killGraceMs: 2_000,
      killProcessGroup,
    });
    const child = childWithPid(654);
    registry.attach('run-1', child as never);

    const shutdown = registry.onModuleDestroy();
    await Promise.resolve();

    expect(registry.reasonFor('run-1')).toBe('process_interrupted');
    expect(killProcessGroup).toHaveBeenCalledWith(654, 'SIGTERM');
    child.emit('close', 0);
    await shutdown;
  });
});
