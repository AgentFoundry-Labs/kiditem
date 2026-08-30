import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { WindowsJobSupervisor } from './windows-job-supervisor';

afterEach(() => { vi.useRealTimers(); spawnMock.mockReset(); });

describe('WindowsJobSupervisor', () => {
  it('settles terminate when the helper has already exited naturally', async () => {
    const child = helper(); spawnMock.mockReturnValue(child);
    const supervisor = new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' });
    const running = await supervisor.launch(command());
    child.exitCode = 0;
    child.emit('exit', 0, null);

    const terminated = running.terminate();
    expect(child.stdin.end).not.toHaveBeenCalled();
    child.emit('close', 0, null);
    await settle();

    await expect(terminated).resolves.toBeUndefined();
  });

  it('cleans up an already-exited helper during startup instead of retaining a stuck shutdown entry', async () => {
    const child = helper({ exitCode: 0, inputError: new Error('helper_stdin_closed') });
    spawnMock.mockReturnValue(child);
    const supervisor = new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' });
    let exits = 0;

    await expect(supervisor.launch(command(), { onExit: () => { exits += 1; } })).rejects.toThrow('helper_stdin_closed');
    let shutdownSettled = false;
    void supervisor.shutdown().then(() => { shutdownSettled = true; });
    await settle();

    expect(exits).toBe(1);
    expect(shutdownSettled).toBe(true);
  });

  it('shares one termination side-effect path across concurrent callers', async () => {
    vi.useFakeTimers();
    const child = helper(); spawnMock.mockReturnValue(child);
    const running = await new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' }).launch(command());

    const first = running.terminate();
    const second = running.terminate();
    expect(second).toBe(first);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.exitCode = null;
    child.emit('exit', null, 'SIGKILL');
    child.emit('close', null, 'SIGKILL');
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('keeps startup cleanup live across helper error until close settles the no-exit path', async () => {
    const child = helper({ inputError: new Error('helper_stdin_closed') }); spawnMock.mockReturnValue(child);
    const supervisor = new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' });
    let exits = 0;
    const starting = supervisor.launch(command(), { onExit: () => { exits += 1; } });
    child.emit('error', new Error('helper_spawn_failed'));
    await expect(starting).rejects.toThrow('helper_stdin_closed');
    let shutdownSettled = false;
    const shutdown = supervisor.shutdown().then(() => { shutdownSettled = true; });
    await settle();
    expect(shutdownSettled).toBe(false);
    child.emit('close', null, null);

    await expect(shutdown).resolves.toBeUndefined();
    expect(exits).toBe(1);
  });

  it('clears the termination kill timer when the helper exits by signal first', async () => {
    vi.useFakeTimers();
    const child = helper(); spawnMock.mockReturnValue(child);
    const running = await new WindowsJobSupervisor({ helperPath: 'C:\\KidItem\\KidItem.JobRunner.exe' }).launch(command());

    const terminated = running.terminate();
    child.signalCode = 'SIGTERM';
    child.emit('exit', null, 'SIGTERM');
    await vi.advanceTimersByTimeAsync(1_000);

    child.emit('close', null, 'SIGTERM');
    await expect(terminated).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });
});

function command() {
  return { executable: 'C:\\KidItem\\provider.exe', args: [], cwd: 'C:\\KidItem', env: {} };
}

function helper(options: { exitCode?: number | null; inputError?: Error } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: (value: string, callback: (error?: Error) => void) => boolean; end: () => void };
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: (signal?: NodeJS.Signals) => boolean;
  };
  child.stdin = {
    write: (_value, callback) => { queueMicrotask(() => callback(options.inputError)); return true; },
    end: vi.fn(),
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = options.exitCode ?? null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
