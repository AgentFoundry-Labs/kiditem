import { z } from 'zod';
import { zIsoDate } from './common.js';

// WorkflowStepRun — WorkflowRun의 steps[] 내 각 item
// 출처: workflows.service.ts — Prisma WorkflowStepRun 직접 반환
// ⚠️ Date fields: startedAt, completedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const WorkflowStepRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  nodeId: z.string(),
  nodeType: z.string(),
  nodeLabel: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  inputData: z.record(z.unknown()).nullable(),
  outputData: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: zIsoDate.nullable(),
  completedAt: zIsoDate.nullable(),
});

// GET /api/workflows 응답의 각 item
// 출처: workflows.service.ts findAll() — Prisma WorkflowTemplate 직접 반환
// ⚠️ Date fields: createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const WorkflowTemplateSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
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
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// GET /api/workflows/:id/runs, GET /api/workflow-runs/:runId 응답
// 출처: workflows.service.ts getRuns() — Prisma WorkflowRun 직접 반환
// ⚠️ Date fields: startedAt, completedAt, createdAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const WorkflowRunSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  templateId: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  triggeredBy: z.string(),
  contextData: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: zIsoDate.nullable(),
  completedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  // include relation (optional)
  steps: z.array(WorkflowStepRunSchema).optional(),
});

// 타입 export
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type WorkflowStepRun = z.infer<typeof WorkflowStepRunSchema>;
