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
          storageReference: "https://storage.local/kiditem/agent-artifacts/due-object",
        }])
        .mockResolvedValueOnce([]),
      hasLiveArtifactReference: vi.fn().mockResolvedValue(false),
      hasLaterArtifactErasureClaim: vi.fn().mockResolvedValue(false),
      completeArtifactErasure: vi.fn().mockResolvedValue(undefined),
      deferArtifactErasure: vi.fn().mockResolvedValue(undefined),
      retryArtifactErasure: vi.fn().mockResolvedValue(undefined),
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
      expiredAuditProjections: 2,
    });
    await expect(service.drain({ now, limit: 10 })).resolves.toEqual({
      erased: 0,
      deferred: 0,
      retried: 0,
      expiredAuditProjections: 2,
    });
    expect(eraser.erase).toHaveBeenCalledOnce();
    expect(transactions.completeArtifactErasure).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
    }));
  });

  it("does not erase a reference that is still live or retained by a later claim", async () => {
    const transactions = {
      claimDueArtifactErasures: vi.fn().mockResolvedValue([{
        id: "claim-1",
        organizationId: ORGANIZATION_ID,
        storageReference: "https://storage.local/kiditem/agent-artifacts/shared-object",
      }]),
      hasLiveArtifactReference: vi.fn().mockResolvedValue(true),
      hasLaterArtifactErasureClaim: vi.fn().mockResolvedValue(false),
      completeArtifactErasure: vi.fn().mockResolvedValue(undefined),
      deferArtifactErasure: vi.fn().mockResolvedValue(undefined),
      retryArtifactErasure: vi.fn().mockResolvedValue(undefined),
      deleteDueLegalAuditProjections: vi.fn().mockResolvedValue(0),
    };
    const eraser = { erase: vi.fn() };
    const service = new AgentSessionLifecycleMaintenanceService(
      transactions as never,
      eraser as never,
    );

    await expect(service.drain({
      now: new Date("2026-08-21T00:00:00.000Z"),
      limit: 10,
    })).resolves.toMatchObject({ deferred: 1 });
    expect(eraser.erase).not.toHaveBeenCalled();
    expect(transactions.deferArtifactErasure).toHaveBeenCalledWith(expect.objectContaining({
      deferCode: "live_reference",
    }));
  });
});
