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
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { AgentAttemptCapacityService } from "./agent-attempt-capacity.service";

const MAX_IN_FLIGHT_ADMISSIONS = 256;

type InFlightAdmission<T> = Readonly<{
  inputHash: string;
  promise: Promise<T>;
}>;

/** The sole capacity gate for every local CLI attempt admission path. */
export class AgentAttemptAdmissionService {
  private readonly rootAdmissions = new Map<string, InFlightAdmission<AdmitRootAttemptResult>>();
  private readonly delegationAdmissions = new Map<string, InFlightAdmission<DelegateTaskResult>>();

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

  root(input: AdmitRootAttemptInput): Promise<AdmitRootAttemptResult> {
    const key = rootAdmissionKey(input);
    if (!key) return this.admitRoot(input);
    return this.coalesce(
      this.rootAdmissions,
      key,
      rootAdmissionHash(input),
      () => new AgentOsRuntimeError('root_admission_replay_conflict'),
      () => this.admitRoot(input),
    );
  }

  delegate(input: DelegateTaskInput): Promise<DelegateTaskResult> {
    return this.coalesce(
      this.delegationAdmissions,
      delegationAdmissionKey(input),
      input.requestHash,
      () => new AgentOsRuntimeError('delegation_idempotency_conflict'),
      () => this.admitDelegation(input),
    );
  }

  private async admitRoot(input: AdmitRootAttemptInput): Promise<AdmitRootAttemptResult> {
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

  private async admitDelegation(input: DelegateTaskInput): Promise<DelegateTaskResult> {
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
      if (!delegated.launchRequired) lease.release();
      else this.capacity.acceptAttempt(delegated.attemptId, lease);
      return delegated;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  private coalesce<T>(
    admissions: Map<string, InFlightAdmission<T>>,
    key: string,
    inputHash: string,
    conflict: () => Error,
    admit: () => Promise<T>,
  ): Promise<T> {
    const existing = admissions.get(key);
    if (existing) {
      if (existing.inputHash !== inputHash) return Promise.reject(conflict());
      return existing.promise;
    }
    if (admissions.size >= MAX_IN_FLIGHT_ADMISSIONS) {
      return Promise.reject(new AgentOsRuntimeError('agent_admission_in_flight_limit'));
    }
    let promise!: Promise<T>;
    promise = Promise.resolve()
      .then(admit)
      .finally(() => {
        if (admissions.get(key)?.promise === promise) admissions.delete(key);
      });
    admissions.set(key, { inputHash, promise });
    return promise;
  }

  /** Called once the local CLI process reaches any terminal state. */
  releaseAttempt(attemptId: string): void {
    this.capacity.releaseAttempt(attemptId);
  }
}

function rootAdmissionKey(input: AdmitRootAttemptInput): string | null {
  if (!input.sessionId) return null;
  return [input.organizationId, input.createdByUserId, input.sessionId].join('\u0000');
}

function rootAdmissionHash(input: AdmitRootAttemptInput): string {
  return canonicalOwnerInputHash({
    assignedAgentVersionId: input.assignedAgentVersionId,
    objective: input.objective,
    completionCriteria: input.completionCriteria,
    inputResourceRefs: input.inputResourceRefs,
    input: input.input,
    applicationVersion: input.applicationVersion,
    authorizingGitSha: input.authorizingGitSha,
    cliVersion: input.cliVersion,
    reportedModel: input.reportedModel ?? null,
  });
}

function delegationAdmissionKey(input: DelegateTaskInput): string {
  return [
    input.organizationId,
    input.sessionId,
    input.parentTaskId,
    input.delegatingAttemptId,
    input.requestedByUserId,
    input.idempotencyKey,
  ].join('\u0000');
}
