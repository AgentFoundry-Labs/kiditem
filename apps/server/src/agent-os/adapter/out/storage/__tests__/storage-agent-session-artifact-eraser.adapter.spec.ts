import { describe, expect, it, vi } from "vitest";
import { StorageAgentSessionArtifactEraser } from "../storage-agent-session-artifact-eraser.adapter";

describe("StorageAgentSessionArtifactEraser", () => {
  it("erases an owned storage object without exposing its reference in the result", async () => {
    const objects = new Set(["agent-artifacts/due-object"]);
    const storage = {
      extractKey: vi.fn((reference: string) =>
        reference === "https://storage.local/kiditem/agent-artifacts/due-object"
          ? "agent-artifacts/due-object"
          : null,
      ),
      delete: vi.fn(async (key: string) => {
        objects.delete(key);
      }),
    };
    const eraser = new StorageAgentSessionArtifactEraser(storage as never);

    await expect(eraser.erase({
      storageReference: "https://storage.local/kiditem/agent-artifacts/due-object",
    })).resolves.toEqual({ outcome: "erased" });
    expect(objects.has("agent-artifacts/due-object")).toBe(false);
    expect(storage.delete).toHaveBeenCalledWith("agent-artifacts/due-object");
  });

  it("fails safely without deleting an unowned reference", async () => {
    const storage = {
      extractKey: vi.fn(() => null),
      delete: vi.fn(),
    };
    const eraser = new StorageAgentSessionArtifactEraser(storage as never);

    await expect(eraser.erase({
      storageReference: "vault://unowned/credential",
    })).resolves.toEqual({ outcome: "retry", errorCode: "unsupported_reference" });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("rejects a non-AgentOS key even when it belongs to the configured bucket", async () => {
    const storage = {
      extractKey: vi.fn(() => "inventory/private-product-source"),
      delete: vi.fn(),
    };
    const eraser = new StorageAgentSessionArtifactEraser(storage as never);

    await expect(eraser.erase({
      storageReference: "https://storage.local/kiditem/inventory/private-product-source",
    })).resolves.toEqual({ outcome: "retry", errorCode: "unsupported_reference" });
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
