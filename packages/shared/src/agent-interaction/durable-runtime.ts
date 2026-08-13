import { z } from 'zod';

const uuidSchema = z.string().uuid();
const correlationSchema = {
  sessionId: uuidSchema,
  taskId: uuidSchema,
};
const executionCorrelationSchema = {
  ...correlationSchema,
  executionId: uuidSchema,
};
const idempotencyKeySchema = z.string().min(8).max(200);
const boundedLabelSchema = z.string().min(1).max(500);
const capabilityKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)*$/);
const navigationActionIdSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const AgentTaskStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_dependency',
  'waiting_approval',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);

export const AgentProgressEventSchema = z
  .object({
    name: z.literal('kiditem.ui.agent_progress.v1'),
    ...executionCorrelationSchema,
    status: AgentTaskStatusSchema,
    progress: z.number().min(0).max(1),
    label: boundedLabelSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();

const resourceVersionSchema = z
  .object({
    resourceType: z.string().min(1).max(128),
    resourceId: z.string().min(1).max(256),
    version: z.string().min(1).max(256),
  })
  .strict();

export const AgentApprovalCardSchema = z
  .object({
    name: z.literal('kiditem.ui.agent_approval.v1'),
    approvalId: uuidSchema,
    ...executionCorrelationSchema,
    capabilityKey: capabilityKeySchema,
    summary: boundedLabelSchema,
    resourceVersions: z.array(resourceVersionSchema).max(50),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const AgentApprovalDecisionSchema = z
  .object({
    approvalId: uuidSchema,
    ...executionCorrelationSchema,
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().max(2_000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const AgentArtifactCardSchema = z
  .object({
    name: z.literal('kiditem.ui.agent_artifact.v1'),
    artifactId: uuidSchema,
    ...executionCorrelationSchema,
    artifactType: z.string().min(1).max(128),
    label: boundedLabelSchema,
    sha256: sha256Schema,
    navigationActionId: navigationActionIdSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

const taskControlBaseSchema = z.object({
  ...correlationSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const RetryAgentTaskSchema = taskControlBaseSchema
  .extend({ expectedStatus: z.literal('failed') })
  .strict();
export const ResumeAgentTaskSchema = taskControlBaseSchema
  .extend({ expectedStatus: z.enum(['paused', 'waiting_dependency']) })
  .strict();
export const CancelAgentTaskSchema = taskControlBaseSchema
  .extend({
    expectedStatus: z.enum([
      'queued',
      'running',
      'waiting_dependency',
      'waiting_approval',
      'paused',
    ]),
  })
  .strict();

const agentVersionSummarySchema = z
  .object({
    id: uuidSchema,
    agentDefinitionKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    version: z.number().int().positive(),
  })
  .strict();

export const AgentDelegationEventSchema = z
  .object({
    name: z.literal('kiditem.ui.agent_delegation.v1'),
    sessionId: uuidSchema,
    parentTaskId: uuidSchema,
    childTaskId: uuidSchema,
    fromAgentVersion: agentVersionSummarySchema,
    toAgentVersion: agentVersionSummarySchema,
    status: z.enum(['created', 'running', 'completed', 'failed', 'cancelled']),
    createdAt: z.string().datetime(),
  })
  .strict();

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;
export type AgentProgressEvent = z.infer<typeof AgentProgressEventSchema>;
export type AgentApprovalCard = z.infer<typeof AgentApprovalCardSchema>;
export type AgentApprovalDecision = z.infer<typeof AgentApprovalDecisionSchema>;
export type AgentArtifactCard = z.infer<typeof AgentArtifactCardSchema>;
export type RetryAgentTask = z.infer<typeof RetryAgentTaskSchema>;
export type ResumeAgentTask = z.infer<typeof ResumeAgentTaskSchema>;
export type CancelAgentTask = z.infer<typeof CancelAgentTaskSchema>;
export type AgentDelegationEvent = z.infer<typeof AgentDelegationEventSchema>;
