import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ProviderCommand } from '../../provider/provider-command';
import type { ProcessCallbacks, ProcessExit, ProcessSupervisor, SupervisedProcess } from '../process-supervisor';

/** Windows helper boundary: the helper alone owns a kill-on-close Job Object. */
export class WindowsJobSupervisor implements ProcessSupervisor {
  private readonly live = new Set<WindowsJobProcess>();
  constructor(private readonly options: Readonly<{ helperPath: string }>) {}

  async launch(command: ProviderCommand, callbacks: ProcessCallbacks = {}): Promise<SupervisedProcess> {
    const helper = spawn(this.options.helperPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }) as ChildProcessWithoutNullStreams;
    const running = new WindowsJobProcess(helper, () => this.live.delete(running)); this.live.add(running);
    helper.stdout.on('data', (chunk: Buffer) => callbacks.onStdout?.(chunk.toString('utf8')));
    helper.stderr.on('data', (chunk: Buffer) => callbacks.onStderr?.(chunk.toString('utf8')));
    helper.on('exit', (code, signal) => callbacks.onExit?.({ code, signal }));
    await running.input(`${JSON.stringify(command)}\n`);
    return running;
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled([...this.live].map((running) => running.terminate()));
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, 'runner_windows_kill_all_failed');
  }
}

class WindowsJobProcess implements SupervisedProcess {
  private readonly listeners = new Set<(exit: ProcessExit) => void>();
  private done: Promise<void> | null = null;
  constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly removed: () => void) {
    child.once('exit', (code, signal) => { this.removed(); for (const listener of this.listeners) listener({ code, signal }); });
  }
  input(value: string): Promise<void> { return new Promise((resolve, reject) => this.child.stdin.write(value, (error) => error ? reject(error) : resolve())); }
  onExit(listener: (exit: ProcessExit) => void): void { this.listeners.add(listener); }
  terminate(): Promise<void> {
    if (this.done) return this.done;
    this.done = new Promise((resolve) => {
      this.child.once('exit', () => resolve());
      this.child.stdin.end();
      setTimeout(() => { if (this.child.exitCode === null) this.child.kill('SIGKILL'); }, 1_000).unref();
    });
    return this.done;
  }
}
