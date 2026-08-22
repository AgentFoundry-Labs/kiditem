import { describe, expect, it, vi } from "vitest";
import { OperationsAgentSessionOwnedOperationControlAdapter } from "../operations-agent-session-owned-operation-control.adapter";

describe("OperationsAgentSessionOwnedOperationControlAdapter", () => {
  it("forwards only exact typed coordinates to Operations control", async () => {
    const coordinate = {
      runId: "run-1", operationKey: "agent-os.execute-session-task", status: "running",
      expectedAttemptToken: "token-1", nativeRunType: null, nativeRunId: null,
    };
    const exact = { fenceAndCancel: vi.fn().mockResolvedValue([{ ...coordinate, state: "fenced" }]) };
    const adapter = new OperationsAgentSessionOwnedOperationControlAdapter(exact as never);

    await expect(adapter.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: "org-1",
      runs: [coordinate],
    })).resolves.toEqual({ state: "fenced" });
    expect(exact.fenceAndCancel).toHaveBeenCalledWith(expect.objectContaining({
      runs: [coordinate],
    }));
  });

  it("returns unknown when exact control reports native coordinates that drift from the deletion snapshot", async () => {
    const exact = { fenceAndCancel: vi.fn().mockResolvedValue([{
      runId: "run-1", state: "fenced", nativeRunType: "different-native", nativeRunId: "different-id",
    }]) };
    const adapter = new OperationsAgentSessionOwnedOperationControlAdapter(exact as never);

    await expect(adapter.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: "org-1",
      runs: [{
        runId: "run-1", operationKey: "agent-os.execute-session-task", status: "running",
        expectedAttemptToken: "token-1", nativeRunType: "expected-native", nativeRunId: "expected-id",
      }],
    })).resolves.toEqual({ state: "unknown", code: "SESSION_OPERATION_OWNERSHIP_INVALID" });
  });

  it("propagates the exact abort reason when exact control resolves unknown after cancellation", async () => {
    const controller = new AbortController();
    const abortReason = new Error("deletion_cancelled");
    const exact = {
      fenceAndCancel: vi.fn(async () => {
        controller.abort(abortReason);
        return [{
          runId: "run-1", state: "unknown", nativeRunType: null, nativeRunId: null,
        }];
      }),
    };
    const adapter = new OperationsAgentSessionOwnedOperationControlAdapter(exact as never);

    await expect(adapter.fenceAndCancel({
      signal: controller.signal,
      organizationId: "org-1",
      runs: [{
        runId: "run-1", operationKey: "agent-os.execute-session-task", status: "running",
        expectedAttemptToken: "token-1", nativeRunType: null, nativeRunId: null,
      }],
    })).rejects.toBe(abortReason);
  });
});
