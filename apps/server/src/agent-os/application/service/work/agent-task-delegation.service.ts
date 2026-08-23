import { AgentOsRuntimeError } from "../../../domain/agent-os.errors";
import type { AgentWorkRepositoryPort } from "../../port/out/work/agent-work-repository.port";
import type {
  DelegateTaskInput,
  DelegateTaskResult,
} from "../../port/out/work/agent-work-transaction.port";
import { AgentAttemptAdmissionService } from "./agent-attempt-admission.service";
import { canonicalize, hash } from "./agent-capability-invocation.service";

export class AgentTaskDelegationService {
  constructor(
    private readonly repository: Pick<
      AgentWorkRepositoryPort,
      "findDelegationReplay"
    >,
    private readonly admissions: AgentAttemptAdmissionService,
  ) {}

  async delegate(
    input: Omit<DelegateTaskInput, "requestHash">,
  ): Promise<DelegateTaskResult> {
    const requestHash = hash(
      canonicalize({
        targetAgentVersionId: input.targetAgentVersionId,
        objective: input.objective,
        completionCriteria: input.completionCriteria,
        inputResourceRefs: input.inputResourceRefs,
        input: input.input,
      }),
    );
    const replay = await this.repository.findDelegationReplay({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      parentTaskId: input.parentTaskId,
      idempotencyKey: input.idempotencyKey,
      requestedByUserId: input.requestedByUserId,
    });
    if (replay) return replayResult(replay, requestHash);
    return this.admissions.delegate({ ...input, requestHash });
  }
}

function replayResult(
  replay: {
    childTaskId: string;
    requestHash: string | null;
    firstAttemptId: string | null;
  },
  requestHash: string,
): DelegateTaskResult {
  if (replay.requestHash !== requestHash || !replay.firstAttemptId) {
    throw new AgentOsRuntimeError(
      "delegation_idempotency_conflict",
      "delegation_idempotency_conflict",
    );
  }
  return {
    childTaskId: replay.childTaskId,
    firstAttemptId: replay.firstAttemptId,
    replayed: true,
  };
}
