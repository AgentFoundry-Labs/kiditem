import type { ReconciliationResult } from '../../port/out/work/agent-work-persistence.types';
import type { AgentWorkLifecyclePort } from '../../port/out/work/agent-work-lifecycle.port';

export interface AgentAttemptRuntimeIdentity {
  applicationVersion: string;
  gitSha: string;
}

/** API-root boot repair; no provider process, session, or history is restored. */
export class AgentAttemptReconciler {
  private inFlight: Promise<ReconciliationResult> | null = null;

  constructor(
    private readonly work: AgentWorkLifecyclePort,
    private readonly capacity: { releaseAttempt(attemptId: string): void },
    private readonly runtime: AgentAttemptRuntimeIdentity,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcile(): Promise<ReconciliationResult> {
    if (this.inFlight) return this.inFlight;
    let running!: Promise<ReconciliationResult>;
    running = Promise.resolve().then(async () => {
      const result = await this.work.reconcile({
        applicationVersion: this.runtime.applicationVersion,
        authorizingGitSha: this.runtime.gitSha,
        now: this.now(),
      });
      result.attemptIds.forEach((attemptId) => this.capacity.releaseAttempt(attemptId));
      return result;
    }).finally(() => {
      if (this.inFlight === running) this.inFlight = null;
    });
    this.inFlight = running;
    return running;
  }
}
