/**
 * Startup cleanup operates only on attempt-owned transient roots. The adapter
 * validates containment and rejects symlinks before it removes anything.
 */
export class AgentRuntimeDirectoryReconciler {
  constructor(private readonly directories: { cleanAttempt(attemptId: string): Promise<void> }) {}

  clean(attemptId: string): Promise<void> {
    return this.directories.cleanAttempt(attemptId);
  }
}
