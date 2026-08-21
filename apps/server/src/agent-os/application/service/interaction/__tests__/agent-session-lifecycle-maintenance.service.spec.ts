import { describe, expect, it, vi } from "vitest";
import { AgentSessionLifecycleMaintenanceService } from "../agent-session-lifecycle-maintenance.service";

const ORGANIZATION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("AgentSessionLifecycleMaintenanceService", () => {
  it("retries a durable claim after a crash and erases the object exactly once", async () => {
    const transactions = {
      claimDueArtifactErasures: vi.fn()
        .mockResolvedValueOnce([{
          id: "claim-1",
          organizationId: ORGANIZATION_ID,
          storageReference: `agent-artifacts/${ORGANIZATION_ID}/11111111-1111-4111-8111-111111111111`,
        }])
        .mockResolvedValueOnce([]),
      completeArtifactErasure: vi.fn().mockResolvedValue(undefined),
      retryArtifactErasure: vi.fn().mockResolvedValue(undefined),
      quarantineArtifactErasure: vi.fn().mockResolvedValue(undefined),
      claimDueSessionDeletions: vi.fn().mockResolvedValue([]),
      releaseRetentionDeletionClaim: vi.fn().mockResolvedValue(undefined),
      deleteDueLegalAuditProjections: vi.fn().mockResolvedValue(2),
    };
    const eraser = {
      erase: vi.fn().mockResolvedValue({ outcome: "erased" }),
    };
    const service = new AgentSessionLifecycleMaintenanceService(
      transactions as never,
      eraser as never,
    );
    const now = new Date("2026-08-21T00:00:00.000Z");

    await expect(service.drain({ now, limit: 10 })).resolves.toEqual({
      erased: 1,
      deferred: 0,
      retried: 0,
      quarantined: 0,
      deletedSessions: 0,
      retentionRetried: 0,
      expiredAuditProjections: 2,
    });
    await expect(service.drain({ now, limit: 10 })).resolves.toEqual({
      erased: 0,
      deferred: 0,
      retried: 0,
      quarantined: 0,
      deletedSessions: 0,
      retentionRetried: 0,
      expiredAuditProjections: 2,
    });
    expect(eraser.erase).toHaveBeenCalledOnce();
    expect(transactions.completeArtifactErasure).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
    }));
  });

  it("quarantines corrupt persisted references without retrying or deleting them", async () => {
    const transactions = {
      claimDueArtifactErasures: vi.fn().mockResolvedValue([{
        id: "claim-1",
        organizationId: ORGANIZATION_ID,
        storageReference: "vault://corrupt/credential",
      }]),
      completeArtifactErasure: vi.fn().mockResolvedValue(undefined),
      retryArtifactErasure: vi.fn().mockResolvedValue(undefined),
      quarantineArtifactErasure: vi.fn().mockResolvedValue(undefined),
      claimDueSessionDeletions: vi.fn().mockResolvedValue([]),
      releaseRetentionDeletionClaim: vi.fn().mockResolvedValue(undefined),
      deleteDueLegalAuditProjections: vi.fn().mockResolvedValue(0),
    };
    const eraser = {
      erase: vi.fn().mockResolvedValue({
        outcome: "quarantined",
        errorCode: "invalid_reference",
      }),
    };
    const service = new AgentSessionLifecycleMaintenanceService(
      transactions as never,
      eraser as never,
    );

    await expect(service.drain({
      now: new Date("2026-08-21T00:00:00.000Z"),
      limit: 10,
    })).resolves.toMatchObject({ quarantined: 1, retried: 0 });
    expect(transactions.quarantineArtifactErasure).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "invalid_reference",
    }));
    expect(transactions.retryArtifactErasure).not.toHaveBeenCalled();
  });

  it("uses a deterministic fenced tombstone request for a due retention deletion", async () => {
    const transactions = {
      claimDueArtifactErasures: vi.fn().mockResolvedValue([]),
      completeArtifactErasure: vi.fn(),
      retryArtifactErasure: vi.fn(),
      quarantineArtifactErasure: vi.fn(),
      claimDueSessionDeletions: vi.fn().mockResolvedValue([{
        organizationId: ORGANIZATION_ID,
        sessionId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        copilotThreadId: "copilot-thread-1",
        retentionDueAt: new Date("2027-08-13T00:00:00.000Z"),
      }]),
      releaseRetentionDeletionClaim: vi.fn(),
      deleteDueLegalAuditProjections: vi.fn().mockResolvedValue(0),
    };
    const lifecycle = { deleteSession: vi.fn().mockResolvedValue({}) };
    const hasher = {
      hash: vi.fn(({ domain, value }) => ({ hash: `${domain}:${value}`, hashKeyVersion: "v1" })),
    };
    const service = new AgentSessionLifecycleMaintenanceService(
      transactions as never,
      { erase: vi.fn() } as never,
      lifecycle as never,
      hasher as never,
    );

    await expect(service.drain({
      now: new Date("2027-08-13T00:00:00.000Z"),
      limit: 10,
    })).resolves.toMatchObject({ deletedSessions: 1, retentionRetried: 0 });
    expect(lifecycle.deleteSession).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      systemRetention: expect.objectContaining({ claimToken: expect.any(String) }),
      tombstone: expect.objectContaining({
        organizationIdHash: expect.any(Object),
        copilotThreadIdHash: expect.any(Object),
      }),
    }));
  });

  it("exposes organization-removal scheduling through the maintenance input boundary", async () => {
    const transactions = {
      scheduleOrganizationRemoval: vi.fn().mockResolvedValue({
        archived: 2,
        terminal: 1,
        held: 1,
      }),
    };
    const service = new AgentSessionLifecycleMaintenanceService(
      transactions as never,
      { erase: vi.fn() } as never,
      {} as never,
      {} as never,
    );
    const now = new Date("2026-08-13T00:00:00.000Z");

    await expect(service.scheduleOrganizationRemoval({
      organizationId: ORGANIZATION_ID,
      now,
    })).resolves.toEqual({ archived: 2, terminal: 1, held: 1 });
    expect(transactions.scheduleOrganizationRemoval).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      now,
    });
  });
});
