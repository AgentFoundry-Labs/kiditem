import { z } from "zod";
import { AgentSessionNameSchema } from "../identifiers";

export const AgentSessionLifecycleCommandKindSchema = z.enum([
  "archive",
  "delete",
  "place_legal_hold",
  "release_legal_hold",
]);

export const AgentSessionLifecycleCommandSchema = z
  .object({
    session: AgentSessionNameSchema,
    command: AgentSessionLifecycleCommandKindSchema,
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(20).max(200),
  })
  .strict();

export const AgentInteractionRetentionPolicySchema = z
  .object({
    sessionRetentionDays: z.number().int().min(365).default(365),
    residency: z.literal("KR").default("KR"),
    legalPolicyVersion: z.string().trim().min(1).max(128),
  })
  .strict();

export type AgentSessionLifecycleCommand = z.infer<
  typeof AgentSessionLifecycleCommandSchema
>;
export type AgentSessionLifecycleCommandKind = z.infer<
  typeof AgentSessionLifecycleCommandKindSchema
>;
export type AgentInteractionRetentionPolicy = z.infer<
  typeof AgentInteractionRetentionPolicySchema
>;
