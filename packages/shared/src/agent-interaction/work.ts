import { z } from "zod";
import { CanonicalResourceRefSchema } from "./resource-ref";

export const ResourceRefSchema = CanonicalResourceRefSchema;
export const OperationRefSchema = z
  .object({ kind: z.string().min(1).max(64), id: z.string().min(1).max(128) })
  .strict();
export const AgentWorkTaskStatusSchema = z.enum([
  "open",
  "completed",
  "failed",
  "cancelled",
]);
export const AgentAttemptStatusSchema = z.enum([
  "starting",
  "running",
  "succeeded",
  "failed",
  "process_interrupted",
  "cancelled",
]);
export const AgentCapabilityInvocationStatusSchema = z.enum([
  "authorized",
  "approval_pending",
  "ready",
  "executing",
  "succeeded",
  "failed",
]);
export const AgentCapabilityApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export const AuthorizationKindSchema = z.enum([
  "agent_default_scope",
  "cross_domain_read_grant",
  "explicit_execution_grant",
]);
export const CapabilityIdempotencySchema = z.enum([
  "none",
  "recommended",
  "required",
]);
export const AgentResultEnvelopeSchema = z
  .object({
    outcome: z.enum(["completed", "needs_input", "failed"]),
    summary: z.string().min(1),
    resourceRefs: z.array(ResourceRefSchema),
    operationRefs: z.array(OperationRefSchema),
    needsInput: z.object({ code: z.string(), prompt: z.string() }).optional(),
    error: z.object({ code: z.string(), message: z.string() }).optional(),
    output: z.unknown().optional(),
  })
  .strict();

export type ResourceRef = z.infer<typeof ResourceRefSchema>;
export type OperationRef = z.infer<typeof OperationRefSchema>;
export type AgentResultEnvelope = z.infer<typeof AgentResultEnvelopeSchema>;
export type AgentWorkTaskStatus = z.infer<typeof AgentWorkTaskStatusSchema>;
export type AgentAttemptStatus = z.infer<typeof AgentAttemptStatusSchema>;
export type AgentCapabilityInvocationStatus = z.infer<
  typeof AgentCapabilityInvocationStatusSchema
>;
export type AgentCapabilityApprovalStatus = z.infer<
  typeof AgentCapabilityApprovalStatusSchema
>;
export type AuthorizationKind = z.infer<typeof AuthorizationKindSchema>;
export type CapabilityIdempotency = z.infer<typeof CapabilityIdempotencySchema>;
