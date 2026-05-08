import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunWorker } from '../agent-run-worker.service';

describe('AgentRunWorker', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('resolveEnabled — explicit opt-in only', () => {
    it('defaults to false when AGENT_RUNTIME_WORKER_ENABLED is unset', () => {
      delete process.env.AGENT_RUNTIME_WORKER_ENABLED;
      // NODE_ENV must not influence the default — review #1 requirement.
      process.env.NODE_ENV = 'production';
      expect(AgentRunWorker.resolveEnabled()).toBe(false);
    });

    it('defaults to false even outside NODE_ENV=test (no auto-on)', () => {
      delete process.env.AGENT_RUNTIME_WORKER_ENABLED;
      process.env.NODE_ENV = 'development';
      expect(AgentRunWorker.resolveEnabled()).toBe(false);
    });

    it('defaults to false in NODE_ENV=test', () => {
      delete process.env.AGENT_RUNTIME_WORKER_ENABLED;
      process.env.NODE_ENV = 'test';
      expect(AgentRunWorker.resolveEnabled()).toBe(false);
    });

    it('honours AGENT_RUNTIME_WORKER_ENABLED=1', () => {
      process.env.AGENT_RUNTIME_WORKER_ENABLED = '1';
      expect(AgentRunWorker.resolveEnabled()).toBe(true);
    });

    it('honours AGENT_RUNTIME_WORKER_ENABLED=true (case-insensitive)', () => {
      process.env.AGENT_RUNTIME_WORKER_ENABLED = 'TRUE';
      expect(AgentRunWorker.resolveEnabled()).toBe(true);
    });

    it('treats explicit AGENT_RUNTIME_WORKER_ENABLED=0 as disabled', () => {
      process.env.AGENT_RUNTIME_WORKER_ENABLED = '0';
      expect(AgentRunWorker.resolveEnabled()).toBe(false);
    });
  });

  it('resolveIntervalMs defaults to 2000 when env unset', () => {
    delete process.env.AGENT_RUNTIME_WORKER_INTERVAL_MS;
    expect(AgentRunWorker.resolveIntervalMs()).toBe(2000);
  });

  it('resolveIntervalMs reads explicit env value', () => {
    process.env.AGENT_RUNTIME_WORKER_INTERVAL_MS = '500';
    expect(AgentRunWorker.resolveIntervalMs()).toBe(500);
  });

  describe('tick()', () => {
    let executor: { executeNextUnscoped: ReturnType<typeof vi.fn> };
    let worker: AgentRunWorker;

    beforeEach(() => {
      // Force the worker timer off for unit tests; we drive tick() directly.
      process.env.AGENT_RUNTIME_WORKER_ENABLED = '0';
      executor = { executeNextUnscoped: vi.fn() };
      worker = new AgentRunWorker(executor as never);
    });

    it('calls executor.executeNextUnscoped on each tick', async () => {
      executor.executeNextUnscoped.mockResolvedValue({
        executed: false,
        reason: 'no_pending_request',
      });
      await worker.tick();
      expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(1);
    });

    it('skips re-entrant ticks while one is in flight', async () => {
      let resolveFirst!: () => void;
      const inFlight = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      executor.executeNextUnscoped.mockImplementationOnce(
        () =>
          inFlight.then(() => ({
            executed: true,
            requestId: 'r1',
          })),
      );

      const tick1 = worker.tick();
      const tick2 = worker.tick();

      // Allow tick2 to observe `busy=true` and bail out before tick1 completes.
      await Promise.resolve();
      expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(1);

      resolveFirst();
      await Promise.all([tick1, tick2]);
      expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(1);

      // After the first tick releases, a fresh tick proceeds again.
      executor.executeNextUnscoped.mockResolvedValueOnce({
        executed: false,
        reason: 'no_pending_request',
      });
      await worker.tick();
      expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(2);
    });

    it('does not throw when the executor rejects (loop must not crash)', async () => {
      executor.executeNextUnscoped.mockRejectedValueOnce(new Error('boom'));
      await expect(worker.tick()).resolves.toBeUndefined();
      expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(1);

      // Worker must reset the busy flag even after a failure, so the next
      // tick does NOT silently no-op.
      executor.executeNextUnscoped.mockResolvedValueOnce({
        executed: false,
        reason: 'no_pending_request',
      });
      await worker.tick();
      expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(2);
    });
  });

  describe('lifecycle', () => {
    it('does not start the timer when disabled (default)', () => {
      delete process.env.AGENT_RUNTIME_WORKER_ENABLED;
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const worker = new AgentRunWorker({
        executeNextUnscoped: vi.fn(),
      } as never);
      worker.onModuleInit();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      worker.onModuleDestroy();
    });

    it('does not start the timer when explicitly disabled (=0)', () => {
      process.env.AGENT_RUNTIME_WORKER_ENABLED = '0';
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const worker = new AgentRunWorker({
        executeNextUnscoped: vi.fn(),
      } as never);
      worker.onModuleInit();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      worker.onModuleDestroy();
    });

    it('does not start the timer when intervalMs is 0', () => {
      process.env.AGENT_RUNTIME_WORKER_ENABLED = '1';
      process.env.AGENT_RUNTIME_WORKER_INTERVAL_MS = '0';
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const worker = new AgentRunWorker({
        executeNextUnscoped: vi.fn(),
      } as never);
      worker.onModuleInit();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      worker.onModuleDestroy();
    });

    it('starts and clears an interval when enabled', () => {
      process.env.AGENT_RUNTIME_WORKER_ENABLED = '1';
      process.env.AGENT_RUNTIME_WORKER_INTERVAL_MS = '50';
      const handle = { unref: vi.fn() } as unknown as ReturnType<
        typeof setInterval
      >;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockReturnValue(handle);
      const clearIntervalSpy = vi
        .spyOn(global, 'clearInterval')
        .mockImplementation(() => undefined);

      const worker = new AgentRunWorker({
        executeNextUnscoped: vi.fn(),
      } as never);
      worker.onModuleInit();
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      worker.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalledWith(handle);
    });
  });
});
