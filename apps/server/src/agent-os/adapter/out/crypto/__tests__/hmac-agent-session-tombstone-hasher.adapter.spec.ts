import { describe, expect, it } from "vitest";
import { HmacAgentSessionTombstoneHasher } from "../hmac-agent-session-tombstone-hasher.adapter";

describe("HmacAgentSessionTombstoneHasher", () => {
  it("produces versioned, domain-separated hashes and performs safe comparisons", () => {
    const hasher = new HmacAgentSessionTombstoneHasher(
      Buffer.from("k".repeat(32), "utf8"),
      "v1",
    );

    const organization = hasher.hash({
      domain: "organization",
      value: "organization-1",
    });
    const idempotency = hasher.hash({
      domain: "idempotency",
      value: "organization-1\u0000delete-key-00000001",
    });

    expect(organization).toEqual({
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      hashKeyVersion: "v1",
    });
    expect(idempotency.hash).not.toBe(organization.hash);
    expect(hasher.matches(organization, organization)).toBe(true);
    expect(hasher.matches(organization, idempotency)).toBe(false);
  });

  it("rejects an absent or short lifecycle key", () => {
    expect(() => new HmacAgentSessionTombstoneHasher(Buffer.alloc(31), "v1")).toThrow(
      "INTERACTION_LIFECYCLE_HMAC_KEY_INVALID",
    );
  });
});
