import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: spawnMock,
}));

import { claudeStatusLoggedIn } from './main';

afterEach(() => { vi.useRealTimers(); spawnMock.mockReset(); });

describe('claudeStatusLoggedIn', () => {
  it('uses SIGKILL for a bounded timeout so a SIGTERM-ignoring local probe cannot remain orphaned', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      kill: (signal?: NodeJS.Signals) => boolean;
    };
    child.stdout = new EventEmitter();
    child.kill = vi.fn(() => true);
    spawnMock.mockReturnValue(child);

    const status = claudeStatusLoggedIn({ executable: 'claude', args: ['auth', 'status', '--json'], cwd: '/', env: {} }, 10);
    await vi.advanceTimersByTimeAsync(10);

    await expect(status).resolves.toBe(false);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
