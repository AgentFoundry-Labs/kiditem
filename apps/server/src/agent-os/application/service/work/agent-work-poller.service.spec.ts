import { describe, expect, it, vi } from 'vitest';
import { AgentWorkPollerService } from './agent-work-poller.service';

describe('AgentWorkPollerService', () => {
  it('awaits an in-flight owner invocation during shutdown', async () => {
    const owner = deferred<void>();
    const dispatchOne = vi.fn(async () => {
      await owner.promise;
      return false;
    });
    const poller = new AgentWorkPollerService(
      { dispatchOne } as never,
      { expire: vi.fn() } as never,
      { findDueApprovals: vi.fn().mockResolvedValue([]) },
    );

    const bootstrap = poller.onApplicationBootstrap();
    await vi.waitFor(() => expect(dispatchOne).toHaveBeenCalledTimes(1));
    let destroyed = false;
    const shutdown = Promise.resolve(poller.onModuleDestroy()).then(() => {
      destroyed = true;
    });
    await Promise.resolve();
    expect(destroyed).toBe(false);

    owner.resolve();
    await Promise.all([bootstrap, shutdown]);
    expect(destroyed).toBe(true);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
