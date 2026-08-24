import type { SupervisedProcess } from '../platform/process-supervisor';

/** Ephemeral registry of only Runner-owned live process trees. */
export class AttemptProcessRegistry {
  private readonly processes = new Map<string, SupervisedProcess>();
  private readonly terminating = new Map<string, Promise<void>>();

  register(attemptId: string, process: SupervisedProcess): void {
    if (this.processes.has(attemptId)) throw new Error('runner_attempt_process_exists');
    this.processes.set(attemptId, process);
  }

  get(attemptId: string): SupervisedProcess | null { return this.processes.get(attemptId) ?? null; }

  /** Supervisors may report exit only after they have proved the full tree is gone. */
  confirmExited(attemptId: string): void {
    if (this.terminating.has(attemptId)) return;
    this.processes.delete(attemptId);
  }

  async input(attemptId: string, value: string): Promise<void> {
    const process = this.get(attemptId);
    if (!process) throw new Error('runner_attempt_process_missing');
    await process.input(value);
  }

  interrupt(attemptId: string): Promise<void> {
    const running = this.terminating.get(attemptId);
    if (running) return running;
    const process = this.processes.get(attemptId);
    if (!process) return Promise.resolve();
    let tracked!: Promise<void>;
    const termination = Promise.resolve()
      .then(() => process.terminate())
      .then(() => {
        // Keep the process handle if the supervisor cannot prove tree death.
        if (this.processes.get(attemptId) === process) this.processes.delete(attemptId);
      });
    tracked = termination.finally(() => {
      if (this.terminating.get(attemptId) === tracked) this.terminating.delete(attemptId);
    });
    this.terminating.set(attemptId, tracked);
    return tracked;
  }

  async interruptAll(): Promise<void> {
    const results = await Promise.allSettled([...this.processes.keys()].map((attemptId) => this.interrupt(attemptId)));
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, 'runner_attempt_process_kill_all_failed');
  }
}
