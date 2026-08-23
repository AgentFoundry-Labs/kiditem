import type {
  AgentWorkTransactionPort,
  TaskLifecycleTransitionInput,
} from "../../port/out/work/agent-work-transaction.port";

/** The only writer of business lifecycle status for replacement tasks. */
export class AgentTaskLifecycleService {
  constructor(
    private readonly transactions: Pick<
      AgentWorkTransactionPort,
      "transitionTask"
    >,
  ) {}

  transition(input: TaskLifecycleTransitionInput): Promise<{ status: string }> {
    return this.transactions.transitionTask(input);
  }
}
