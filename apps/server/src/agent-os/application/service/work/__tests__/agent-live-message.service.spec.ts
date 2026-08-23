import { describe, expect, it, vi } from "vitest";
import { AgentLiveMessageService } from "../agent-live-message.service";

describe("AgentLiveMessageService", () => {
  it("delivers to a live attempt without asking admission to create a successor", async () => {
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const work = {
      loadProjection: vi
        .fn()
        .mockResolvedValue({ tasks: [{ id: "t", status: "open" }] }),
      loadLiveAttempt: vi
        .fn()
        .mockResolvedValue({ taskStatus: "open", live: true }),
    };
    const service = new AgentLiveMessageService(delivery, work as never);

    await service.send({
      organizationId: "org",
      requestedByUserId: "u",
      sessionId: "s",
      taskId: "t",
      attemptId: "a",
      content: "continue",
    });

    expect(delivery.deliver).toHaveBeenCalledWith({
      organizationId: "org",
      requestedByUserId: "u",
      sessionId: "s",
      taskId: "t",
      attemptId: "a",
      content: "continue",
    });
  });

  it("rejects an ordinary message to a cancelled task without delivery", async () => {
    const delivery = { deliver: vi.fn() };
    const work = {
      loadProjection: vi.fn(),
      loadLiveAttempt: vi
        .fn()
        .mockResolvedValue({ taskStatus: "cancelled", live: false }),
    };
    const service = new AgentLiveMessageService(delivery, work as never);
    await expect(
      service.send({
        organizationId: "org",
        requestedByUserId: "u",
        sessionId: "s",
        taskId: "t",
        attemptId: "a",
        content: "continue",
      }),
    ).rejects.toMatchObject({ code: "task_cancelled" });
    expect(delivery.deliver).not.toHaveBeenCalled();
  });
});
