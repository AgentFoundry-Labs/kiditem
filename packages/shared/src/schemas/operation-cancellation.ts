import { z } from 'zod';
import {
  AgentSessionNameSchema,
  AgentSessionTaskNameSchema,
  parseAgentSessionTaskName,
} from '../identifiers';

const ReasonSchema = z.string().max(500).optional();
const OperationKeySchema = z.string().min(1).max(200);
const TargetIdSchema = z.string().min(1);
const IdempotencyKeySchema = z.string().min(1).max(256);
const AgentSessionTaskCancellableStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_dependency',
  'waiting_approval',
  'paused',
]);

export const CANCEL_OPERATION_TARGET_TYPES = [
  'operation_key',
  'workflow_run',
  'agent_session_task',
  'content_generation',
  'thumbnail_generation',
] as const;

const AgentSessionTaskCancellationTargetSchema = z.object({
  targetType: z.literal('agent_session_task'),
  session: AgentSessionNameSchema,
  task: AgentSessionTaskNameSchema,
  idempotencyKey: IdempotencyKeySchema,
  expectedStatus: AgentSessionTaskCancellableStatusSchema,
  reason: ReasonSchema,
}).strict();

export const CancelOperationTargetSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('operation_key'),
    operationKey: OperationKeySchema,
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('workflow_run'),
    runId: TargetIdSchema,
    reason: ReasonSchema,
  }).strict(),
  AgentSessionTaskCancellationTargetSchema,
  z.object({
    targetType: z.literal('content_generation'),
    generationId: TargetIdSchema,
    reason: ReasonSchema,
  }).strict(),
  z.object({
    targetType: z.literal('thumbnail_generation'),
    generationId: TargetIdSchema,
    reason: ReasonSchema,
  }).strict(),
]).superRefine((value, context) => {
  if (value.targetType !== 'agent_session_task') return;
  try {
    parseAgentSessionTaskName(value.task, value.session);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['task'],
      message: 'task must belong to session',
    });
  }
});

export const CancelOperationStatusSchema = z.enum([
  'cancelled',
  'already_terminal',
  'not_cancellable',
]);

export const CancelOperationAffectedSchema = z.object({
  workflowRunIds: z.array(z.string()),
  agentSessionTaskNames: z.array(AgentSessionTaskNameSchema),
  contentGenerationIds: z.array(z.string()),
  thumbnailGenerationIds: z.array(z.string()),
  directAiJobIds: z.array(z.string()),
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
    agentSessionTaskNames: [],
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
    directAiJobIds: [],
  };
}

export function emptyCancelOperationPreserved(): CancelOperationPreserved {
  return {
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}
