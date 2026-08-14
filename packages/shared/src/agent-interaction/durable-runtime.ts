import { z } from "zod";
import {
  AgentExecutionNameSchema,
  AgentSessionNameSchema,
  AgentSessionTaskNameSchema,
  AgentVersionNameSchema,
  IdempotencyKeySchema,
  parseAgentExecutionName,
  parseAgentSessionTaskName,
  Sha256DigestSchema,
} from "../identifiers";

const uuidSchema = z.string().uuid();
const taskCorrelationShape = {
  session: AgentSessionNameSchema,
  task: AgentSessionTaskNameSchema,
};
const executionCorrelationShape = {
  ...taskCorrelationShape,
  execution: AgentExecutionNameSchema,
};
const boundedLabelSchema = z.string().min(1).max(500);
const capabilityKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)*$/);
const navigationActionIdSchema = z.string().uuid();

const addCanonicalNameIssue = (
  context: z.RefinementCtx,
  path: string[],
  message: string,
) => {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
};

const hasMatchingNameParent = (parse: () => unknown) => {
  try {
    parse();
    return true;
  } catch {
    return false;
  }
};

const validateTaskCorrelation = (
  value: { session: string; task: string },
  context: z.RefinementCtx,
  taskPath = "task",
) => {
  if (
    !hasMatchingNameParent(() =>
      parseAgentSessionTaskName(value.task, value.session),
    )
  ) {
    addCanonicalNameIssue(
      context,
      [taskPath],
      "task must belong to the correlated session",
    );
  }
};

const validateExecutionCorrelation = (
  value: { session: string; task: string; execution: string },
  context: z.RefinementCtx,
) => {
  validateTaskCorrelation(value, context);
  if (
    !hasMatchingNameParent(() =>
      parseAgentExecutionName(value.execution, value.session),
    )
  ) {
    addCanonicalNameIssue(
      context,
      ["execution"],
      "execution must belong to the correlated session",
    );
  }
};

export const AgentTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_dependency",
  "waiting_approval",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const AgentProgressEventSchema = z
  .object({
    name: z.literal("kiditem.ui.agent_progress.v1"),
    ...executionCorrelationShape,
    status: AgentTaskStatusSchema,
    progress: z.number().min(0).max(1),
    label: boundedLabelSchema,
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine(validateExecutionCorrelation);

const resourceVersionSchema = z
  .object({
    resourceType: z.string().min(1).max(128),
    resourceId: z.string().min(1).max(256),
    version: z.string().min(1).max(256),
  })
  .strict();

export const AgentApprovalCardSchema = z
  .object({
    name: z.literal("kiditem.ui.agent_approval.v1"),
    approvalId: uuidSchema,
    ...executionCorrelationShape,
    capabilityKey: capabilityKeySchema,
    summary: boundedLabelSchema,
    resourceVersions: z.array(resourceVersionSchema).max(50),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .superRefine(validateExecutionCorrelation);

export const AgentApprovalDecisionSchema = z
  .object({
    approvalId: uuidSchema,
    ...executionCorrelationShape,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().max(2_000).optional(),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict()
  .superRefine(validateExecutionCorrelation);

export const AgentArtifactCardSchema = z
  .object({
    name: z.literal("kiditem.ui.agent_artifact.v1"),
    artifactId: uuidSchema,
    ...executionCorrelationShape,
    artifactType: z.string().min(1).max(128),
    label: boundedLabelSchema,
    sha256: Sha256DigestSchema,
    navigationActionId: navigationActionIdSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine(validateExecutionCorrelation);

const taskControlBaseSchema = z
  .object({
    ...taskCorrelationShape,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const RetryAgentTaskSchema = taskControlBaseSchema
  .extend({ expectedStatus: z.literal("failed") })
  .strict()
  .superRefine(validateTaskCorrelation);
export const ResumeAgentTaskSchema = taskControlBaseSchema
  .extend({ expectedStatus: z.enum(["paused", "waiting_dependency"]) })
  .strict()
  .superRefine(validateTaskCorrelation);
export const CancelAgentTaskSchema = taskControlBaseSchema
  .extend({
    expectedStatus: z.enum([
      "queued",
      "running",
      "waiting_dependency",
      "waiting_approval",
      "paused",
    ]),
  })
  .strict()
  .superRefine(validateTaskCorrelation);

export const AgentDelegationEventSchema = z
  .object({
    name: z.literal("kiditem.ui.agent_delegation.v1"),
    session: AgentSessionNameSchema,
    parentTask: AgentSessionTaskNameSchema,
    childTask: AgentSessionTaskNameSchema,
    fromAgentVersion: AgentVersionNameSchema,
    toAgentVersion: AgentVersionNameSchema,
    status: z.enum(["created", "running", "completed", "failed", "cancelled"]),
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    validateTaskCorrelation(
      { session: value.session, task: value.parentTask },
      context,
      "parentTask",
    );
    validateTaskCorrelation(
      { session: value.session, task: value.childTask },
      context,
      "childTask",
    );
  });

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;
export type AgentProgressEvent = z.infer<typeof AgentProgressEventSchema>;
export type AgentApprovalCard = z.infer<typeof AgentApprovalCardSchema>;
export type AgentApprovalDecision = z.infer<typeof AgentApprovalDecisionSchema>;
export type AgentArtifactCard = z.infer<typeof AgentArtifactCardSchema>;
export type RetryAgentTask = z.infer<typeof RetryAgentTaskSchema>;
export type ResumeAgentTask = z.infer<typeof ResumeAgentTaskSchema>;
export type CancelAgentTask = z.infer<typeof CancelAgentTaskSchema>;
export type AgentDelegationEvent = z.infer<typeof AgentDelegationEventSchema>;
