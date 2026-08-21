import { describe, expect, it } from "vitest";
import { isOwnedAgentSessionArtifactReference } from "../agent-session-artifact-reference.policy";

describe("isOwnedAgentSessionArtifactReference", () => {
  const organizationId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

  it("accepts only canonical organization-partitioned immutable artifact keys", () => {
    expect(
      isOwnedAgentSessionArtifactReference(
        organizationId,
        `agent-artifacts/${organizationId}/11111111-1111-4111-8111-111111111111`,
      ),
    ).toBe(true);
    expect(
      isOwnedAgentSessionArtifactReference(
        organizationId,
        "vault://unowned/credential",
      ),
    ).toBe(false);
  });
});
