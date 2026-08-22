import { describe, expect, it } from "vitest";
import { RuntimeCredentialBroker } from "../../../../adapter/out/runtime/runtime-credential-broker";
import { AgentRuntimeCredentialVerificationService } from "../agent-runtime-credential-verification.service";

const scope = {
  organizationId: "org-1",
  sessionId: "00000000-0000-4000-8000-000000000001",
  executionId: "00000000-0000-4000-8000-000000000002",
  attemptId: "00000000-0000-4000-8000-000000000003",
  startIntentId: "00000000-0000-4000-8000-000000000004",
  runtimeCredentialGeneration: 0,
};

describe("AgentRuntimeCredentialVerificationService", () => {
  it("rejects an issued token after a deletion generation fence when recreated", async () => {
    const broker = new RuntimeCredentialBroker({
      secret: "test-secret-at-least-32-characters-long",
    });
    const token = broker.issue(scope).token;
    const repository = {
      loadRuntimeCredentialAuthority: async () => ({
        ...scope,
        lifecycle: "deleting",
      }),
    };
    const verifier = new AgentRuntimeCredentialVerificationService(
      broker,
      repository as never,
    );

    await expect(verifier.verify({ token })).rejects.toThrow(
      "RUNTIME_CREDENTIAL_REVOKED",
    );
    await expect(
      new AgentRuntimeCredentialVerificationService(
        broker,
        repository as never,
      ).verify({ token }),
    ).rejects.toThrow("RUNTIME_CREDENTIAL_REVOKED");
  });
});
