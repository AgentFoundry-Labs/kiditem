import { describe, expect, it, vi } from "vitest";
import { AgentSessionDeletionExecutionService } from "../agent-session-deletion-execution.service";

const input = {
  signal: new AbortController().signal,
  organizationId: "org-1",
  sessionId: "00000000-0000-4000-8000-0000dd000001",
  operationRunId: "00000000-0000-4000-8000-0000dd000002",
  attemptToken: "delete-attempt-token",
};

function ready(snapshot: Record<string, unknown>) {
  return { kind: "ready", snapshot };
}

describe("AgentSessionDeletionExecutionService", () => {
  it("marks a queued owned attempt without a start intent never_started and skips runtime cleanup", async () => {
    const cleanup = { cleanup: vi.fn() };
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(ready({
        retryGeneration: 1,
        consumedAttempts: 1,
        runtimeAttempts: [{
          executionId: "00000000-0000-4000-8000-0000dd000003",
          attemptId: "00000000-0000-4000-8000-0000dd000004",
          runtimeType: "hermes_http",
          state: "never_started",
        }],
        operationRuns: [],
        operationRunIds: [],
        artifacts: [],
        closureDigest: "closure-digest",
      })),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      { fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }) } as never,
      cleanup as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "ready_for_graph_delete",
      closureDigest: "closure-digest",
    });
    expect(cleanup.cleanup).not.toHaveBeenCalled();
  });

  it("never makes a persisted runtime_starting CLI attempt ready for graph deletion when exact cleanup is unavailable", async () => {
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(ready({
        retryGeneration: 3,
        consumedAttempts: 2,
        runtimeAttempts: [{
          executionId: "00000000-0000-4000-8000-0000dd000003",
          attemptId: "00000000-0000-4000-8000-0000dd000004",
          startIntentId: "00000000-0000-4000-8000-0000dd000005",
          runtimeType: "codex_cli",
          state: "started",
          handle: null,
        }],
        operationRuns: [], operationRunIds: [], artifacts: [], closureDigest: "digest",
      })),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      { fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }) } as never,
      { cleanup: vi.fn().mockResolvedValue({ state: "unknown", code: "RUNTIME_CLEANUP_UNKNOWN" }) } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }) } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "retryable",
      code: "RUNTIME_CLEANUP_UNKNOWN",
      consumedAttempts: 2,
    });
  });

  it("derives the storage erase key only from scoped artifact identity", async () => {
    const storage = { abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }) };
    const service = new AgentSessionDeletionExecutionService(
      { loadFencedSnapshot: vi.fn().mockResolvedValue(ready({
        retryGeneration: 1, consumedAttempts: 1, runtimeAttempts: [], operationRuns: [], operationRunIds: [],
        artifacts: [{ artifactId: "00000000-0000-4000-8000-0000dd000009", materializationOperationRunId: "run", providerUploadId: null }],
        closureDigest: "digest",
      })), terminalizeOwnedRun: vi.fn() } as never,
      { fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }) } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }) } as never,
      storage as never,
    );

    await service.execute(input);
    expect(storage.abortEraseAndConfirm).toHaveBeenCalledWith(expect.objectContaining({
      key: "agent-artifacts/org-1/00000000-0000-4000-8000-0000dd000001/00000000-0000-4000-8000-0000dd000009",
    }));
  });

  it("classifies an unexpected operation-control failure without consuming another deletion attempt", async () => {
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(ready({
        retryGeneration: 1, consumedAttempts: 3, runtimeAttempts: [], operationRuns: [], operationRunIds: [],
        artifacts: [], closureDigest: "digest",
      })),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      { fenceAndCancel: vi.fn().mockRejectedValue(new Error("operation_control_fault")) } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "retryable",
      code: "SESSION_DELETION_INVARIANT",
      consumedAttempts: 3,
    });
  });

  it("propagates the exact abort reason when an external operation observes cancellation", async () => {
    const controller = new AbortController();
    const abortReason = new Error("caller_cancelled");
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(ready({
        retryGeneration: 1, consumedAttempts: 2, runtimeAttempts: [], operationRuns: [], operationRunIds: [],
        artifacts: [], closureDigest: "digest",
      })),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      { fenceAndCancel: vi.fn().mockImplementation(async () => {
        controller.abort(abortReason);
        throw new Error("provider_cancelled_after_abort");
      }) } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute({ ...input, signal: controller.signal })).rejects.toBe(abortReason);
  });

  it("propagates the exact abort reason when operation control resolves after cancellation", async () => {
    const controller = new AbortController();
    const abortReason = new Error("caller_cancelled_after_operation_control");
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(ready({
        retryGeneration: 1, consumedAttempts: 2, runtimeAttempts: [], operationRuns: [], operationRunIds: [],
        artifacts: [], closureDigest: "digest",
      })),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      { fenceAndCancel: vi.fn(async () => {
        controller.abort(abortReason);
        return { state: "unknown", code: "SESSION_OPERATION_OWNERSHIP_INVALID" };
      }) } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute({ ...input, signal: controller.signal })).rejects.toBe(abortReason);
  });
});
