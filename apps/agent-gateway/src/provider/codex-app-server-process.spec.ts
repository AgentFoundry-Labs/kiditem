import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

afterEach(() => { spawnMock.mockReset(); });

describe('startCodexAppServer', () => {
  it('owns the Codex app-server through the platform process-tree supervisor until its tree termination resolves', async () => {
    const { startCodexAppServer } = await import('./codex-app-server-process');
    spawnMock.mockReturnValue(fakeChild());
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      supervisor,
    } as never);

    expect(supervisor.launches).toEqual([expect.objectContaining({
      args: expect.arrayContaining(['app-server']),
      cwd: '/gateway/workspace',
    })]);
    expect(spawnMock).not.toHaveBeenCalled();

    const closing = process.close();
    expect(supervisor.process.terminateCalls).toBe(1);
    await expect(closing).resolves.toBeUndefined();
  });
});

class RecordingSupervisor {
  readonly launches: unknown[] = [];
  readonly process = new RecordingProcess();

  async launch(command: unknown) {
    this.launches.push(command);
    return this.process;
  }

  async shutdown() { return undefined; }
}

class RecordingProcess {
  terminateCalls = 0;
  async input() { return undefined; }
  async terminate() { this.terminateCalls += 1; }
  onExit() { return undefined; }
}

function fakeChild() {
  const events = new EventEmitter();
  return Object.assign(events, {
    stdin: { write: (_value: string, _encoding: string, callback: (error?: Error | null) => void) => callback(null) },
    stdout: new EventEmitter(),
    kill: () => true,
  });
}
