import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { stopTrackedChild } from './tracked-child';

describe('stopTrackedChild', () => {
  it('waits for the tracked child to exit after SIGTERM', async () => {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      killed: boolean;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.killed = false;
    child.kill = vi.fn(() => {
      queueMicrotask(() => child.emit('exit', 0, 'SIGTERM'));
      return true;
    });

    await stopTrackedChild(child as never, 50);

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('escalates only the same tracked child after a bounded grace period', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      killed: boolean;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.killed = false;
    child.kill = vi.fn((signal: string) => {
      if (signal === 'SIGKILL') queueMicrotask(() => child.emit('exit', null, signal));
      return true;
    });

    const stopped = stopTrackedChild(child as never, 50);
    await vi.advanceTimersByTimeAsync(50);
    await stopped;

    expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
    vi.useRealTimers();
  });
});
