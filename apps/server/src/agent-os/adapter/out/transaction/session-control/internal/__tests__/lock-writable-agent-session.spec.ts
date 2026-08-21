import { describe, expect, it, vi } from "vitest";
import {
  lockAgentSessionForDeletion,
  lockWritableAgentSession,
} from "../lock-writable-agent-session";

const input = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
};

describe("lockWritableAgentSession", () => {
  it("takes the lifecycle advisory lock before locking and returning the scoped row", async () => {
    const tx = transaction({
      id: input.sessionId,
      created_by_user_id: "00000000-0000-4000-8000-000000000003",
      lifecycle: "active",
      deletion_operation_run_id: null,
      deletion_failure_code: null,
    });

    await expect(lockWritableAgentSession(tx as never, input)).resolves.toEqual({
      id: input.sessionId,
      createdByUserId: "00000000-0000-4000-8000-000000000003",
      lifecycle: "active",
      deletionOperationRunId: null,
      deletionFailureCode: null,
    });
    expect(tx.calls).toEqual(["advisory", "row"]);
  });

  it("throws the stable scope error for an absent or cross-organization row", async () => {
    const tx = transaction();

    await expect(lockWritableAgentSession(tx as never, input)).rejects.toMatchObject({
      code: "AGENT_SESSION_CONTROL_SCOPE_INVALID",
    });
  });

  it.each(["deleting", "delete_failed"])(
    "rejects %s through the stable writable-state fence",
    async (lifecycle) => {
      const tx = transaction({
        id: input.sessionId,
        created_by_user_id: "00000000-0000-4000-8000-000000000003",
        lifecycle,
        deletion_operation_run_id:
          "00000000-0000-4000-8000-000000000004",
        deletion_failure_code: "STORAGE_DELETE_UNKNOWN",
      });

      await expect(lockWritableAgentSession(tx as never, input)).rejects.toMatchObject({
        code: "AGENT_SESSION_CONTROL_STATE_CONFLICT",
      });
    },
  );

  it("lets deletion inspect a locked scoped row, but returns null outside scope", async () => {
    const present = transaction({
      id: input.sessionId,
      created_by_user_id: "00000000-0000-4000-8000-000000000003",
      lifecycle: "delete_failed",
      deletion_operation_run_id: null,
      deletion_failure_code: "STORAGE_DELETE_UNKNOWN",
    });

    await expect(lockAgentSessionForDeletion(present as never, input)).resolves.toEqual({
      id: input.sessionId,
      createdByUserId: "00000000-0000-4000-8000-000000000003",
      lifecycle: "delete_failed",
      deletionOperationRunId: null,
      deletionFailureCode: "STORAGE_DELETE_UNKNOWN",
    });
    await expect(
      lockAgentSessionForDeletion(transaction() as never, input),
    ).resolves.toBeNull();
  });
});

function transaction(row?: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    $executeRaw: vi.fn(async () => {
      calls.push("advisory");
    }),
    $queryRaw: vi.fn(async () => {
      calls.push("row");
      return row ? [row] : [];
    }),
  };
}
