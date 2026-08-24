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

  remove(attemptId: string): void { this.processes.delete(attemptId); }

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
    this.processes.delete(attemptId);
    const termination = process.terminate().finally(() => this.terminating.delete(attemptId));
    this.terminating.set(attemptId, termination);
    return termination;
  }

  async interruptAll(): Promise<void> { await Promise.all([...this.processes.keys()].map((attemptId) => this.interrupt(attemptId))); }
}
