import { describe, expect, it, vi } from "vitest";
import { AgentInteractionSessionLifecycleService } from "../agent-interaction-session-lifecycle.service";

const ORGANIZATION_ID = "organization-1";
const SESSION_ID = "session-1";
const SESSION = `organizations/${ORGANIZATION_ID}/agentSessions/${SESSION_ID}`;
const ACTOR_ID = "user-1";
const command = {
  session: SESSION,
  command: "delete" as const,
  reason: "Delete the completed interaction",
  idempotencyKey: "delete-session-key-01",
};

function lifecycleTransaction(overrides: Record<string, unknown> = {}) {
  return {
    findDeletedTombstone: vi.fn().mockResolvedValue(null),
    readSession: vi.fn().mockResolvedValue({
      id: SESSION_ID,
      organizationId: ORGANIZATION_ID,
      lifecycle: "archived",
      legalHoldAt: null,
    }),
    readRetentionPolicy: vi.fn().mockResolvedValue(null),
    archiveSession: vi.fn().mockResolvedValue({
      retentionDueAt: new Date("2027-08-13T00:00:00.000Z"),
    }),
    setLegalHold: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn(),
    ...overrides,
  };
}

describe("AgentInteractionSessionLifecycleService", () => {
  it("rejects deletion under legal hold without entering the delete transaction", async () => {
    const transactions = lifecycleTransaction({
      readSession: vi.fn().mockResolvedValue({
        id: SESSION_ID,
        organizationId: ORGANIZATION_ID,
        lifecycle: "archived",
        legalHoldAt: new Date("2026-08-13T00:00:00.000Z"),
      }),
    });
    const service = new AgentInteractionSessionLifecycleService(
      transactions as never,
      {
        hash: vi.fn(({ domain, value }) => ({
          hash: `${domain}:${value}`,
          hashKeyVersion: "v1",
        })),
        matches: vi.fn((left, right) => left.hash === right.hash),
      } as never,
    );

    await expect(
      service.execute({
        organizationId: ORGANIZATION_ID,
        actorId: ACTOR_ID,
        ...command,
      }),
    ).rejects.toMatchObject({ code: "THREAD_LEGAL_HOLD" });

    expect(transactions.deleteSession).not.toHaveBeenCalled();
  });

  it("delegates an exact archive retry after the session has become archived", async () => {
    const transactions = lifecycleTransaction({
      readSession: vi.fn().mockResolvedValue({
        id: SESSION_ID,
        organizationId: ORGANIZATION_ID,
        lifecycle: "archived",
        legalHoldAt: null,
      }),
    });
    const service = new AgentInteractionSessionLifecycleService(
      transactions as never,
      { hash: vi.fn(), matches: vi.fn() } as never,
    );

    await expect(service.execute({
      organizationId: ORGANIZATION_ID,
      actorId: ACTOR_ID,
      ...command,
      command: "archive",
      idempotencyKey: "archive-session-key-01",
    })).resolves.toEqual({
      command: "archive",
      status: "archived",
      retentionDueAt: "2027-08-13T00:00:00.000Z",
    });
    expect(transactions.archiveSession).toHaveBeenCalledOnce();
  });

  it("delegates a release retry to the locked transaction", async () => {
    const transactions = lifecycleTransaction({
      readSession: vi.fn().mockResolvedValue({
        id: SESSION_ID,
        organizationId: ORGANIZATION_ID,
        lifecycle: "archived",
        legalHoldAt: null,
      }),
    });
    const service = new AgentInteractionSessionLifecycleService(
      transactions as never,
      { hash: vi.fn(), matches: vi.fn() } as never,
    );

    await expect(service.execute({
      organizationId: ORGANIZATION_ID,
      actorId: ACTOR_ID,
      session: SESSION,
      command: "release_legal_hold",
      reason: "Release after the inquiry closed",
      idempotencyKey: "release-hold-session-01",
    })).resolves.toMatchObject({ status: "legal_hold_released" });
    expect(transactions.setLegalHold).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
    }));
  });
});
