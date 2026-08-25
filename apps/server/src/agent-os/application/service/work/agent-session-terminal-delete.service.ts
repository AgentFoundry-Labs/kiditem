import type {
  TerminalSessionDeleteInput,
} from "../../port/out/work/agent-work-persistence.types";
import type { AgentWorkLifecyclePort } from "../../port/out/work/agent-work-lifecycle.port";

export class AgentSessionTerminalDeleteService {
  constructor(
    private readonly transactions: AgentWorkLifecyclePort,
  ) {}

  delete(input: TerminalSessionDeleteInput): Promise<{ deleted: boolean }> {
    return this.transactions.deleteTerminalSession(input);
  }
}
