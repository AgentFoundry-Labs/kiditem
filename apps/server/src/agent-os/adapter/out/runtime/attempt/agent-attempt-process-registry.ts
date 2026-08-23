import type { ChildProcessWithoutNullStreams } from 'node:child_process';

/** Tracks only children owned by the current API process. */
export class AgentAttemptProcessRegistry {
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();

  register(attemptId: string, child: ChildProcessWithoutNullStreams): void {
    if (this.processes.has(attemptId)) throw new Error('attempt_process_exists');
    this.processes.set(attemptId, child);
  }

  async terminate(attemptId: string, timeoutMs = 5_000): Promise<void> {
    const child = this.processes.get(attemptId);
    if (!child) return;
    if (child.exitCode === null) this.signalGroup(child.pid, 'SIGTERM');
    await waitForExit(child, timeoutMs);
    if (child.exitCode === null) {
      this.signalGroup(child.pid, 'SIGKILL');
      await waitForExit(child, timeoutMs);
    }
    this.processes.delete(attemptId);
  }

  remove(attemptId: string): void {
    this.processes.delete(attemptId);
  }

  get(attemptId: string): ChildProcessWithoutNullStreams | null {
    return this.processes.get(attemptId) ?? null;
  }

  private signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
    if (!pid || pid <= 0) return;
    try {
      // The executor starts each Attempt with detached:true, making -pid its owned group.
      process.kill(-pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
