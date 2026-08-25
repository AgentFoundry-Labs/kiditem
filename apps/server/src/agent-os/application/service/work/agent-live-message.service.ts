import type { AgentLiveMessagePort } from "../../port/out/work/agent-live-message.port";
import type { AgentWorkRepositoryPort } from "../../port/out/work/agent-work-repository.port";
import { AgentOsRuntimeError } from "../../../domain/agent-os.errors";

export class AgentLiveMessageService {
  constructor(
    private readonly liveMessages: AgentLiveMessagePort,
    private readonly work: Pick<AgentWorkRepositoryPort, "loadLiveAttempt">,
  ) {}

  async send(input: {
    organizationId: string;
    requestedByUserId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    content: string;
    turnId: string;
  }): Promise<void> {
    const access = await this.work.loadLiveAttempt(input);
    if (!access)
      throw new AgentOsRuntimeError("task_not_found", "task_not_found");
    if (access.taskStatus !== "open")
      throw new AgentOsRuntimeError(
        access.taskStatus === "cancelled" ? "task_cancelled" : "task_not_open",
        access.taskStatus,
      );
    if (!access.live)
      throw new AgentOsRuntimeError("attempt_not_live", "attempt_not_live");
    await this.liveMessages.deliver({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      content: input.content,
      turnId: input.turnId,
    });
  }
}
