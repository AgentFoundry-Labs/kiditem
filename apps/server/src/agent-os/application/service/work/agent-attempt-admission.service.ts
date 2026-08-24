import type {
  AdmitAttemptInput,
  AdmitAttemptResult,
  AdmitRootAttemptInput,
  AdmitRootAttemptResult,
  AgentWorkTransactionPort,
  DelegateTaskInput,
  DelegateTaskResult,
} from "../../port/out/work/agent-work-transaction.port";
import { AgentAttemptCapacityService } from "./agent-attempt-capacity.service";

/** The sole capacity gate for every local CLI attempt admission path. */
export class AgentAttemptAdmissionService {
  private readonly accepted = new Map<string, () => void>();

  constructor(
    private readonly capacity: AgentAttemptCapacityService,
    private readonly transactions: Pick<
      AgentWorkTransactionPort,
      | "admitAttempt"
      | "admitRootAttempt"
      | "findDelegationReplay"
      | "delegateTask"
    >,
  ) {}

  async followUp(input: AdmitAttemptInput): Promise<AdmitAttemptResult> {
    const lease = this.capacity.tryReserve();
    try {
      const admitted = await this.transactions.admitAttempt(input);
      this.accepted.set(admitted.attemptId, lease.release);
      return admitted;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async root(input: AdmitRootAttemptInput): Promise<AdmitRootAttemptResult> {
    const lease = this.capacity.tryReserve();
    try {
      const admitted = await this.transactions.admitRootAttempt(input);
      this.accepted.set(admitted.attempt.id, lease.release);
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
    const lease = this.capacity.tryReserve();
    try {
      const delegated = await this.transactions.delegateTask(input);
      if (delegated.replayed) lease.release();
      else this.accepted.set(delegated.firstAttemptId, lease.release);
      return delegated;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  /** Called once the local CLI process reaches any terminal state. */
  releaseAttempt(attemptId: string): void {
    const release = this.accepted.get(attemptId);
    if (!release) return;
    this.accepted.delete(attemptId);
    release();
  }
}
