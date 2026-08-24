import type { AgentWorkTransactionPort, ReconciliationResult } from '../../port/out/work/agent-work-transaction.port';

export interface AgentAttemptRuntimeIdentity {
  applicationVersion: string;
  gitSha: string;
}

/** API-root boot repair; no provider process, session, or history is restored. */
export class AgentAttemptReconciler {
  constructor(
    private readonly work: Pick<AgentWorkTransactionPort, 'reconcile'>,
    private readonly capacity: { releaseAttempt(attemptId: string): void },
    private readonly runtime: AgentAttemptRuntimeIdentity,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcile(): Promise<ReconciliationResult> {
    const result = await this.work.reconcile({
      applicationVersion: this.runtime.applicationVersion,
      authorizingGitSha: this.runtime.gitSha,
      now: this.now(),
    });
    result.attemptIds.forEach((attemptId) => this.capacity.releaseAttempt(attemptId));
    return result;
  }
}
