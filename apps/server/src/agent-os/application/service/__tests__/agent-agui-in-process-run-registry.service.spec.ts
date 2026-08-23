import { describe, expect, it } from "vitest";
import { AgentAguiInProcessRunRegistry, AgentAguiUserCancelled } from "../agent-agui-in-process-run-registry.service";

describe("AgentAguiInProcessRunRegistry", () => {
  it("seals a missing exact coordinate so a stale request cannot begin later", async () => {
    const registry = new AgentAguiInProcessRunRegistry();
    const coordinate = {
      organizationId: "org-1",
      sessionId: "session-1",
      executionId: "execution-1",
      attemptId: "attempt-1",
      startIntentId: "intent-1",
    };

    await expect(
      registry.stopAndInspect(coordinate, new AbortController().signal),
    ).resolves.toEqual({ status: "cancelled" });

    expect(() => registry.begin(coordinate)).toThrow(AgentAguiUserCancelled);
  });
});
