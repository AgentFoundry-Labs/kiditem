import { describe, expect, it, vi } from "vitest";
import { AgentSessionDeletionExecutionService } from "../agent-session-deletion-execution.service";

const input = {
  signal: new AbortController().signal,
  organizationId: "org-1",
  sessionId: "00000000-0000-4000-8000-0000dd000001",
  operationRunId: "00000000-0000-4000-8000-0000dd000002",
  attemptToken: "delete-attempt-token",
  fallbackConsumedAttempts: 1,
  enterEphemeralFinalization: vi.fn().mockResolvedValue({
    signal: new AbortController().signal,
  }),
};

function ready(snapshot: Record<string, unknown>) {
  return { kind: "ready", snapshot };
}

describe("AgentSessionDeletionExecutionService", () => {
  it("enters ephemeral finalization and deletes the graph only after cleanup is confirmed", async () => {
    const graph = vi.fn().mockResolvedValue(undefined);
    const enterEphemeralFinalization = vi.fn().mockResolvedValue({
      signal: new AbortController().signal,
    });
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 1,
          consumedAttempts: 1,
          runtimeAttempts: [],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "closure-digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
      deleteGraphAndCheckpoint: graph,
      hasGraphDeletedCheckpoint: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(
      service.execute({ ...input, enterEphemeralFinalization } as never),
    ).resolves.toEqual({
      kind: "completed",
    });
    expect(enterEphemeralFinalization).toHaveBeenCalledOnce();
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        operationRunId: input.operationRunId,
        attemptToken: input.attemptToken,
        fencedClosureDigest: "closure-digest",
      }),
    );
  });

  it("reconciles a lost graph commit acknowledgement in the same lifecycle", async () => {
    const graph = vi.fn().mockRejectedValue(new Error("commit_ack_lost"));
    const checkpoint = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient_read_failure"))
      .mockResolvedValueOnce(true);
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 1,
          consumedAttempts: 1,
          runtimeAttempts: [],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "closure-digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
      deleteGraphAndCheckpoint: vi.fn(),
      hasGraphDeletedCheckpoint: vi.fn(),
      deleteGraphAndCheckpoint: graph,
      hasGraphDeletedCheckpoint: checkpoint,
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(
      service.execute({
        ...input,
        enterEphemeralFinalization: vi
          .fn()
          .mockResolvedValue({ signal: input.signal }),
      } as never),
    ).resolves.toEqual({ kind: "completed" });
    expect(checkpoint).toHaveBeenCalledTimes(2);
  });

  it("marks a queued owned attempt without a start intent never_started and skips runtime cleanup", async () => {
    const cleanup = { cleanup: vi.fn() };
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 1,
          consumedAttempts: 1,
          runtimeAttempts: [
            {
              executionId: "00000000-0000-4000-8000-0000dd000003",
              attemptId: "00000000-0000-4000-8000-0000dd000004",
              runtimeType: "hermes_http",
              state: "never_started",
            },
          ],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "closure-digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
      deleteGraphAndCheckpoint: vi.fn(),
      hasGraphDeletedCheckpoint: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      cleanup as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "completed",
    });
    expect(cleanup.cleanup).not.toHaveBeenCalled();
  });

  it("never makes a persisted runtime_starting CLI attempt ready for graph deletion when exact cleanup is unavailable", async () => {
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 3,
          consumedAttempts: 2,
          runtimeAttempts: [
            {
              executionId: "00000000-0000-4000-8000-0000dd000003",
              attemptId: "00000000-0000-4000-8000-0000dd000004",
              startIntentId: "00000000-0000-4000-8000-0000dd000005",
              runtimeType: "codex_cli",
              state: "started",
              handle: null,
            },
          ],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      {
        cleanup: vi
          .fn()
          .mockResolvedValue({
            state: "unknown",
            code: "RUNTIME_CLEANUP_UNKNOWN",
          }),
      } as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "retryable",
      code: "RUNTIME_CLEANUP_UNKNOWN",
      consumedAttempts: 2,
    });
  });

  it("derives the storage erase key only from scoped artifact identity", async () => {
    const storage = {
      abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
    };
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: vi.fn().mockResolvedValue(
          ready({
            retryGeneration: 1,
            consumedAttempts: 1,
            runtimeAttempts: [],
            operationRuns: [],
            operationRunIds: [],
            artifacts: [
              {
                artifactId: "00000000-0000-4000-8000-0000dd000009",
                materializationOperationRunId: "run",
                providerUploadId: null,
              },
            ],
            closureDigest: "digest",
          }),
        ),
        terminalizeOwnedRun: vi.fn(),
        deleteGraphAndCheckpoint: vi.fn(),
        hasGraphDeletedCheckpoint: vi.fn(),
      } as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      storage as never,
    );

    await service.execute(input);
    expect(storage.abortEraseAndConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "agent-artifacts/org-1/00000000-0000-4000-8000-0000dd000001/00000000-0000-4000-8000-0000dd000009",
      }),
    );
  });

  it("erases a verified active artifact before graph contraction without using multipart cleanup", async () => {
    const deleteActiveAndConfirm = vi
      .fn()
      .mockResolvedValue({ state: "erased" });
    const abortEraseAndConfirm = vi.fn();
    const graph = vi.fn().mockResolvedValue(undefined);
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: vi.fn().mockResolvedValue(
          ready({
            retryGeneration: 1,
            consumedAttempts: 1,
            runtimeAttempts: [],
            operationRuns: [],
            operationRunIds: [],
            artifacts: [
              {
                artifactId: "00000000-0000-4000-8000-0000dd000009",
                lifecycle: "active",
                materializationOperationRunId: "run",
                providerUploadId: null,
              },
            ],
            closureDigest: "digest",
          }),
        ),
        terminalizeOwnedRun: vi.fn(),
        deleteGraphAndCheckpoint: graph,
        hasGraphDeletedCheckpoint: vi.fn(),
      } as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { deleteActiveAndConfirm, abortEraseAndConfirm } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "completed",
    });
    expect(deleteActiveAndConfirm).toHaveBeenCalledOnce();
    expect(abortEraseAndConfirm).not.toHaveBeenCalled();
    expect(graph).toHaveBeenCalledOnce();
  });

  it("keeps a materializing artifact fail-closed when multipart cleanup is unknown", async () => {
    const graph = vi.fn();
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: vi.fn().mockResolvedValue(
          ready({
            retryGeneration: 1,
            consumedAttempts: 4,
            runtimeAttempts: [],
            operationRuns: [],
            operationRunIds: [],
            artifacts: [
              {
                artifactId: "00000000-0000-4000-8000-0000dd000009",
                lifecycle: "materializing",
                materializationOperationRunId: "run",
                providerUploadId: "multipart-upload",
              },
            ],
            closureDigest: "digest",
          }),
        ),
        terminalizeOwnedRun: vi.fn(),
        deleteGraphAndCheckpoint: graph,
        hasGraphDeletedCheckpoint: vi.fn(),
      } as never,
      {
        fenceAndCancel: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn(),
        confirmFenced: vi.fn().mockResolvedValue({ state: "fenced" }),
      } as never,
      {
        deleteActiveAndConfirm: vi.fn(),
        abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "unknown" }),
      } as never,
    );

    await expect(service.execute(input)).resolves.toEqual({
      kind: "retryable",
      code: "STORAGE_DELETE_UNKNOWN",
      consumedAttempts: 4,
    });
    expect(graph).not.toHaveBeenCalled();
  });

  it("classifies an unexpected operation-control failure without consuming another deletion attempt", async () => {
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 1,
          consumedAttempts: 3,
          runtimeAttempts: [],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi
          .fn()
          .mockRejectedValue(new Error("operation_control_fault")),
      } as never,
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

  it("keeps the caller's persisted attempt count when loading the fenced snapshot fails", async () => {
    const service = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: vi
          .fn()
          .mockRejectedValue(new Error("snapshot_read_fault")),
      } as never,
      { fenceAndCancel: vi.fn() } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(
      service.execute({ ...input, fallbackConsumedAttempts: 4 }),
    ).resolves.toEqual({
      kind: "retryable",
      code: "SESSION_DELETION_INVARIANT",
      consumedAttempts: 4,
    });
  });

  it("propagates the exact abort reason when an external operation observes cancellation", async () => {
    const controller = new AbortController();
    const abortReason = new Error("caller_cancelled");
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 1,
          consumedAttempts: 2,
          runtimeAttempts: [],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi.fn().mockImplementation(async () => {
          controller.abort(abortReason);
          throw new Error("provider_cancelled_after_abort");
        }),
      } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(
      service.execute({ ...input, signal: controller.signal }),
    ).rejects.toBe(abortReason);
  });

  it("propagates the exact abort reason when operation control resolves after cancellation", async () => {
    const controller = new AbortController();
    const abortReason = new Error("caller_cancelled_after_operation_control");
    const transaction = {
      loadFencedSnapshot: vi.fn().mockResolvedValue(
        ready({
          retryGeneration: 1,
          consumedAttempts: 2,
          runtimeAttempts: [],
          operationRuns: [],
          operationRunIds: [],
          artifacts: [],
          closureDigest: "digest",
        }),
      ),
      terminalizeOwnedRun: vi.fn(),
    };
    const service = new AgentSessionDeletionExecutionService(
      transaction as never,
      {
        fenceAndCancel: vi.fn(async () => {
          controller.abort(abortReason);
          return {
            state: "unknown",
            code: "SESSION_OPERATION_OWNERSHIP_INVALID",
          };
        }),
      } as never,
      { cleanup: vi.fn() } as never,
      { beginFence: vi.fn(), confirmFenced: vi.fn() } as never,
      { abortEraseAndConfirm: vi.fn() } as never,
    );

    await expect(
      service.execute({ ...input, signal: controller.signal }),
    ).rejects.toBe(abortReason);
  });
});
