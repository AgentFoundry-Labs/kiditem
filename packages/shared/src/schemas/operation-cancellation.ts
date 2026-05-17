import { z } from 'zod';

const ReasonSchema = z.string().max(500).optional();

export const CancelOperationTargetSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('operation_key'),
    operationKey: z.string(),
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('workflow_run'),
    runId: z.string(),
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('agent_run_request'),
    requestId: z.string(),
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('agent_run'),
    runId: z.string(),
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('content_generation'),
    generationId: z.string(),
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('thumbnail_generation'),
    generationId: z.string(),
    reason: ReasonSchema,
  }).strict(),
]);

export const CancelOperationStatusSchema = z.enum([
  'cancelled',
  'already_terminal',
  'not_cancellable',
]);

export const CancelOperationAffectedSchema = z.object({
  workflowRunIds: z.array(z.string()),
  agentRunRequestIds: z.array(z.string()),
  agentRunIds: z.array(z.string()),
  contentGenerationIds: z.array(z.string()),
  thumbnailGenerationIds: z.array(z.string()),
}).strict();

export const CancelOperationPreservedSchema = z.object({
  contentGenerationIds: z.array(z.string()),
  thumbnailGenerationIds: z.array(z.string()),
}).strict();

export const CancelOperationResponseSchema = z.object({
  ok: z.literal(true),
  status: CancelOperationStatusSchema,
  message: z.string(),
  operationKey: z.string().nullable(),
  affected: CancelOperationAffectedSchema,
  preserved: CancelOperationPreservedSchema,
  warnings: z.array(z.string()),
}).strict();

export type CancelOperationTarget = z.infer<typeof CancelOperationTargetSchema>;
export type CancelOperationStatus = z.infer<typeof CancelOperationStatusSchema>;
export type CancelOperationAffected = z.infer<typeof CancelOperationAffectedSchema>;
export type CancelOperationPreserved = z.infer<typeof CancelOperationPreservedSchema>;
export type CancelOperationResponse = z.infer<typeof CancelOperationResponseSchema>;

export function emptyCancelOperationAffected(): CancelOperationAffected {
  return {
    workflowRunIds: [],
    agentRunRequestIds: [],
    agentRunIds: [],
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}

export function emptyCancelOperationPreserved(): CancelOperationPreserved {
  return {
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}
