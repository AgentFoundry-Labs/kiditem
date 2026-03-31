import { z } from 'zod';

// WorkflowStepRun — WorkflowRun의 steps[] 내 각 item
// 출처: Prisma WorkflowStepRun 모델 (schema.prisma:1090-1107)
export const WorkflowStepRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  nodeId: z.string(),
  nodeType: z.string(),
  nodeLabel: z.string(),
  status: z.string(),
  inputData: z.record(z.unknown()).nullable(),
  outputData: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

// GET /api/workflows 응답의 각 item
// 출처: Prisma WorkflowTemplate 모델 (schema.prisma:1040-1065)
export const WorkflowTemplateSchema = z.object({
  id: z.string(),
  companyId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  module: z.string(),
  isActive: z.boolean(),
  triggerType: z.string(),
  schedule: z.string().nullable(),
  nodesJson: z.any(),
  edgesJson: z.any(),
  version: z.number().nullable(),
  marketplaceId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// GET /api/workflows/:id/runs, GET /api/workflow-runs/:runId 응답
// 출처: Prisma WorkflowRun 모델 (schema.prisma:1068-1087)
export const WorkflowRunSchema = z.object({
  id: z.string(),
  companyId: z.string().nullable(),
  templateId: z.string(),
  status: z.string(),
  triggeredBy: z.string(),
  contextData: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  // include relation (optional)
  steps: z.array(WorkflowStepRunSchema).optional(),
});

// 타입 export
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type WorkflowStepRun = z.infer<typeof WorkflowStepRunSchema>;
