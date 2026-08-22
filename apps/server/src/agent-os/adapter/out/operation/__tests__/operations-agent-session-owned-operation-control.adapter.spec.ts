import { describe, expect, it, vi } from "vitest";
import { OperationsAgentSessionOwnedOperationControlAdapter } from "../operations-agent-session-owned-operation-control.adapter";

describe("OperationsAgentSessionOwnedOperationControlAdapter", () => {
  it("revalidates the exact session-owned closure and absorbs individual native cancellation errors", async () => {
    const exact = { fenceAndCancel: vi.fn().mockResolvedValue([{ runId: "run-1", state: "fenced" }]) };
    const adapter = new OperationsAgentSessionOwnedOperationControlAdapter(
      { validateOwnedClosure: vi.fn().mockResolvedValue([{ runId: "run-1", operationKey: "agent-os.execute-session-task", expectedAttemptToken: "token-1" }]) } as never,
      exact as never,
    );

    await expect(adapter.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: "org-1",
      sessionId: "00000000-0000-4000-8000-000000000001",
      operationRunIds: ["run-1"],
    })).resolves.toEqual({ state: "fenced" });
    expect(exact.fenceAndCancel).toHaveBeenCalledWith(expect.objectContaining({
      runs: [expect.objectContaining({ runId: "run-1" })],
    }));
  });
});
