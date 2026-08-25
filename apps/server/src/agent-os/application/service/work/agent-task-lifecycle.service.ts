import type {
  TaskLifecycleTransitionInput,
  TaskLifecycleTransitionResult,
} from "../../port/out/work/agent-work-persistence.types";
import type { AgentWorkLifecyclePort } from "../../port/out/work/agent-work-lifecycle.port";

/** The only writer of business lifecycle status for replacement tasks. */
export class AgentTaskLifecycleService {
  constructor(
    private readonly transactions: AgentWorkLifecyclePort,
  ) {}

  transition(input: TaskLifecycleTransitionInput): Promise<TaskLifecycleTransitionResult> {
    return this.transactions.transitionTask(input);
  }
}
