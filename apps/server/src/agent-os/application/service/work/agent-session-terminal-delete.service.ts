import type {
  AgentWorkTransactionPort,
  TerminalSessionDeleteInput,
} from "../../port/out/work/agent-work-transaction.port";

export class AgentSessionTerminalDeleteService {
  constructor(
    private readonly transactions: Pick<
      AgentWorkTransactionPort,
      "deleteTerminalSession"
    >,
  ) {}

  delete(input: TerminalSessionDeleteInput): Promise<{ deleted: boolean }> {
    return this.transactions.deleteTerminalSession(input);
  }
}
