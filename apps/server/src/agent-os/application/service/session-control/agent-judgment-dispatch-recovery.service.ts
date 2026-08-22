import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT,
  type OperationPostAcceptingHookRegistryPort,
} from '../../../../operations/application/port/in/operation-post-accepting-hook-registry.port';
import {
  AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION,
  type AgentJudgmentDispatchOutboxTransactionPort,
} from '../../port/out/transaction/session-control/agent-judgment-dispatch-outbox.transaction.port';
import { AgentJudgmentDispatchService } from './agent-judgment-dispatch.service';

const RECOVERY_BATCH_SIZE = 100;

/** API lifecycle recovery for committed official judgment dispatch handoffs. */
@Injectable()
export class AgentJudgmentDispatchRecoveryService implements OnModuleInit {
  constructor(
    @Inject(AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION)
    private readonly outbox: AgentJudgmentDispatchOutboxTransactionPort,
    private readonly dispatch: AgentJudgmentDispatchService,
    @Inject(OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT)
    private readonly hooks: OperationPostAcceptingHookRegistryPort,
  ) {}

  onModuleInit(): void {
    this.hooks.register({
      key: 'agent-judgment-dispatches',
      priority: 30,
      run: (signal) => this.run(signal),
    });
  }

  async run(signal: AbortSignal): Promise<void> {
    const seen = new Set<string>();
    while (true) {
      signal.throwIfAborted();
      const candidates = await this.outbox.listPending({ limit: RECOVERY_BATCH_SIZE });
      if (candidates.length === 0) return;
      for (const candidate of candidates) {
        const identity = pendingIdentity(candidate);
        if (seen.has(identity)) throw new Error('agent_judgment_dispatch_recovery_non_progress');
        seen.add(identity);
        signal.throwIfAborted();
        await this.dispatch.dispatchPending(candidate);
        signal.throwIfAborted();
      }
    }
  }
}

function pendingIdentity(candidate: Awaited<ReturnType<AgentJudgmentDispatchOutboxTransactionPort['listPending']>>[number]): string {
  return `${candidate.organizationId}:${candidate.sessionId}:${candidate.taskId}:${candidate.executionId}`;
}
