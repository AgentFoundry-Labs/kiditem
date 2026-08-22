import { describe, expect, it, vi } from "vitest";
import { AgentSessionRuntimeCleanupAdapter } from "../agent-session-runtime-cleanup.adapter";

const base = {
  signal: new AbortController().signal,
  organizationId: "org-1",
  sessionId: "00000000-0000-4000-8000-000000000001",
  executionId: "00000000-0000-4000-8000-000000000002",
  attemptId: "00000000-0000-4000-8000-000000000003",
  startIntentId: "00000000-0000-4000-8000-000000000004",
  handle: null,
};

describe("AgentSessionRuntimeCleanupAdapter", () => {
  it.each(["hermes_http", "codex_cli", "claude_cli", "copilotkit_agui"])(
    "proves complete cleanup for %s without treating a missing handle as success",
    async (runtimeType) => {
      const cleanup = vi.fn().mockResolvedValue({
        state: "clean",
        executionAuthority: "irrevocably_revoked",
        credentials: "irrevocably_revoked",
        handle: "removed",
        filesystem: runtimeType === "hermes_http" || runtimeType === "copilotkit_agui" ? "not_owned" : "removed",
      });
      const adapter = new AgentSessionRuntimeCleanupAdapter({
        requireExact: vi.fn().mockReturnValue({ cleanup }),
      } as never);

      await expect(adapter.cleanup({ ...base, runtimeType })).resolves.toEqual(
        expect.objectContaining({ state: "clean" }),
      );
      expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({
        runtimeType,
        startIntentId: base.startIntentId,
        handle: null,
      }));
    },
  );

  it("returns unknown for a runtime that cannot prove handle-less cleanup", async () => {
    const adapter = new AgentSessionRuntimeCleanupAdapter({
      requireExact: vi.fn().mockReturnValue({
        cleanup: vi.fn().mockResolvedValue({ state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" }),
      }),
    } as never);
    await expect(adapter.cleanup({ ...base, runtimeType: "hermes_http" })).resolves.toEqual({
      state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN",
    });
  });
});
