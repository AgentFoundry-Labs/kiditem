import { describe, expect, it, vi } from "vitest";
import { StorageAgentSessionArtifactEraser } from "../storage-agent-session-artifact-eraser.adapter";

describe("StorageAgentSessionArtifactEraser", () => {
  it("erases an owned storage object without exposing its reference in the result", async () => {
    const organizationId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const storageReference = `agent-artifacts/${organizationId}/11111111-1111-4111-8111-111111111111`;
    const objects = new Set([storageReference]);
    const storage = {
      delete: vi.fn(async (key: string) => {
        objects.delete(key);
      }),
    };
    const eraser = new StorageAgentSessionArtifactEraser(storage as never);

    await expect(eraser.erase({
      organizationId,
      storageReference,
    })).resolves.toEqual({ outcome: "erased" });
    expect(objects.has(storageReference)).toBe(false);
    expect(storage.delete).toHaveBeenCalledWith(storageReference);
  });

  it("quarantines malformed persisted state without deleting a storage object", async () => {
    const storage = {
      delete: vi.fn(),
    };
    const eraser = new StorageAgentSessionArtifactEraser(storage as never);

    await expect(eraser.erase({
      organizationId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      storageReference: "vault://unowned/credential",
    })).resolves.toEqual({ outcome: "quarantined", errorCode: "invalid_reference" });
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
