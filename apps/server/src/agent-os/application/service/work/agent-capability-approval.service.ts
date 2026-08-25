import type {
  ApprovalDecisionInput,
  ApprovalDecisionResult,
} from "../../port/out/work/agent-work-persistence.types";
import type { AgentWorkInvocationApprovalPort } from "../../port/out/work/agent-work-invocation-approval.port";

/** Approval is a same-user confirmation fence, never a role-separation policy. */
export class AgentCapabilityApprovalService {
  constructor(
    private readonly transactions: AgentWorkInvocationApprovalPort,
  ) {}

  decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult> {
    return this.transactions.decideApproval(input);
  }
}
