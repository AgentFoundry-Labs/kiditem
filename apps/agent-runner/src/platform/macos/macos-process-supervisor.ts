import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ProviderCommand } from '../../provider/provider-command';
import type { ProcessCallbacks, ProcessExit, ProcessSupervisor, SupervisedProcess } from '../process-supervisor';
import { startProcessTreeWatchdog, type ProcessTreeWatchdog } from './process-tree-watchdog';

const TERMINATION_GRACE_MS = 1_000;

/** macOS owner of detached provider groups and their independent pipe watchdogs. */
export class MacosProcessSupervisor implements ProcessSupervisor {
  private readonly live = new Set<MacosSupervisedProcess>();

  async launch(command: ProviderCommand, callbacks: ProcessCallbacks = {}): Promise<MacosSupervisedProcess> {
    const child = spawn(command.executable, [...command.args], {
      cwd: command.cwd,
      env: command.env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;
    if (!child.pid) { child.kill(); throw new Error('provider_process_pid_missing'); }
    const watchdog = startProcessTreeWatchdog(child.pid);
    const running = new MacosSupervisedProcess(
      child,
      watchdog,
      () => this.live.delete(running),
      (error) => callbacks.onFatal?.(error),
    );
    this.live.add(running);
    child.stdout.on('data', (chunk: Buffer) => callbacks.onStdout?.(chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => callbacks.onStderr?.(chunk.toString('utf8')));
    running.onExit((exit) => callbacks.onExit?.(exit));
    return running;
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled([...this.live].map((running) => running.terminate()));
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, 'runner_macos_kill_all_failed');
  }
}

export class MacosSupervisedProcess implements SupervisedProcess {
  private readonly listeners = new Set<(exit: ProcessExit) => void>();
  private terminating: Promise<void> | null = null;
  private treeQuiescence: Promise<void> | null = null;
  private reportedExit: ProcessExit | null = null;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly watchdog: ProcessTreeWatchdog,
    private readonly removed: () => void,
    private readonly onFatal: (error: Error) => void,
  ) {
    child.once('exit', (code, signal) => {
      const exit = { code, signal };
      this.watchdog.close();
      void this.quiesceAndReportExit(exit);
    });
  }

  input(value: string): Promise<void> {
    if (this.child.stdin.destroyed || this.child.exitCode !== null) throw new Error('provider_process_not_live');
    return new Promise((resolve, reject) => this.child.stdin.write(value, (error) => error ? reject(error) : resolve()));
  }

  onExit(listener: (exit: ProcessExit) => void): void {
    if (this.reportedExit) { listener(this.reportedExit); return; }
    this.listeners.add(listener);
  }

  terminate(): Promise<void> {
    if (this.terminating) return this.terminating;
    this.terminating = this.ensureTreeGone();
    return this.terminating;
  }

  /** Test-only simulation of a Runner process death: it closes no provider process itself. */
  async simulateRunnerAbruptExitForTest(): Promise<void> { this.watchdog.close(); }

  private signal(signal: NodeJS.Signals): void {
    const pid = this.child.pid;
    if (!pid || pid <= 0) return;
    try { process.kill(-pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }

  private ensureTreeGone(): Promise<void> {
    if (this.treeQuiescence) return this.treeQuiescence;
    this.treeQuiescence = (async () => {
      const processGroupId = this.child.pid;
      if (!processGroupId || processGroupId <= 0) throw new Error('provider_process_pid_missing');
      this.signal('SIGTERM'); this.watchdog.close();
      await waitForGroupGone(processGroupId, TERMINATION_GRACE_MS);
      if (processGroupAlive(processGroupId)) {
        this.signal('SIGKILL');
        await waitForGroupGone(processGroupId, TERMINATION_GRACE_MS);
      }
      if (processGroupAlive(processGroupId)) throw new Error('provider_process_tree_termination_timeout');
      this.removed();
    })();
    return this.treeQuiescence;
  }

  private async quiesceAndReportExit(exit: ProcessExit): Promise<void> {
    try {
      await this.ensureTreeGone();
      if (this.reportedExit) return;
      this.reportedExit = exit;
      for (const listener of this.listeners) listener(exit);
      this.listeners.clear();
    } catch (error) {
      // Keep the process registered and fail the Runner closed; no workspace may be released.
      this.onFatal(error instanceof Error ? error : new Error('provider_process_tree_termination_failed'));
    }
  }
}

function processGroupAlive(processGroupId: number): boolean {
  try { process.kill(-processGroupId, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForGroupGone(processGroupId: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupAlive(processGroupId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
