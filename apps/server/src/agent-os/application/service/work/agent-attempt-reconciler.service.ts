import type { AgentWorkTransactionPort, ReconciliationResult } from '../../port/out/work/agent-work-transaction.port';
import { AgentRuntimeDirectoryReconciler } from './agent-runtime-directory-reconciler.service';

export interface AgentAttemptRuntimeIdentity {
  applicationVersion: string;
  gitSha: string;
}

/** API-root boot repair; no provider process, session, or history is restored. */
export class AgentAttemptReconciler {
  constructor(
    private readonly work: Pick<AgentWorkTransactionPort, 'reconcile'>,
    private readonly capacity: { releaseAttempt(attemptId: string): void },
    private readonly processes: { terminate(attemptId: string): Promise<void> },
    private readonly directories: AgentRuntimeDirectoryReconciler,
    private readonly runtime: AgentAttemptRuntimeIdentity,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcile(): Promise<ReconciliationResult> {
    const result = await this.work.reconcile({
      applicationVersion: this.runtime.applicationVersion,
      authorizingGitSha: this.runtime.gitSha,
      now: this.now(),
    });
    await Promise.all(result.attemptIds.map(async (attemptId) => {
      this.capacity.releaseAttempt(attemptId);
      await this.processes.terminate(attemptId);
      await this.directories.clean(attemptId);
    }));
    return result;
  }
}
