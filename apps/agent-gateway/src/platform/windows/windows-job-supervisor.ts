import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ProviderCommand } from '../../provider/provider-command';
import type { ProcessCallbacks, ProcessExit, ProcessSupervisor, SupervisedProcess } from '../process-supervisor';

/** Windows helper boundary: the helper alone owns a kill-on-close Job Object. */
export class WindowsJobSupervisor implements ProcessSupervisor {
  private readonly live = new Set<WindowsJobProcess>();
  constructor(private readonly options: Readonly<{ helperPath: string }>) {}

  async launch(command: ProviderCommand, callbacks: ProcessCallbacks = {}): Promise<SupervisedProcess> {
    const helper = spawn(this.options.helperPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }) as ChildProcessWithoutNullStreams;
    let running!: WindowsJobProcess;
    running = new WindowsJobProcess(helper, () => this.live.delete(running));
    if (!running.hasExited) this.live.add(running);
    helper.stdout.on('data', (chunk: Buffer) => callbacks.onStdout?.(chunk.toString('utf8')));
    helper.stderr.on('data', (chunk: Buffer) => callbacks.onStderr?.(chunk.toString('utf8')));
    running.onExit((exit) => callbacks.onExit?.(exit));
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
  private readonly exitSettled: Promise<void>;
  private resolveExitSettled!: () => void;
  private exit: ProcessExit | null = null;
  private observedExit: ProcessExit | null = null;
  private terminationStarted = false;
  private terminationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly removed: () => void) {
    this.exitSettled = new Promise<void>((resolve) => { this.resolveExitSettled = resolve; });
    child.once('exit', (code, signal) => {
      this.observedExit = Object.freeze({ code, signal });
      this.clearTerminationTimer();
    });
    // Spawn failures may emit `error` then `close` without an `exit` event.
    // Observe `error` only to prevent an unhandled event: `close` is the
    // canonical settlement because it means the helper stdio is closed too.
    child.once('error', () => undefined);
    child.once('close', (code, signal) => this.settleExit(this.observedExit ?? { code, signal }));
    // The helper can exit before launch has finished installing its callbacks.
    // Register the listener first, then observe the already-settled child so
    // either ordering resolves this single promise exactly once.
    if (child.exitCode !== null || child.signalCode !== null) {
      this.settleExit({ code: child.exitCode, signal: child.signalCode });
    }
  }

  get hasExited(): boolean { return this.exit !== null; }

  input(value: string): Promise<void> { return new Promise((resolve, reject) => this.child.stdin.write(value, (error) => error ? reject(error) : resolve())); }
  onExit(listener: (exit: ProcessExit) => void): void {
    if (this.exit) { listener(this.exit); return; }
    this.listeners.add(listener);
  }

  terminate(): Promise<void> {
    if (this.exit || this.observedExit || this.terminationStarted) return this.exitSettled;
    this.terminationStarted = true;
    try { this.child.stdin.end(); } catch { /* the bounded kill path still closes the Job */ }
    this.terminationTimer = setTimeout(() => {
      this.terminationTimer = null;
      if (!this.exit && !this.observedExit) this.child.kill('SIGKILL');
    }, 1_000);
    this.terminationTimer.unref();
    return this.exitSettled;
  }

  private settleExit(exit: ProcessExit): void {
    if (this.exit) return;
    this.exit = Object.freeze(exit);
    this.clearTerminationTimer();
    this.removed();
    this.resolveExitSettled();
    for (const listener of this.listeners) listener(this.exit);
    this.listeners.clear();
  }

  private clearTerminationTimer(): void {
    if (!this.terminationTimer) return;
    clearTimeout(this.terminationTimer);
    this.terminationTimer = null;
  }
}
