import { describe, expect, it, vi } from "vitest";
import { AgentAttemptAdmissionService } from "../agent-attempt-admission.service";
import { AgentAttemptCapacityService } from "../agent-attempt-capacity.service";

describe("AgentAttemptAdmissionService", () => {
  it("releases a provisional capacity lease when atomic admission rejects", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const transactions = {
      admitAttempt: vi
        .fn()
        .mockRejectedValue(new Error("attempt_already_running")),
    };
    const service = new AgentAttemptAdmissionService(
      capacity,
      transactions as never,
    );

    await expect(service.followUp({} as never)).rejects.toThrow(
      "attempt_already_running",
    );
    expect(() => capacity.tryReserve()).not.toThrow();
  });
});
