import type {
  AdmitAttemptInput,
  AdmitAttemptResult,
  AdmitRootAttemptInput,
  AdmitRootAttemptResult,
  DelegateTaskInput,
  DelegateTaskResult,
} from "../../port/out/work/agent-work-persistence.types";
import type { AgentWorkAdmissionPort } from "../../port/out/work/agent-work-admission.port";
import type { AgentAttemptReadinessPreflightPort } from '../../port/out/runtime/agent-attempt-readiness-preflight.port';
import { AgentAttemptCapacityService } from "./agent-attempt-capacity.service";

/** The sole capacity gate for every local CLI attempt admission path. */
export class AgentAttemptAdmissionService {
  constructor(
    private readonly capacity: AgentAttemptCapacityService,
    private readonly transactions: AgentWorkAdmissionPort,
    private readonly readiness: AgentAttemptReadinessPreflightPort,
  ) {}

  async followUp(input: AdmitAttemptInput): Promise<AdmitAttemptResult> {
    await this.readiness.assertFollowUp(input);
    const lease = this.capacity.tryReserve();
    try {
      const admitted = await this.transactions.admitAttempt(input);
      this.capacity.acceptAttempt(admitted.attemptId, lease);
      return admitted;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async root(input: AdmitRootAttemptInput): Promise<AdmitRootAttemptResult> {
    await this.readiness.assertRoot(input);
    const lease = this.capacity.tryReserve();
    try {
      const admitted = await this.transactions.admitRootAttempt(input);
      this.capacity.acceptAttempt(admitted.attempt.id, lease);
      return admitted;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async delegate(input: DelegateTaskInput): Promise<DelegateTaskResult> {
    const replay = await this.transactions.findDelegationReplay({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      parentTaskId: input.parentTaskId,
      delegatingAttemptId: input.delegatingAttemptId,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
    if (replay) return replay;
    await this.readiness.assertDelegation(input);
    const lease = this.capacity.tryReserve();
    try {
      const delegated = await this.transactions.delegateTask(input);
      if (delegated.replayed) lease.release();
      else this.capacity.acceptAttempt(delegated.firstAttemptId, lease);
      return delegated;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  /** Called once the local CLI process reaches any terminal state. */
  releaseAttempt(attemptId: string): void {
    this.capacity.releaseAttempt(attemptId);
  }
}
