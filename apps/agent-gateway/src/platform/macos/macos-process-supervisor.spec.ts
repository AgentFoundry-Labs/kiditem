import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { MacosSupervisedProcess } from './macos-process-supervisor';

describe('MacosSupervisedProcess', () => {
  it('reports an unprovable process tree through onFatal once and never releases onExit', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      exitCode: null,
      stdin: { destroyed: false },
    });
    const onFatal = vi.fn();
    const onExit = vi.fn();
    const running = new MacosSupervisedProcess(
      child as never,
      { close: vi.fn() },
      vi.fn(),
      onFatal,
    );
    running.onExit(onExit);

    await expect(running.terminate()).rejects.toThrow('provider_process_pid_missing');

    expect(onFatal).toHaveBeenCalledOnce();
    expect(onExit).not.toHaveBeenCalled();

    child.emit('exit', 1, null);
    await flush();

    expect(onFatal).toHaveBeenCalledOnce();
    expect(onExit).not.toHaveBeenCalled();
  });
});

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}
