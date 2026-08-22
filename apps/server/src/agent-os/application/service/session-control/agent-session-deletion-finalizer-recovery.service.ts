import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION,
  type AgentSessionDeletionFinalizationTransactionPort,
  type DeletionFinalizerCandidate,
} from '../../port/out/transaction/session-deletion/agent-session-deletion-finalization.transaction.port';

const RECOVERY_BATCH_SIZE = 100;

@Injectable()
export class AgentSessionDeletionFinalizerRecoveryService {
  constructor(
    @Inject(AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION)
    private readonly transactions: AgentSessionDeletionFinalizationTransactionPort,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    const seen = new Set<string>();
    while (true) {
      signal.throwIfAborted();
      const candidates = await this.transactions.listGraphDeletedFinalizers({
        limit: RECOVERY_BATCH_SIZE,
      });
      if (candidates.length === 0) return;
      for (const candidate of candidates) {
        const identity = finalizerIdentity(candidate);
        if (seen.has(identity)) throw new Error('agent_session_deletion_finalizer_non_progress');
        seen.add(identity);
        signal.throwIfAborted();
        await this.transactions.purgeGraphDeletedLineage({
          signal,
          organizationId: candidate.organizationId,
          sessionId: candidate.sessionId,
          currentOperationRunId: candidate.currentOperationRunId,
          expectedAttemptToken: null,
        });
      }
    }
  }
}

function finalizerIdentity(candidate: DeletionFinalizerCandidate): string {
  return `${candidate.organizationId}:${candidate.sessionId}:${candidate.currentOperationRunId}`;
}
