/**
 * Startup cleanup operates only on attempt-owned transient roots. The adapter
 * validates containment and rejects symlinks before it removes anything.
 */
export class AgentRuntimeDirectoryReconciler {
  constructor(private readonly directories: { cleanAttempt(attemptId: string): Promise<void>; reapMarkedProcess?(attemptId: string): Promise<'absent' | 'reaped' | 'unsafe'> }) {}

  async reap(attemptId: string): Promise<boolean> {
    const result = await this.directories.reapMarkedProcess?.(attemptId);
    return result !== 'unsafe';
  }

  clean(attemptId: string): Promise<void> {
    return this.directories.cleanAttempt(attemptId);
  }
}
