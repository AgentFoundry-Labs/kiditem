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

  it("owns the admitted Attempt binding and releases its slot exactly once", () => {
    const capacity = new AgentAttemptCapacityService(1);
    const lease = capacity.tryReserve();

    capacity.acceptAttempt("attempt-1", lease);
    expect(() => capacity.tryReserve()).toThrow("agent_capacity_exhausted");

    capacity.releaseAttempt("attempt-1");
    capacity.releaseAttempt("attempt-1");
    expect(capacity.tryReserve()).toBeDefined();
  });
});
