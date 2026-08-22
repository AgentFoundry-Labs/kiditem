import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION,
  type AgentJudgmentDispatchOutboxTransactionPort,
} from '../../port/out/transaction/session-control/agent-judgment-dispatch-outbox.transaction.port';
import { AgentSessionTaskDispatchService } from './agent-session-task-dispatch.service';

/** Reconciles one committed judgment handoff without ever recreating its session graph. */
@Injectable()
export class AgentJudgmentDispatchService {
  constructor(
    @Inject(AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION)
    private readonly outbox: AgentJudgmentDispatchOutboxTransactionPort,
    private readonly tasks: AgentSessionTaskDispatchService,
  ) {}

  async dispatch(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string;
  }): Promise<{ operationsRunId: string }> {
    let claimed = await this.outbox.claim(input);
    for (let attempt = 0; claimed.state === 'pending' && !claimed.leaseToken && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      claimed = await this.outbox.claim(input);
    }
    if (claimed.state === 'dispatched') return { operationsRunId: claimed.operationRunId };
    if (!claimed.leaseToken) throw new Error('AGENT_JUDGMENT_DISPATCH_LEASED');
    return this.dispatchClaimed(input, claimed.leaseToken);
  }

  /** Best-effort startup drain: a concurrent valid lease owns this coordinate. */
  async dispatchPending(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string;
  }): Promise<{ operationsRunId: string } | null> {
    const claimed = await this.outbox.claim(input);
    if (claimed.state === 'dispatched') return { operationsRunId: claimed.operationRunId };
    if (!claimed.leaseToken) return null;
    return this.dispatchClaimed(input, claimed.leaseToken);
  }

  private async dispatchClaimed(
    input: {
      organizationId: string;
      sessionId: string;
      taskId: string;
      executionId: string;
      requestedByUserId: string;
    },
    leaseToken: string,
  ): Promise<{ operationsRunId: string }> {
    try {
      const operation = await this.tasks.dispatch(input);
      const marked = await this.outbox.markDispatched({ ...input, leaseToken, operationRunId: operation.operationsRunId });
      return { operationsRunId: marked.operationRunId };
    } catch (error) {
      await this.outbox.release({
        organizationId: input.organizationId,
        executionId: input.executionId,
        leaseToken,
      });
      throw error;
    }
  }
}
