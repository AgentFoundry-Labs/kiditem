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

  it("returns an exact delegated replay before reserving a full local CLI slot", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const occupied = capacity.tryReserve();
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue({
        childTaskId: "child-1",
        firstAttemptId: "attempt-1",
        replayed: true,
      }),
      delegateTask: vi.fn(),
    };
    const service = new AgentAttemptAdmissionService(capacity, transactions as never);

    await expect(service.delegate(delegationInput())).resolves.toEqual({
      childTaskId: "child-1",
      firstAttemptId: "attempt-1",
      replayed: true,
    });
    expect(transactions.findDelegationReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        sessionId: "session-1",
        parentTaskId: "parent-1",
        delegatingAttemptId: "delegating-attempt-1",
        idempotencyKey: "delegation-key-1",
        requestHash: "a".repeat(64),
      }),
    );
    expect(transactions.delegateTask).not.toHaveBeenCalled();
    occupied.release();
  });

  it("keeps changed delegation input transactional and releases its rejected slot", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn().mockRejectedValue(new Error("delegation_idempotency_conflict")),
    };
    const service = new AgentAttemptAdmissionService(capacity, transactions as never);

    await expect(service.delegate({ ...delegationInput(), requestHash: "b".repeat(64) })).rejects.toThrow(
      "delegation_idempotency_conflict",
    );
    expect(transactions.delegateTask).toHaveBeenCalledTimes(1);
    expect(() => capacity.tryReserve()).not.toThrow();
  });

  it("requires a local CLI slot for a new delegated attempt", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const occupied = capacity.tryReserve();
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn(),
    };
    const service = new AgentAttemptAdmissionService(capacity, transactions as never);

    await expect(service.delegate(delegationInput())).rejects.toMatchObject({
      code: "agent_capacity_exhausted",
    });
    expect(transactions.delegateTask).not.toHaveBeenCalled();
    occupied.release();
  });
});

function delegationInput() {
  return {
    organizationId: "organization-1",
    sessionId: "session-1",
    parentTaskId: "parent-1",
    delegatingAttemptId: "delegating-attempt-1",
    requestedByUserId: "user-1",
    targetAgentVersionId: "version-1",
    objective: "Delegate work",
    completionCriteria: "Complete work",
    inputResourceRefs: [],
    idempotencyKey: "delegation-key-1",
    requestHash: "a".repeat(64),
    input: {},
    applicationVersion: "1.0.0",
    authorizingGitSha: "a".repeat(40),
    cliVersion: "1.0.0",
  };
}
