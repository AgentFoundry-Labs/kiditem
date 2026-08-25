import type {
  ApprovalExpiryInput,
} from "../../port/out/work/agent-work-persistence.types";
import type { AgentWorkInvocationApprovalPort } from "../../port/out/work/agent-work-invocation-approval.port";

export class AgentApprovalExpiryService {
  constructor(
    private readonly transactions: AgentWorkInvocationApprovalPort,
  ) {}

  expire(input: ApprovalExpiryInput): Promise<{ won: boolean }> {
    return this.transactions.expireApproval(input);
  }
}
