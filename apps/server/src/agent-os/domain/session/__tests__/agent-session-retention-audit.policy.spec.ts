import { describe, expect, it } from "vitest";
import { AgentSessionIndependentLegalAuditClassificationSchema } from "../agent-session-retention-audit.policy";

describe("AgentSessionIndependentLegalAuditClassification", () => {
  it("accepts only explicit, versioned legal-audit classifications", () => {
    expect(
      AgentSessionIndependentLegalAuditClassificationSchema.parse({
        retentionClass: "independent_legal_audit",
        independentLegalBasisCode: "regulatory_inquiry",
        independentRetentionDueAt: new Date("2033-08-13T00:00:00.000Z"),
      }),
    ).toMatchObject({
      retentionClass: "independent_legal_audit",
      independentLegalBasisCode: "regulatory_inquiry",
    });

    expect(() =>
      AgentSessionIndependentLegalAuditClassificationSchema.parse({
        retentionClass: "session",
        independentLegalBasisCode: "free-form-legal-reason",
        independentRetentionDueAt: new Date("2033-08-13T00:00:00.000Z"),
      }),
    ).toThrow();
  });
});
