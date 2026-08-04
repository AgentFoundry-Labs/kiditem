import { z } from 'zod';
import { zIsoDate } from './common.js';

const OperationKeySchema = z.string().min(1).max(200);
const OperationJsonSchema = z.record(z.string(), z.unknown());
const OperationResultForbiddenKey =
  /(?:^|[_-])(file|base64|rows?|raw|payload|response|html|cookie|token|credential|secret)(?:$|[_-])/i;
const BrowserRuntimeIdSchema = z.string().min(1).max(120);

function validateSafeOperationResult(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Operation result must be JSON serializable',
    });
    return;
  }

  if (serialized.length > 32 * 1024) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Operation result must not exceed 32KB',
    });
  }

  const visit = (candidate: unknown, path: (string | number)[]): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (candidate === null || typeof candidate !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(
      candidate as Record<string, unknown>,
    )) {
      if (OperationResultForbiddenKey.test(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsafe operation result field is not allowed: ${key}`,
          path: [...path, key],
        });
      }
      visit(nested, [...path, key]);
    }
  };

  visit(value, []);
}

export const OperationStatusSchema = z.enum([
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
  'attention_required',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
]);

export const OperationEngineTypeSchema = z.enum([
  'domain',
  'composite',
  'workflow',
  'agent_os',
  'ai_direct',
  'browser',
]);

export const OperationTriggerSourceSchema = z.enum([
  'dashboard',
  'domain_screen',
  'agent',
  'schedule',
  'system',
]);

export const OperationMisfirePolicySchema = z.enum(['skip', 'catch_up_once']);

export const CreateOperationRunRequestSchema = z
  .object({
    sourceSurface: z.enum(['dashboard', 'domain_screen']),
    input: OperationJsonSchema.default({}),
  })
  .strict();

export const UpsertOperationScheduleRequestSchema = z
  .object({
    cronExpression: z.string().min(9).max(120),
    timeZone: z.string().min(1).max(80),
    misfirePolicy: OperationMisfirePolicySchema,
    enabled: z.boolean(),
    input: OperationJsonSchema.default({}),
  })
  .strict();

export const OperationRunActorSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200).nullable(),
    email: z.string().email().max(320).nullable(),
  })
  .strict();

export const OperationRunErrorSchema = z
  .object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(2_000),
  })
  .strict();

export const OperationRunSchema = z
  .object({
    id: z.string().uuid(),
    operationKey: OperationKeySchema,
    definitionVersion: z.number().int().positive(),
    title: z.string().min(1).max(300),
    ownerDomain: z.string().min(1).max(120),
    engineType: OperationEngineTypeSchema,
    status: OperationStatusSchema,
    triggerSource: OperationTriggerSourceSchema,
    parentRunId: z.string().uuid().nullable(),
    scheduleId: z.string().uuid().nullable(),
    nativeRunType: z.string().min(1).max(120).nullable(),
    nativeRunId: z.string().min(1).max(200).nullable(),
    progress: z.number().min(0).max(1).nullable(),
    result: OperationJsonSchema.nullable(),
    error: OperationRunErrorSchema.nullable(),
    requestedBy: OperationRunActorSchema.nullable(),
    scheduledFor: zIsoDate.nullable(),
    startedAt: zIsoDate.nullable(),
    finishedAt: zIsoDate.nullable(),
    createdAt: zIsoDate,
    updatedAt: zIsoDate,
  })
  .strict();

export const OperationDefinitionSchema = z
  .object({
    key: OperationKeySchema,
    version: z.number().int().positive(),
    title: z.string().min(1).max(300),
    ownerDomain: z.string().min(1).max(120),
    engineType: OperationEngineTypeSchema,
    scheduleSupported: z.boolean(),
  })
  .strict();

export const OperationScheduleSchema = z
  .object({
    id: z.string().uuid(),
    operationKey: OperationKeySchema,
    cronExpression: z.string().min(9).max(120),
    timeZone: z.string().min(1).max(80),
    misfirePolicy: OperationMisfirePolicySchema,
    input: OperationJsonSchema,
    enabled: z.boolean(),
    nextRunAt: zIsoDate.nullable(),
    lastScheduledFor: zIsoDate.nullable(),
    createdAt: zIsoDate,
    updatedAt: zIsoDate,
  })
  .strict();

export const OperationCatalogResponseSchema = z
  .object({ items: z.array(OperationDefinitionSchema) })
  .strict();
export const OperationRunListResponseSchema = z
  .object({ items: z.array(OperationRunSchema) })
  .strict();
export const OperationScheduleListResponseSchema = z
  .object({ items: z.array(OperationScheduleSchema) })
  .strict();

export const BrowserOperationClaimSchema = z
  .object({
    runId: z.string().uuid(),
    operationKey: OperationKeySchema,
    attemptToken: z.string().uuid(),
    attempt: z.number().int().positive(),
    input: OperationJsonSchema,
    leaseExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const BrowserOperationClaimRequestSchema = z
  .object({
    runtimeId: BrowserRuntimeIdSchema,
    environmentId: z.enum(['local', 'office', 'staging']),
  })
  .strict();

export const BrowserOperationHeartbeatRequestSchema = z
  .object({
    attemptToken: z.string().uuid(),
    progress: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

export const BrowserOperationReportRequestSchema = z
  .object({
    attemptToken: z.string().uuid(),
    status: z.enum(['running', 'attention_required', 'succeeded', 'failed']),
    progress: z.number().min(0).max(1).nullable().optional(),
    result: OperationJsonSchema.optional(),
    errorCode: z.string().min(1).max(120).optional(),
    errorMessage: z.string().min(1).max(2_000).optional(),
    attentionReason: z.string().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.result !== undefined) {
      validateSafeOperationResult(report.result, context);
    }
    if (
      report.status === 'attention_required' &&
      report.attentionReason === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Attention reports require attentionReason',
        path: ['attentionReason'],
      });
    }
    if (
      report.status === 'failed' &&
      (report.errorCode === undefined || report.errorMessage === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Failed reports require errorCode and errorMessage',
      });
    }
  });

export type OperationStatus = z.infer<typeof OperationStatusSchema>;
export type OperationEngineType = z.infer<typeof OperationEngineTypeSchema>;
export type OperationTriggerSource = z.infer<typeof OperationTriggerSourceSchema>;
export type OperationMisfirePolicy = z.infer<typeof OperationMisfirePolicySchema>;
export type CreateOperationRunRequest = z.infer<
  typeof CreateOperationRunRequestSchema
>;
export type UpsertOperationScheduleRequest = z.infer<
  typeof UpsertOperationScheduleRequestSchema
>;
export type OperationRunActor = z.infer<typeof OperationRunActorSchema>;
export type OperationRunError = z.infer<typeof OperationRunErrorSchema>;
export type OperationRun = z.infer<typeof OperationRunSchema>;
export type OperationDefinition = z.infer<typeof OperationDefinitionSchema>;
export type OperationSchedule = z.infer<typeof OperationScheduleSchema>;
export type OperationCatalogResponse = z.infer<
  typeof OperationCatalogResponseSchema
>;
export type OperationRunListResponse = z.infer<
  typeof OperationRunListResponseSchema
>;
export type OperationScheduleListResponse = z.infer<
  typeof OperationScheduleListResponseSchema
>;
export type BrowserOperationClaim = z.infer<typeof BrowserOperationClaimSchema>;
export type BrowserOperationClaimRequest = z.infer<
  typeof BrowserOperationClaimRequestSchema
>;
export type BrowserOperationHeartbeatRequest = z.infer<
  typeof BrowserOperationHeartbeatRequestSchema
>;
export type BrowserOperationReportRequest = z.infer<
  typeof BrowserOperationReportRequestSchema
>;
