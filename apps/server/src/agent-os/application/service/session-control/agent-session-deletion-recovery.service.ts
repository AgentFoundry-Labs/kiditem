import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT,
  type OperationPostAcceptingHookRegistryPort,
} from '../../../../operations/application/port/in/operation-post-accepting-hook-registry.port';
import {
  AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION,
  type AgentSessionDeletionFinalizationTransactionPort,
  type InterruptedDeletionCandidate,
} from '../../port/out/transaction/session-deletion/agent-session-deletion-finalization.transaction.port';

const RECOVERY_BATCH_SIZE = 100;

@Injectable()
export class AgentSessionDeletionRecoveryService implements OnModuleInit {
  constructor(
    @Inject(AGENT_SESSION_DELETION_FINALIZATION_TRANSACTION)
    private readonly transactions: AgentSessionDeletionFinalizationTransactionPort,
    @Inject(OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT)
    private readonly hooks: OperationPostAcceptingHookRegistryPort,
  ) {}

  onModuleInit(): void {
    this.hooks.register({
      key: 'agent-session-deletions',
      priority: 20,
      run: (signal) => this.run(signal),
    });
  }

  async run(signal: AbortSignal): Promise<void> {
    const seen = new Set<string>();
    while (true) {
      signal.throwIfAborted();
      const candidates = await this.transactions.listInterruptedDeletions({
        limit: RECOVERY_BATCH_SIZE,
      });
      if (candidates.length === 0) return;
      for (const candidate of candidates) {
        const identity = interruptedIdentity(candidate);
        if (seen.has(identity)) throw new Error('agent_session_deletion_recovery_non_progress');
        seen.add(identity);
        signal.throwIfAborted();
        await this.transactions.continueInterruptedDeletion(candidate);
      }
    }
  }
}

function interruptedIdentity(candidate: InterruptedDeletionCandidate): string {
  return `${candidate.organizationId}:${candidate.sessionId}:${candidate.currentOperationRunId}`;
}
