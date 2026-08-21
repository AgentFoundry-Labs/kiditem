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
