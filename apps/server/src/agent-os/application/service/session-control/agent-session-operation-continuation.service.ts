import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { OperationLifecycleGateService } from '../../../../operations/application/service/operation-lifecycle-gate.service';
import type {
  AgentSessionLifecycleRecoveryRecord,
  AgentSessionOperationContinuationRecord,
} from '../../port/out/repository/session-control/agent-session-control.persistence.types';
import {
  AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
  type AgentSessionControlQueryRepositoryPort,
} from '../../port/out/repository/session-control/agent-session-control-query.repository.port';
import {
  AGENT_ATTEMPT_OPERATION_TRANSACTION,
  type AgentAttemptOperationTransactionPort,
} from '../../port/out/transaction/session-control/agent-attempt-operation.transaction.port';
import {
  AGENT_APPROVAL_CONTINUATION_TRANSACTION,
  type AgentApprovalContinuationTransactionPort,
} from '../../port/out/transaction/session-control/agent-approval-continuation.transaction.port';
import { AgentRuntimeAdapterRegistry } from '../agent-runtime-adapter.registry';

const durableRuntimeRequirements = {
  detached: true,
  reconnect: true,
  interrupt: true,
  cancel: true,
  inspect: true,
} as const;

const RECOVERY_BATCH_SIZE = 100;

@Injectable()
export class AgentSessionOperationContinuationService implements OnApplicationBootstrap {
  constructor(
    @Inject(AGENT_SESSION_CONTROL_QUERY_REPOSITORY)
    private readonly queries: AgentSessionControlQueryRepositoryPort,
    @Inject(AGENT_ATTEMPT_OPERATION_TRANSACTION)
    private readonly attempts: AgentAttemptOperationTransactionPort,
    @Inject(AGENT_APPROVAL_CONTINUATION_TRANSACTION)
    private readonly approvals: AgentApprovalContinuationTransactionPort,
    private readonly lifecycleGate: OperationLifecycleGateService,
    private readonly runtimes: AgentRuntimeAdapterRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverLifecycleCancelledRuns();
    await this.recoverIncompleteApprovalContinuations();
  }

  assertAccepting(): void {
    this.lifecycleGate.assertAccepting();
  }

  async continueApproval(input: {
    organizationId: string;
    sessionId: string;
    approvalId: string;
  }): Promise<AgentSessionOperationContinuationRecord> {
    this.lifecycleGate.assertAccepting();
    const continuation = await this.approvals.advanceApprovedContinuation({
      ...input,
      signal: this.lifecycleGate.signal(),
    });
    if (continuation.state === 'successor_created') {
      const runtime = this.runtimes.requireCompatible(
        continuation.runtimeType,
        durableRuntimeRequirements,
      );
      await runtime.interrupt({
        runtimeType: continuation.runtimeType,
        executionId: continuation.executionId,
        attemptId: continuation.attemptId,
        externalRunId: continuation.externalRunId,
        encryptedHandleRef: continuation.encryptedHandleRef,
        generation: continuation.runtimeGeneration,
      }, {
        interruptId: continuation.approvalId,
        payload: { decision: 'approved' },
      });
      await this.approvals.markApprovalContinuationInterruptDelivered({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        approvalId: continuation.approvalId,
        operationRunId: continuation.operationRunId,
      });
    }
    return {
      operationRunId: continuation.operationRunId,
      attemptId: continuation.attemptId,
    };
  }

  async recoverLifecycleCancelledRuns(): Promise<{
    examined: number;
    continued: number;
  }> {
    this.lifecycleGate.assertAccepting();
    let examined = 0;
    let continued = 0;
    while (true) {
      const candidates = await this.queries.listLifecycleRecoveryCandidates({
        limit: RECOVERY_BATCH_SIZE,
      });
      if (candidates.length === 0) break;
      examined += candidates.length;
      for (const candidate of candidates) {
        await this.continue({
          ...candidate,
          continuationKey: `lifecycle:${candidate.predecessorOperationRunId}`,
        });
        continued += 1;
      }
    }
    return { examined, continued };
  }

  async recoverIncompleteApprovalContinuations(): Promise<{
    examined: number;
    continued: number;
  }> {
    this.lifecycleGate.assertAccepting();
    let examined = 0;
    let continued = 0;
    while (true) {
      const approvals = await this.approvals.listIncompleteApprovalContinuations({
        limit: RECOVERY_BATCH_SIZE,
      });
      if (approvals.length === 0) break;
      examined += approvals.length;
      for (const approval of approvals) {
        await this.continueApproval(approval);
        continued += 1;
      }
    }
    return { examined, continued };
  }

  private continue(input: AgentSessionLifecycleRecoveryRecord & {
    continuationKey: string;
  }): Promise<AgentSessionOperationContinuationRecord> {
    this.lifecycleGate.assertAccepting();
    return this.attempts.continueOperationAttempt({
      ...input,
      signal: this.lifecycleGate.signal(),
    });
  }
}
