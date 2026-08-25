import { z } from "zod";
import { CanonicalResourceRefSchema } from "./resource-ref";

export const ResourceRefSchema = CanonicalResourceRefSchema;
export const OperationRefSchema = z
  .object({ kind: z.string().min(1).max(64), id: z.string().min(1).max(128) })
  .strict();
export const CapabilityInvocationStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
]);
export const CapabilityInvocationApprovalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
  "expired",
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
export const CapabilityResultEnvelopeSchema = z
  .object({
    summary: z.string().min(1).max(1_000),
    resourceRefs: z.array(ResourceRefSchema).max(50),
    operationRefs: z.array(OperationRefSchema).max(50),
    output: BoundedCanonicalJsonSchema.optional(),
  })
  .strict();
export const CapabilityInvocationErrorSchema = z
  .object({
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(1_000),
  })
  .strict();

export type ResourceRef = z.infer<typeof ResourceRefSchema>;
export type OperationRef = z.infer<typeof OperationRefSchema>;
export type CapabilityResultEnvelope = z.infer<
  typeof CapabilityResultEnvelopeSchema
>;
export type CapabilityInvocationError = z.infer<
  typeof CapabilityInvocationErrorSchema
>;
export type CapabilityInvocationStatus = z.infer<
  typeof CapabilityInvocationStatusSchema
>;
export type CapabilityInvocationApprovalStatus = z.infer<
  typeof CapabilityInvocationApprovalStatusSchema
>;
export type CapabilityIdempotency = z.infer<typeof CapabilityIdempotencySchema>;
