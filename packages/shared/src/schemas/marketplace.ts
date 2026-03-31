import { z } from 'zod';

// 마켓플레이스 항목의 설정 가능한 파라미터
// 출처: marketplace-types.ts:3-11
export const ConfigurableParamSchema = z.object({
  key: z.string(),
  nodeId: z.string().optional(),
  label: z.string(),
  type: z.enum(['cron', 'number', 'string', 'select', 'boolean']),
  default: z.any(),
  options: z.array(z.object({
    label: z.string(),
    value: z.any(),
  })).optional(),
  description: z.string().optional(),
});

// GET /api/marketplace/workflows 응답의 각 item
// 출처: Prisma WorkflowMarketplace + computed fields
export const WorkflowCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  module: z.string(),
  category: z.string(),
  icon: z.string().nullable(),
  nodesJson: z.any(),
  edgesJson: z.any(),
  configurableParams: z.array(ConfigurableParamSchema),
  version: z.number(),
  installCount: z.number(),
  isPublished: z.boolean(),
  installed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// GET /api/marketplace/agents 응답의 각 item
// 출처: Prisma AgentMarketplace + computed fields
export const AgentCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  role: z.string(),
  category: z.string(),
  icon: z.string().nullable(),
  adapterType: z.string(),
  promptTemplate: z.string(),
  skills: z.array(z.string()),
  permissions: z.record(z.unknown()),
  configurableParams: z.array(ConfigurableParamSchema),
  version: z.number(),
  installCount: z.number(),
  isPublished: z.boolean(),
  installed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// 타입 export
export type ConfigurableParam = z.infer<typeof ConfigurableParamSchema>;
export type WorkflowCatalogItem = z.infer<typeof WorkflowCatalogItemSchema>;
export type AgentCatalogItem = z.infer<typeof AgentCatalogItemSchema>;
