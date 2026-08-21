import { describe, expect, it } from "vitest";
import {
  AgentInteractionRetentionPolicySchema,
  AgentSessionLifecycleCommandSchema,
} from "./lifecycle";

const session = "organizations/organization-1/agentSessions/session-1";

describe("agent interaction session lifecycle contracts", () => {
  it("accepts only a strict, normalized lifecycle command", () => {
    expect(
      AgentSessionLifecycleCommandSchema.parse({
        session,
        command: "archive",
        reason: "  Close the completed conversation  ",
        idempotencyKey: "lifecycle-command-key-01",
      }),
    ).toEqual({
      session,
      command: "archive",
      reason: "Close the completed conversation",
      idempotencyKey: "lifecycle-command-key-01",
    });

    for (const invalid of [
      { session, command: "archive", reason: "", idempotencyKey: "x".repeat(20) },
      { session, command: "purge", reason: "reason", idempotencyKey: "x".repeat(20) },
      { session, command: "delete", reason: "reason", idempotencyKey: "x".repeat(19) },
      { session, command: "delete", reason: "reason", idempotencyKey: "x".repeat(201) },
      { session, command: "delete", reason: "reason", idempotencyKey: "x".repeat(20), organizationId: "forged" },
    ]) {
      expect(() => AgentSessionLifecycleCommandSchema.parse(invalid)).toThrow();
    }
  });

  it("locks retention to a 365-day Korea-resident minimum", () => {
    expect(
      AgentInteractionRetentionPolicySchema.parse({
        legalPolicyVersion: "kr-v1",
      }),
    ).toEqual({
      sessionRetentionDays: 365,
      residency: "KR",
      legalPolicyVersion: "kr-v1",
    });

    for (const invalid of [
      { sessionRetentionDays: 364, residency: "KR", legalPolicyVersion: "kr-v1" },
      { sessionRetentionDays: 365.1, residency: "KR", legalPolicyVersion: "kr-v1" },
      { sessionRetentionDays: 365, residency: "US", legalPolicyVersion: "kr-v1" },
    ]) {
      expect(() => AgentInteractionRetentionPolicySchema.parse(invalid)).toThrow();
    }
  });
});
