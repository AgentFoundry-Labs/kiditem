import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeAdapterRegistry } from "../../../../application/service/agent-runtime-adapter.registry";
import { AgentSessionRuntimeCleanupAdapter } from "../agent-session-runtime-cleanup.adapter";
import { HermesHttpRuntimeAdapter, type HermesRuntimeTransport } from "../hermes-http-runtime.adapter";
import { RuntimeCredentialBroker } from "../runtime-credential-broker";

const base = {
  signal: new AbortController().signal,
  organizationId: "org-1",
  sessionId: "00000000-0000-4000-8000-000000000001",
  executionId: "00000000-0000-4000-8000-000000000002",
  attemptId: "00000000-0000-4000-8000-000000000003",
  startIntentId: "00000000-0000-4000-8000-000000000004",
  handle: null,
};

function hermesTransport(): HermesRuntimeTransport {
  return {
    start: vi.fn(), connect: vi.fn(), inspect: vi.fn(), interrupt: vi.fn(), cancel: vi.fn(),
    inspectStartIntent: vi.fn().mockResolvedValue({ status: "cancelled" }),
    cancelStartIntent: vi.fn(), revokeStartIntent: vi.fn().mockResolvedValue(undefined),
  } as never;
}

describe("AgentSessionRuntimeCleanupAdapter", () => {
  it("propagates the exact abort reason when runtime cleanup fails after cancellation", async () => {
    const controller = new AbortController();
    const abortReason = new Error("session cleanup cancelled");
    const runtime = {
      cleanup: vi.fn(async () => {
        throw abortReason;
      }),
    };
    const adapter = new AgentSessionRuntimeCleanupAdapter({
      requireExactCleanup: vi.fn().mockReturnValue(runtime),
    });

    controller.abort(abortReason);

    await expect(adapter.cleanup({ ...base, signal: controller.signal, runtimeType: "hermes_http" })).rejects.toBe(abortReason);
  });

  it("dispatches only the exact registered runtime cleanup capability", async () => {
    const registry = new AgentRuntimeAdapterRegistry();
    const transport = hermesTransport();
    registry.register(new HermesHttpRuntimeAdapter({
      transport,
      credentialBroker: new RuntimeCredentialBroker({ secret: "test-secret-at-least-32-characters-long" }),
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      toolRegistry: new Map(),
    }));
    const adapter = new AgentSessionRuntimeCleanupAdapter(registry);

    await expect(adapter.cleanup({ ...base, runtimeType: "hermes_http" })).resolves.toEqual({
      state: "clean", executionAuthority: "irrevocably_revoked", credentials: "irrevocably_revoked",
      handle: "removed", filesystem: "not_owned",
    });
    await expect(adapter.cleanup({ ...base, runtimeType: "claude_cli" })).resolves.toEqual({
      state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN",
    });
    expect(transport.revokeStartIntent).toHaveBeenCalledWith(expect.objectContaining({
      startIntentId: base.startIntentId, executionId: base.executionId, attemptId: base.attemptId,
    }));
  });
});
