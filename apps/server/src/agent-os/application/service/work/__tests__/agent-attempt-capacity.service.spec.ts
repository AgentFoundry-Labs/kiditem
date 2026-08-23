import { describe, expect, it } from "vitest";
import { AgentAttemptCapacityService } from "../agent-attempt-capacity.service";

describe("AgentAttemptCapacityService", () => {
  it("rejects the fifth live attempt immediately and releases exactly once", () => {
    const capacity = new AgentAttemptCapacityService(4);
    const leases = [
      capacity.tryReserve(),
      capacity.tryReserve(),
      capacity.tryReserve(),
      capacity.tryReserve(),
    ];

    expect(() => capacity.tryReserve()).toThrow("agent_capacity_exhausted");
    leases[0].release();
    leases[0].release();
    expect(capacity.tryReserve()).toBeDefined();
  });
});
