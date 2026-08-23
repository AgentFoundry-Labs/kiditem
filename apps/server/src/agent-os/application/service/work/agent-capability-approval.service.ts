import type {
  AgentWorkTransactionPort,
  ApprovalDecisionInput,
  ApprovalDecisionResult,
} from "../../port/out/work/agent-work-transaction.port";

/** Approval is a same-user confirmation fence, never a role-separation policy. */
export class AgentCapabilityApprovalService {
  constructor(
    private readonly transactions: Pick<
      AgentWorkTransactionPort,
      "decideApproval"
    >,
  ) {}

  decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult> {
    return this.transactions.decideApproval(input);
  }
}
