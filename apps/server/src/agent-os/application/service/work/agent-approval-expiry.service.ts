import type {
  AgentWorkTransactionPort,
  ApprovalExpiryInput,
} from "../../port/out/work/agent-work-transaction.port";

export class AgentApprovalExpiryService {
  constructor(
    private readonly transactions: Pick<
      AgentWorkTransactionPort,
      "expireApproval"
    >,
  ) {}

  expire(input: ApprovalExpiryInput): Promise<{ won: boolean }> {
    return this.transactions.expireApproval(input);
  }
}
