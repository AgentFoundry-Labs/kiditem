import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { OperationLifecycleGateService } from '../../../operations/application/service/operation-lifecycle-gate.service';
import {
  AGENT_SESSION_CONTROL_REPOSITORY,
  type AgentSessionControlRepositoryPort,
  type AgentSessionLifecycleRecoveryRecord,
  type AgentSessionOperationContinuationRecord,
} from '../port/out/repository/agent-session-control.repository.port';
import { AgentRuntimeAdapterRegistry } from './agent-runtime-adapter.registry';

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
    @Inject(AGENT_SESSION_CONTROL_REPOSITORY)
    private readonly controls: AgentSessionControlRepositoryPort,
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
    const continuation = await this.controls.advanceApprovedContinuation({
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
      await this.controls.markApprovalContinuationInterruptDelivered({
        organizationId: input.organizationId,
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
      const candidates = await this.controls.listLifecycleRecoveryCandidates({
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
      const approvals = await this.controls.listIncompleteApprovalContinuations({
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
    return this.controls.continueOperationAttempt({
      ...input,
      signal: this.lifecycleGate.signal(),
    });
  }
}
