import { z } from 'zod';

export const WorkflowStepSchema = z.object({
  index: z.number(),
  type: z.enum(['run_agent', 'approval_needed', 'completed', 'failed']),
  agentType: z.string().optional(),
  message: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const AgentWorkflowSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  companyId: z.string(),
  type: z.string(),
  status: z.string(),
  currentStep: z.number(),
  state: z.record(z.unknown()),
  steps: z.array(WorkflowStepSchema),
  input: z.record(z.unknown()).nullable(),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type AgentWorkflow = z.infer<typeof AgentWorkflowSchema>;

// 워크플로우 yield 이벤트 타입
export const WorkflowYieldSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    message: z.string(),
    step: z.number(),
  }),
  z.object({
    type: z.literal('approval_needed'),
    message: z.string(),
    data: z.record(z.unknown()),
    step: z.number(),
  }),
  z.object({
    type: z.literal('agent_result'),
    agentType: z.string(),
    result: z.record(z.unknown()),
    step: z.number(),
  }),
  z.object({
    type: z.literal('completed'),
    result: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('failed'),
    error: z.string(),
  }),
]);

export type WorkflowYield = z.infer<typeof WorkflowYieldSchema>;
