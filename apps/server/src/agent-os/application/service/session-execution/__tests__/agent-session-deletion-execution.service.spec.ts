import { describe, expect, it, vi } from "vitest";
import { AgentSessionDeletionExecutionService } from "../agent-session-deletion-execution.service";

const input = {
  signal: new AbortController().signal,
  organizationId: "org-1",
  sessionId: "00000000-0000-4000-8000-0000dd000001",
  operationRunId: "00000000-0000-4000-8000-0000dd000002",
  attemptToken: "delete-attempt-token",
};

describe("AgentSessionDeletionExecutionService", () => {
  it("marks a queued owned attempt without a start intent never_started and skips runtime cleanup", async () => {
    const cleanup = { cleanup: vi.fn() };
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue({
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
      }),
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

  it("makes an unknown runtime cleanup safe-retryable with one consumed attempt", async () => {
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue({
        retryGeneration: 3,
        consumedAttempts: 2,
        runtimeAttempts: [{
          executionId: "00000000-0000-4000-8000-0000dd000003",
          attemptId: "00000000-0000-4000-8000-0000dd000004",
          startIntentId: "00000000-0000-4000-8000-0000dd000005",
          runtimeType: "hermes_http",
          state: "started",
          handle: null,
        }],
        operationRuns: [], operationRunIds: [], artifacts: [], closureDigest: "digest",
      }),
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
      { loadFencedSnapshot: vi.fn().mockResolvedValue({
        retryGeneration: 1, consumedAttempts: 1, runtimeAttempts: [], operationRuns: [], operationRunIds: [],
        artifacts: [{ artifactId: "00000000-0000-4000-8000-0000dd000009", materializationOperationRunId: "run", providerUploadId: null, key: "attacker-controlled" }],
        closureDigest: "digest",
      }), terminalizeOwnedRun: vi.fn() } as never,
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
});
