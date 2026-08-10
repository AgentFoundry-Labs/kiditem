import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AgentLocalProcessRegistry } from '../agent-local-process-registry';

function childWithPid(pid: number) {
  const child = new EventEmitter() as EventEmitter & { pid: number };
  child.pid = pid;
  return child;
}

describe('AgentLocalProcessRegistry', () => {
  it('kills the registered process group when the run is cancelled', async () => {
    const killProcessGroup = vi.fn();
    const registry = new AgentLocalProcessRegistry({
      capacity: 2,
      capacityWaitMs: 5_000,
      killGraceMs: 2_000,
      killProcessGroup,
    });
    registry.attach('run-1', childWithPid(321) as never);

    await expect(registry.cancel('run-1', 'user_cancelled')).resolves.toBe(true);
    expect(killProcessGroup).toHaveBeenCalledWith(321, 'SIGTERM');
    expect(registry.reasonFor('run-1')).toBe('user_cancelled');
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
    registry.attach('run-1', childWithPid(654) as never);

    await registry.onModuleDestroy();

    expect(registry.reasonFor('run-1')).toBe('process_interrupted');
    expect(killProcessGroup).toHaveBeenCalledWith(654, 'SIGTERM');
  });
});
