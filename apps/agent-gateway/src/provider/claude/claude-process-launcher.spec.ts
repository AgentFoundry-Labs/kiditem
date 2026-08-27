import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessCallbacks } from '../../platform/process-supervisor';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

afterEach(() => { spawnMock.mockReset(); });

describe('NativeClaudeProcessLauncher', () => {
  it('launches and terminates every Claude child through the platform process-tree supervisor', async () => {
    const { NativeClaudeProcessLauncher } = await import('./claude-process-launcher');
    spawnMock.mockReturnValue(fakeChild());
    const supervisor = new RecordingSupervisor();
    const launcher = new NativeClaudeProcessLauncher({ supervisor, onFatal: () => undefined } as never);
    const handle = await launcher.start({
      command: {
        executable: '/gateway/runtime/node',
        args: ['/gateway/runtime/claude.js', '--print'],
        cwd: '/gateway/workspace',
        env: { PATH: '/usr/bin' },
      },
      input: 'provider input\n',
      onOutput: () => undefined,
      onExit: () => undefined,
    });

    expect(supervisor.launches).toEqual([expect.objectContaining({
      executable: '/gateway/runtime/node',
      args: ['/gateway/runtime/claude.js', '--print'],
    })]);
    expect(supervisor.process.inputs).toEqual(['provider input\n']);
    expect(spawnMock).not.toHaveBeenCalled();

    await handle.interrupt();
    expect(supervisor.process.inputs).toEqual(['provider input\n']);
    expect(supervisor.process.terminateCalls).toBe(1);
  });

  it('propagates a supervisor tree-quiescence fatal to the Gateway lifecycle once', async () => {
    const { NativeClaudeProcessLauncher } = await import('./claude-process-launcher');
    const supervisor = new RecordingSupervisor();
    const onFatal = vi.fn();
    const launcher = new NativeClaudeProcessLauncher({ supervisor, onFatal } as never);
    await launcher.start({
      command: {
        executable: '/gateway/runtime/node',
        args: ['/gateway/runtime/claude.js', '--print'],
        cwd: '/gateway/workspace',
        env: { PATH: '/usr/bin' },
      },
      input: 'provider input\n',
      onOutput: () => undefined,
      onExit: () => undefined,
    });
    const failure = new Error('provider_process_tree_termination_timeout');

    supervisor.emitFatal(failure);
    supervisor.emitFatal(failure);

    expect(onFatal).toHaveBeenCalledOnce();
    expect(onFatal).toHaveBeenCalledWith(failure);
  });
});

class RecordingSupervisor {
  readonly launches: unknown[] = [];
  readonly process = new RecordingProcess();
  private callbacks: ProcessCallbacks = {};

  async launch(command: unknown, callbacks: ProcessCallbacks = {}) {
    this.launches.push(command);
    this.callbacks = callbacks;
    return this.process;
  }

  async shutdown() { return undefined; }
  emitFatal(error: Error): void { this.callbacks.onFatal?.(error); }
}

class RecordingProcess {
  readonly inputs: string[] = [];
  terminateCalls = 0;
  async input(value: string) { this.inputs.push(value); }
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
