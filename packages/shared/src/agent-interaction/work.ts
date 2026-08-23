import { z } from "zod";
import { CanonicalResourceRefSchema } from "./resource-ref";

export const ResourceRefSchema = CanonicalResourceRefSchema;
export const OperationRefSchema = z
  .object({ kind: z.string().min(1).max(64), id: z.string().min(1).max(128) })
  .strict();
export const AgentTaskStatusSchema = z.enum([
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
/** Bounded JSON only; raw provider/browser/tool payloads are never durable. */
export const BoundedCanonicalJsonSchema = z.unknown().superRefine((value, context) => {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > 64 * 1024) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'bounded_canonical_json_required' });
      return;
    }
    const visit = (node: unknown, depth: number): boolean => {
      if (depth > 8 || node === null || ['string', 'boolean'].includes(typeof node)) return depth <= 8;
      if (typeof node === 'number') return Number.isFinite(node);
      if (Array.isArray(node)) return node.length <= 100 && node.every((item) => visit(item, depth + 1));
      if (node && typeof node === 'object') {
        const entries = Object.entries(node as Record<string, unknown>);
        return entries.length <= 100 && entries.every(([key, item]) => key.length <= 128 && visit(item, depth + 1));
      }
      return false;
    };
    if (!visit(value, 0)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'bounded_canonical_json_required' });
  } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: 'bounded_canonical_json_required' }); }
});
export const CapabilityIdempotencySchema = z.enum([
  "none",
  "recommended",
  "required",
]);
export const AgentResultEnvelopeSchema = z
  .object({
    outcome: z.enum(["completed", "needs_input", "failed"]),
    summary: z.string().min(1).max(1_000),
    resourceRefs: z.array(ResourceRefSchema).max(50),
    operationRefs: z.array(OperationRefSchema).max(50),
    needsInput: z.object({ code: z.string().min(1).max(128), prompt: z.string().min(1).max(1_000) }).strict().optional(),
    error: z.object({ code: z.string().min(1).max(128), message: z.string().min(1).max(1_000) }).strict().optional(),
    output: BoundedCanonicalJsonSchema.optional(),
  })
  .strict();

export type ResourceRef = z.infer<typeof ResourceRefSchema>;
export type OperationRef = z.infer<typeof OperationRefSchema>;
export type AgentResultEnvelope = z.infer<typeof AgentResultEnvelopeSchema>;
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;
export type AgentAttemptStatus = z.infer<typeof AgentAttemptStatusSchema>;
export type AgentCapabilityInvocationStatus = z.infer<
  typeof AgentCapabilityInvocationStatusSchema
>;
export type AgentCapabilityApprovalStatus = z.infer<
  typeof AgentCapabilityApprovalStatusSchema
>;
export type AuthorizationKind = z.infer<typeof AuthorizationKindSchema>;
export type CapabilityIdempotency = z.infer<typeof CapabilityIdempotencySchema>;
