import { z } from "zod";

const AgentSessionIndependentLegalAuditBasisCodeSchema = z.enum([
  "financial_recordkeeping",
  "regulatory_inquiry",
]);

export const AgentSessionIndependentLegalAuditClassificationSchema = z
  .object({
    retentionClass: z.literal("independent_legal_audit"),
    independentLegalBasisCode:
      AgentSessionIndependentLegalAuditBasisCodeSchema,
    independentRetentionDueAt: z.date(),
  })
  .strict();

const AgentSessionLegalAuditProjectionBaseSchema = z.object({
  organizationId: z.string().uuid(),
  legalBasisCode: AgentSessionIndependentLegalAuditBasisCodeSchema,
  retentionDueAt: z.date(),
  sourceOccurredAt: z.date(),
  recordCount: z.literal(1),
});

export const AgentSessionLegalAuditProjectionSchema = z.discriminatedUnion(
  "recordKind",
  [
    AgentSessionLegalAuditProjectionBaseSchema.extend({
      recordKind: z.literal("artifact"),
      inputTokens: z.null(),
      outputTokens: z.null(),
      costMicros: z.null(),
      currency: z.null(),
    }).strict(),
    AgentSessionLegalAuditProjectionBaseSchema.extend({
      recordKind: z.literal("usage"),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costMicros: z.bigint().nonnegative(),
      currency: z.string().trim().length(3),
    }).strict(),
  ],
);
