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
      readyPreflight(),
    );

    await expect(service.followUp({} as never)).rejects.toThrow(
      "attempt_already_running",
    );
    expect(() => capacity.tryReserve()).not.toThrow();
  });

  it("returns an exact delegated replay without Runner readiness or transactional child creation", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const occupied = capacity.tryReserve();
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue({
        childTaskId: "child-1",
        firstAttemptId: "attempt-1",
        attemptId: "attempt-1",
        replayed: true,
        launchRequired: false,
        taskTerminal: false,
      }),
      delegateTask: vi.fn(),
    };
    const preflight = readyPreflight({
      assertDelegation: vi.fn().mockRejectedValue(new Error("runner_not_ready")),
    });
    const service = new AgentAttemptAdmissionService(capacity, transactions as never, preflight);

    await expect(service.delegate(delegationInput())).resolves.toEqual({
      childTaskId: "child-1",
      firstAttemptId: "attempt-1",
      attemptId: "attempt-1",
      replayed: true,
      launchRequired: false,
      taskTerminal: false,
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
    expect(preflight.assertDelegation).not.toHaveBeenCalled();
    expect(transactions.delegateTask).not.toHaveBeenCalled();
    occupied.release();
  });

  it("keeps changed delegation input transactional and releases its rejected slot", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn().mockRejectedValue(new Error("delegation_idempotency_conflict")),
    };
    const service = new AgentAttemptAdmissionService(capacity, transactions as never, readyPreflight());

    await expect(service.delegate({ ...delegationInput(), requestHash: "b".repeat(64) })).rejects.toThrow(
      "delegation_idempotency_conflict",
    );
    expect(transactions.delegateTask).toHaveBeenCalledTimes(1);
    expect(() => capacity.tryReserve()).not.toThrow();
  });

  it("returns an exact terminal-child replay without reserving a local slot or launching another Attempt", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue({
        childTaskId: "child-1",
        firstAttemptId: "child-attempt-1",
        attemptId: "child-attempt-1",
        replayed: true,
        launchRequired: false,
        taskTerminal: false,
      }),
      delegateTask: vi.fn(),
    };
    const preflight = readyPreflight();
    const service = new AgentAttemptAdmissionService(capacity, transactions as never, preflight);

    await expect(service.delegate(delegationInput())).resolves.toMatchObject({
      childTaskId: "child-1",
      firstAttemptId: "child-attempt-1",
      attemptId: "child-attempt-1",
      replayed: true,
      launchRequired: false,
    });

    expect(preflight.assertDelegation).not.toHaveBeenCalled();
    expect(transactions.delegateTask).not.toHaveBeenCalled();
    const reused = capacity.tryReserve();
    reused.release();
  });

  it("requires a local CLI slot for a new delegated attempt", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const occupied = capacity.tryReserve();
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn(),
    };
    const service = new AgentAttemptAdmissionService(capacity, transactions as never, readyPreflight());

    await expect(service.delegate(delegationInput())).rejects.toMatchObject({
      code: "agent_capacity_exhausted",
    });
    expect(transactions.delegateTask).not.toHaveBeenCalled();
    occupied.release();
  });

  it("blocks root durable admission when exact Runner readiness is unavailable", async () => {
    const transactions = { admitRootAttempt: vi.fn() };
    const preflight = readyPreflight({
      assertRoot: vi.fn().mockRejectedValue(new Error("runner_not_ready")),
    });
    const service = new AgentAttemptAdmissionService(
      new AgentAttemptCapacityService(1),
      transactions as never,
      preflight,
    );

    await expect(service.root(rootInput())).rejects.toThrow("runner_not_ready");

    expect(preflight.assertRoot).toHaveBeenCalledWith(rootInput());
    expect(transactions.admitRootAttempt).not.toHaveBeenCalled();
  });

  it("coalesces concurrent exact root admissions before a second request can consume capacity", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const entered = deferred<void>();
    const release = deferred<{
      session: { id: string; organizationId: string };
      task: { id: string; organizationId: string; sessionId: string };
      attempt: { id: string; ordinal: number };
    }>();
    const transactions = {
      admitRootAttempt: vi.fn(async () => {
        entered.resolve();
        return release.promise;
      }),
    };
    const preflight = readyPreflight();
    const service = new AgentAttemptAdmissionService(capacity, transactions as never, preflight);
    const input = { ...rootInput(), sessionId: "session-1" };

    const leader = service.root(input);
    await entered.promise;
    const follower = service.root(input);
    const admitted = {
      session: { id: "session-1", organizationId: "organization-1" },
      task: { id: "task-1", organizationId: "organization-1", sessionId: "session-1" },
      attempt: { id: "root-attempt-1", ordinal: 1 },
    };
    release.resolve(admitted);

    await expect(Promise.all([leader, follower])).resolves.toEqual([admitted, admitted]);
    expect(preflight.assertRoot).toHaveBeenCalledTimes(1);
    expect(transactions.admitRootAttempt).toHaveBeenCalledTimes(1);

    service.releaseAttempt("root-attempt-1");
    const reusable = capacity.tryReserve();
    reusable.release();
  });

  it("rejects concurrent root replay drift before reserving another local slot", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const entered = deferred<void>();
    const release = deferred<{
      session: { id: string; organizationId: string };
      task: { id: string; organizationId: string; sessionId: string };
      attempt: { id: string; ordinal: number };
    }>();
    const transactions = {
      admitRootAttempt: vi.fn(async () => {
        entered.resolve();
        return release.promise;
      }),
    };
    const service = new AgentAttemptAdmissionService(
      capacity,
      transactions as never,
      readyPreflight(),
    );
    const input = { ...rootInput(), sessionId: "session-1" };

    const leader = service.root(input);
    await entered.promise;

    await expect(service.root({
      ...input,
      input: { prompt: "changed-root-input" },
    })).rejects.toMatchObject({ code: "root_admission_replay_conflict" });

    release.resolve({
      session: { id: "session-1", organizationId: "organization-1" },
      task: { id: "task-1", organizationId: "organization-1", sessionId: "session-1" },
      attempt: { id: "root-attempt-1", ordinal: 1 },
    });
    await leader;
    service.releaseAttempt("root-attempt-1");
  });

  it("blocks follow-up durable admission when exact Runner readiness is unavailable", async () => {
    const transactions = { admitAttempt: vi.fn() };
    const preflight = readyPreflight({
      assertFollowUp: vi.fn().mockRejectedValue(new Error("runner_not_ready")),
    });
    const service = new AgentAttemptAdmissionService(
      new AgentAttemptCapacityService(1),
      transactions as never,
      preflight,
    );

    await expect(service.followUp(followUpInput())).rejects.toThrow("runner_not_ready");

    expect(preflight.assertFollowUp).toHaveBeenCalledWith(followUpInput());
    expect(transactions.admitAttempt).not.toHaveBeenCalled();
  });

  it("blocks cross-Agent delegation before durable child creation when exact Runner readiness is unavailable", async () => {
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn(),
    };
    const preflight = readyPreflight({
      assertDelegation: vi.fn().mockRejectedValue(new Error("runner_not_ready")),
    });
    const service = new AgentAttemptAdmissionService(
      new AgentAttemptCapacityService(1),
      transactions as never,
      preflight,
    );

    await expect(service.delegate(delegationInput())).rejects.toThrow("runner_not_ready");

    expect(preflight.assertDelegation).toHaveBeenCalledWith(delegationInput());
    expect(transactions.findDelegationReplay).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "organization-1",
      sessionId: "session-1",
      parentTaskId: "parent-1",
      delegatingAttemptId: "delegating-attempt-1",
    }));
    expect(transactions.delegateTask).not.toHaveBeenCalled();
  });

  it("coalesces concurrent exact delegation admissions before a follower can consume capacity", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const entered = deferred<void>();
    const release = deferred<{
      childTaskId: string;
      firstAttemptId: string;
      attemptId: string;
      replayed: boolean;
      launchRequired: boolean;
      taskTerminal: boolean;
    }>();
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn(async () => {
        entered.resolve();
        return release.promise;
      }),
    };
    const preflight = readyPreflight();
    const service = new AgentAttemptAdmissionService(capacity, transactions as never, preflight);
    const input = delegationInput();

    const leader = service.delegate(input);
    await entered.promise;
    const follower = service.delegate(input);
    const delegated = {
      childTaskId: "child-1",
      firstAttemptId: "child-attempt-1",
      attemptId: "child-attempt-1",
      replayed: false,
      launchRequired: true,
      taskTerminal: false,
    };
    release.resolve(delegated);

    await expect(Promise.all([leader, follower])).resolves.toEqual([delegated, delegated]);
    expect(transactions.findDelegationReplay).toHaveBeenCalledTimes(1);
    expect(preflight.assertDelegation).toHaveBeenCalledTimes(1);
    expect(transactions.delegateTask).toHaveBeenCalledTimes(1);

    service.releaseAttempt("child-attempt-1");
    const reusable = capacity.tryReserve();
    reusable.release();
  });

  it("rejects concurrent delegation replay drift before reserving another local slot", async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const entered = deferred<void>();
    const release = deferred<{
      childTaskId: string;
      firstAttemptId: string;
      attemptId: string;
      replayed: boolean;
      launchRequired: boolean;
      taskTerminal: boolean;
    }>();
    const transactions = {
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn(async () => {
        entered.resolve();
        return release.promise;
      }),
    };
    const service = new AgentAttemptAdmissionService(
      capacity,
      transactions as never,
      readyPreflight(),
    );
    const input = delegationInput();

    const leader = service.delegate(input);
    await entered.promise;

    await expect(service.delegate({
      ...input,
      requestHash: "b".repeat(64),
    })).rejects.toMatchObject({ code: "delegation_idempotency_conflict" });

    release.resolve({
      childTaskId: "child-1",
      firstAttemptId: "child-attempt-1",
      attemptId: "child-attempt-1",
      replayed: false,
      launchRequired: true,
      taskTerminal: false,
    });
    await leader;
    service.releaseAttempt("child-attempt-1");
  });

  it("keeps root, follow-up, and delegation transactions on their existing success paths after exact readiness preflight", async () => {
    const transactions = {
      admitRootAttempt: vi.fn().mockResolvedValue({
        session: { id: "session-1", organizationId: "organization-1" },
        task: { id: "task-1", organizationId: "organization-1", sessionId: "session-1" },
        attempt: { id: "root-attempt-1", ordinal: 1 },
      }),
      admitAttempt: vi.fn().mockResolvedValue({
        attemptId: "follow-up-attempt-1",
        taskId: "task-1",
        sessionId: "session-1",
        ordinal: 2,
      }),
      findDelegationReplay: vi.fn().mockResolvedValue(null),
      delegateTask: vi.fn().mockResolvedValue({
        childTaskId: "child-1",
        firstAttemptId: "child-attempt-1",
        attemptId: "child-attempt-1",
        replayed: false,
        launchRequired: true,
        taskTerminal: false,
      }),
    };
    const preflight = readyPreflight();
    const service = new AgentAttemptAdmissionService(
      new AgentAttemptCapacityService(3),
      transactions as never,
      preflight,
    );

    await expect(service.root(rootInput())).resolves.toMatchObject({
      attempt: { id: "root-attempt-1" },
    });
    await expect(service.followUp(followUpInput())).resolves.toMatchObject({
      attemptId: "follow-up-attempt-1",
    });
    await expect(service.delegate(delegationInput())).resolves.toMatchObject({
      childTaskId: "child-1",
      replayed: false,
    });

    expect(preflight.assertRoot).toHaveBeenCalledWith(rootInput());
    expect(preflight.assertFollowUp).toHaveBeenCalledWith(followUpInput());
    expect(preflight.assertDelegation).toHaveBeenCalledWith(delegationInput());
    expect(transactions.admitRootAttempt).toHaveBeenCalledWith(rootInput());
    expect(transactions.admitAttempt).toHaveBeenCalledWith(followUpInput());
    expect(transactions.delegateTask).toHaveBeenCalledWith(delegationInput());
  });
});

function readyPreflight(overrides: Partial<{
  assertRoot: ReturnType<typeof vi.fn>;
  assertFollowUp: ReturnType<typeof vi.fn>;
  assertDelegation: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    assertRoot: vi.fn().mockResolvedValue(undefined),
    assertFollowUp: vi.fn().mockResolvedValue(undefined),
    assertDelegation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function rootInput() {
  return {
    organizationId: "organization-1",
    createdByUserId: "user-1",
    assignedAgentVersionId: "version-1",
    objective: "Root work",
    completionCriteria: "Complete work",
    inputResourceRefs: [],
    input: {},
    applicationVersion: "1.0.0",
    authorizingGitSha: "a".repeat(40),
    cliVersion: "1.0.0",
    reportedModel: "gpt-5",
  };
}

function followUpInput() {
  return {
    organizationId: "organization-1",
    sessionId: "session-1",
    taskId: "task-1",
    requestedByUserId: "user-1",
    predecessorAttemptId: "predecessor-attempt-1",
    intent: "follow_up" as const,
    input: {},
    applicationVersion: "1.0.0",
    authorizingGitSha: "a".repeat(40),
    cliVersion: "1.0.0",
    reportedModel: "gpt-5",
  };
}

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
