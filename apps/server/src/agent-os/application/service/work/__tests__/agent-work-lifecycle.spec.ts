import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SOURCING_CAPABILITIES } from "../../../../../sourcing/domain/capability/sourcing.capabilities";
import { SourcingScrapeSnapshotAdmissionGuard } from "../../../../../sourcing/adapter/in/agent/sourcing-scrape-snapshot-admission.guard";
import {
  AgentCapabilityInvocationService,
  canonicalize,
  hash,
} from "../agent-capability-invocation.service";
import { AgentWorkProjectionService } from "../agent-work-projection.service";

const base = {
  organizationId: "org",
  sessionId: "session",
  taskId: "task",
  attemptId: "attempt",
  agentVersionId: "version",
  initiatingUserId: "user",
  capabilityKey: "products.inspect",
  ownerDomain: "products",
  authorizationKind: "agent_default_scope" as const,
  authorizationExpiresAt: new Date("2030-01-01"),
};

function capability(overrides: Record<string, unknown> = {}) {
  return {
    key: "products.inspect",
    ownerDomain: "products",
    description: "inspect",
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({}),
    effects: ["read"],
    approvalRisk: "none",
    idempotency: "none",
    ownerInputPort: "products.inspect",
    ...overrides,
  };
}

describe("replacement Agent work lifecycle", () => {
  it("authorizes a read by retaining only its canonical input hash", async () => {
    const authorizeInvocation = vi.fn().mockResolvedValue({
      invocationId: "i",
      approvalId: null,
      invocationStatus: "authorized",
      approvalStatus: null,
    });
    const service = new AgentCapabilityInvocationService(
      { authorizeInvocation } as never,
      { resolveDefinition: vi.fn().mockReturnValue(capability()) } as never,
    );
    await service.authorize({ ...base, input: { z: 1, a: { y: 2, x: 3 } } });
    expect(authorizeInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalInput: undefined,
        initialStatus: "authorized",
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("freezes mutation input and creates a pending approval for medium risk", async () => {
    const authorizeInvocation = vi.fn().mockResolvedValue({
      invocationId: "i",
      approvalId: "a",
      invocationStatus: "approval_pending",
      approvalStatus: "pending",
    });
    const service = new AgentCapabilityInvocationService(
      { authorizeInvocation } as never,
      {
        resolveDefinition: vi.fn().mockReturnValue(
          capability({
            key: "products.write",
            effects: ["db_write"],
            approvalRisk: "medium",
            idempotency: "required",
          }),
        ),
      } as never,
    );
    await service.authorize({
      ...base,
      capabilityKey: "products.write",
      ownerIdempotencyKey: "owner-key",
      input: { z: 1, a: 2 },
    });
    expect(authorizeInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalInput: { a: 2, z: 1 },
        initialStatus: "approval_pending",
        approval: expect.objectContaining({ status: "pending" }),
      }),
    );
  });

  it("runs a domain-owned pre-authorization admission guard before persisting a mutation invocation", async () => {
    const authorizeInvocation = vi.fn().mockResolvedValue({});
    const admit = vi.fn().mockResolvedValue(undefined);
    const retainAuthorizedReplay = vi.fn();
    const service = new AgentCapabilityInvocationService(
      { authorizeInvocation } as never,
      {
        resolveDefinition: vi.fn().mockReturnValue(
          capability({
            key: "sourcing.ingestCandidate",
            ownerDomain: "sourcing",
            effects: ["db_write"],
            approvalRisk: "low",
            idempotency: "required",
          }),
        ),
      } as never,
      undefined,
      { admit, retainAuthorizedReplay } as never,
    );

    await service.authorize({
      ...base,
      capabilityKey: "sourcing.ingestCandidate",
      ownerIdempotencyKey: "owner-key",
      input: { snapshot: { contentHash: "a".repeat(64) } },
    });

    expect(admit).toHaveBeenCalledWith(expect.objectContaining({
      capabilityKey: "sourcing.ingestCandidate",
      input: { snapshot: { contentHash: "a".repeat(64) } },
    }));
    expect(admit.mock.invocationCallOrder[0]).toBeLessThan(authorizeInvocation.mock.invocationCallOrder[0]);
    expect(retainAuthorizedReplay.mock.invocationCallOrder[0]).toBeGreaterThan(
      authorizeInvocation.mock.invocationCallOrder[0],
    );
  });

  it("preserves an exact Sourcing ingest retry after durable authorization but never authorizes a fabricated snapshot", async () => {
    let now = new Date("2030-01-01T00:00:00.000Z");
    const snapshot = {
      sourceUrl: "https://detail.1688.com/offer/1.html",
      platform: "1688" as const,
      title: "Toy",
      price: 1,
      currency: "CNY",
      variantKeyNormalized: "",
      images: [],
      contentHash: "a".repeat(64),
    };
    const input = { snapshot };
    const guard = new SourcingScrapeSnapshotAdmissionGuard({
      now: () => now,
      ttlMs: 100,
    });
    const authorizeInvocation = vi.fn().mockResolvedValue({
      invocationId: "i",
      approvalId: null,
      invocationStatus: "ready",
      approvalStatus: null,
      applicationVersion: "1.0.0",
      authorizingGitSha: "a".repeat(40),
      runtimeType: "codex_cli",
    });
    const definition = SOURCING_CAPABILITIES.find(
      (candidate) => candidate.key === "sourcing.ingestCandidate",
    );
    const service = new AgentCapabilityInvocationService(
      { authorizeInvocation } as never,
      { resolveDefinition: vi.fn().mockReturnValue(definition) } as never,
      () => now,
      guard,
    );
    const request = {
      ...base,
      capabilityKey: "sourcing.ingestCandidate",
      authorizationExpiresAt: new Date("2030-01-01T00:30:00.000Z"),
      ownerIdempotencyKey: "owner-key",
      input,
    };
    guard.recordScrapeSnapshot({
      organizationId: request.organizationId,
      initiatingUserId: request.initiatingUserId,
      attemptId: request.attemptId,
      snapshot,
    });

    await expect(service.authorize(request)).resolves.toMatchObject({
      invocationId: "i",
    });
    now = new Date(now.getTime() + 101);
    await expect(service.authorize(request)).resolves.toMatchObject({
      invocationId: "i",
    });
    expect(authorizeInvocation).toHaveBeenCalledTimes(2);

    const fabricated = new AgentCapabilityInvocationService(
      { authorizeInvocation } as never,
      { resolveDefinition: vi.fn().mockReturnValue(definition) } as never,
      () => now,
      guard,
    );
    await expect(fabricated.authorize({
      ...request,
      attemptId: "different-attempt",
    })).rejects.toThrow("sourcing_scrape_snapshot_unbound");
    expect(authorizeInvocation).toHaveBeenCalledTimes(2);
  });

  it("ignores forged read metadata and derives mutation HITL from the code-owned definition", async () => {
    const authorizeInvocation = vi.fn().mockResolvedValue({});
    const service = new AgentCapabilityInvocationService(
      { authorizeInvocation } as never,
      {
        resolveDefinition: vi.fn().mockReturnValue(
          capability({
            key: "products.write",
            effects: ["db_write"],
            approvalRisk: "high",
            idempotency: "required",
          }),
        ),
      } as never,
    );
    await service.authorize({
      ...base,
      capabilityKey: "products.write",
      ownerIdempotencyKey: "owner",
      input: {},
    } as never);
    expect(authorizeInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: ["db_write"],
        approvalRisk: "high",
        initialStatus: "approval_pending",
      }),
    );
  });

  it("derives needs_continue only from open work with no live work", () => {
    const projection = new AgentWorkProjectionService();
    expect(
      projection.project({
        taskStatus: "open",
        hasLiveAttempt: false,
        hasPendingApproval: false,
        hasReadyOrExecutingMutation: false,
        hasLiveChild: false,
        needsInput: false,
        lastAttemptFailed: false,
      }),
    ).toBe("needs_continue");
    expect(
      projection.project({
        taskStatus: "cancelled",
        hasLiveAttempt: false,
        hasPendingApproval: false,
        hasReadyOrExecutingMutation: false,
        hasLiveChild: false,
        needsInput: false,
        lastAttemptFailed: false,
      }),
    ).toBe("terminal");
  });

  it("projects open-work blockers ahead of a live parent and failed tasks as errors", () => {
    const projection = new AgentWorkProjectionService();
    const baseProjection = {
      taskStatus: "open" as const,
      hasLiveAttempt: true,
      hasPendingApproval: false,
      hasReadyOrExecutingMutation: false,
      hasLiveChild: false,
      needsInput: false,
      lastAttemptFailed: false,
    };
    expect(projection.project({ ...baseProjection, hasPendingApproval: true })).toBe("awaiting_approval");
    expect(projection.project({ ...baseProjection, hasReadyOrExecutingMutation: true })).toBe("awaiting_operation");
    expect(projection.project({ ...baseProjection, hasLiveChild: true })).toBe("awaiting_child");
    expect(projection.project(baseProjection)).toBe("running");
    expect(projection.project({ ...baseProjection, taskStatus: "failed", lastAttemptFailed: false })).toBe("error");
    expect(projection.project({ ...baseProjection, taskStatus: "completed", lastAttemptFailed: true })).toBe("terminal");
    expect(projection.project({ ...baseProjection, taskStatus: "cancelled", lastAttemptFailed: true })).toBe("terminal");
  });

  it("rejects non-JSON and cyclic inputs while hashing key order deterministically", () => {
    const cyclicObject: Record<string, unknown> = {};
    cyclicObject.self = cyclicObject;
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    for (const value of [
      Infinity,
      undefined,
      () => {},
      cyclicObject,
      cyclicArray,
    ]) {
      expect(() => canonicalize(value)).toThrow("invalid_canonical_json");
    }
    expect(hash(canonicalize({ b: 1, a: 2 }))).toBe(
      hash(canonicalize({ a: 2, b: 1 })),
    );
  });

  it("matrix 8: fingerprints the full contract, fences expiry, and bounds approval deadlines", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const calls: Record<string, unknown>[] = [];
    const authorizeInvocation = vi.fn().mockImplementation(async (input) => {
      calls.push(input);
      return { invocationId: `${calls.length}`, approvalId: null, invocationStatus: "authorized", approvalStatus: null };
    });
    const invoke = async (
      inputSchema: z.ZodTypeAny,
      outputSchema: z.ZodTypeAny,
      approvalExpiresAt?: Date,
      authorizationExpiresAt = new Date("2030-01-03T00:00:00.000Z"),
    ) => {
      const service = new AgentCapabilityInvocationService(
        { authorizeInvocation } as never,
        { resolveDefinition: vi.fn().mockReturnValue(capability({
          key: "products.write",
          effects: ["db_write"],
          approvalRisk: "medium",
          idempotency: "required",
          inputSchema,
          outputSchema,
        })) } as never,
        () => now,
      );
      await service.authorize({
        ...base,
        capabilityKey: "products.write",
        authorizationExpiresAt,
        approvalExpiresAt,
        ownerIdempotencyKey: `key-${calls.length}`,
        input: { a: 1 },
      });
      return calls.at(-1)!;
    };
    const first = await invoke(z.object({ a: z.number() }), z.object({ ok: z.boolean() }), new Date("2030-01-04T00:00:00.000Z"));
    const identical = await invoke(z.object({ a: z.number() }), z.object({ ok: z.boolean() }));
    const changedInput = await invoke(z.object({ a: z.number(), note: z.string().optional() }), z.object({ ok: z.boolean() }));
    const changedOutput = await invoke(z.object({ a: z.number() }), z.object({ result: z.boolean() }));
    expect(first.capabilityContractFingerprint).toBe(identical.capabilityContractFingerprint);
    expect(changedInput.capabilityContractFingerprint).not.toBe(first.capabilityContractFingerprint);
    expect(changedOutput.capabilityContractFingerprint).not.toBe(first.capabilityContractFingerprint);
    expect(first.approval).toMatchObject({ expiresAt: new Date("2030-01-02T00:00:00.000Z") });
    const requestedFirst = await invoke(
      z.object({ a: z.number() }),
      z.object({ ok: z.boolean() }),
      new Date("2030-01-01T01:00:00.000Z"),
    );
    expect(requestedFirst.approval).toMatchObject({
      expiresAt: new Date("2030-01-01T01:00:00.000Z"),
    });
    const authorizationFirst = await invoke(
      z.object({ a: z.number() }),
      z.object({ ok: z.boolean() }),
      undefined,
      new Date("2030-01-01T02:00:00.000Z"),
    );
    expect(authorizationFirst.approval).toMatchObject({
      expiresAt: new Date("2030-01-01T02:00:00.000Z"),
    });

    const expiredTransactions = { authorizeInvocation: vi.fn() };
    const expired = new AgentCapabilityInvocationService(
      expiredTransactions as never,
      { resolveDefinition: vi.fn().mockReturnValue(capability()) } as never,
      () => now,
    );
    await expect(expired.authorize({ ...base, authorizationExpiresAt: now, input: {} })).rejects.toMatchObject({ code: "authorization_expired" });
    expect(expiredTransactions.authorizeInvocation).not.toHaveBeenCalled();
  });
});
