import type {
  DelegateTaskInput,
  DelegateTaskResult,
} from "../../port/out/work/agent-work-persistence.types";
import { AgentAttemptAdmissionService } from "./agent-attempt-admission.service";
import { canonicalize, hash } from "./agent-capability-invocation.service";

export class AgentTaskDelegationService {
  constructor(private readonly admissions: AgentAttemptAdmissionService) {}

  async delegate(
    input: Omit<DelegateTaskInput, "requestHash">,
  ): Promise<DelegateTaskResult> {
    const requestHash = delegationRequestHash(input);
    return this.admissions.delegate({ ...input, requestHash });
  }
}

export function delegationRequestHash(
  input: Pick<
    DelegateTaskInput,
    | "objective"
    | "completionCriteria"
    | "inputResourceRefs"
    | "input"
  >,
): string {
  return hash(
    canonicalize({
      objective: input.objective,
      completionCriteria: input.completionCriteria,
      inputResourceRefs: input.inputResourceRefs,
      input: input.input,
    }),
  );
}
