import { describe, expect, it } from "vitest";
import {
  AgentSessionIndependentLegalAuditClassificationSchema,
  AgentSessionLegalAuditProjectionSchema,
} from "../agent-session-retention-audit.policy";

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

describe("AgentSessionLegalAuditProjection", () => {
  it("keeps artifact and usage facts structurally separate while preserving currency and source time", () => {
    expect(AgentSessionLegalAuditProjectionSchema.parse({
      organizationId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      recordKind: "usage",
      legalBasisCode: "financial_recordkeeping",
      retentionDueAt: new Date("2033-08-13T00:00:00.000Z"),
      sourceOccurredAt: new Date("2026-08-13T00:00:00.000Z"),
      inputTokens: 17,
      outputTokens: 29,
      costMicros: 43n,
      currency: "KRW",
      recordCount: 1,
    })).toMatchObject({ currency: "KRW", inputTokens: 17 });

    expect(() => AgentSessionLegalAuditProjectionSchema.parse({
      organizationId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      recordKind: "artifact",
      legalBasisCode: "regulatory_inquiry",
      retentionDueAt: new Date("2033-08-13T00:00:00.000Z"),
      sourceOccurredAt: new Date("2026-08-13T00:00:00.000Z"),
      inputTokens: 1,
      outputTokens: null,
      costMicros: null,
      currency: null,
      recordCount: 1,
    })).toThrow();

    expect(() => AgentSessionLegalAuditProjectionSchema.parse({
      organizationId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      recordKind: "usage",
      legalBasisCode: "financial_recordkeeping",
      retentionDueAt: new Date("2033-08-13T00:00:00.000Z"),
      sourceOccurredAt: new Date("2026-08-13T00:00:00.000Z"),
      inputTokens: 1,
      outputTokens: 2,
      costMicros: 3n,
      recordCount: 1,
    })).toThrow();
  });
});
