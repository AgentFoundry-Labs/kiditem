import { z } from 'zod';
import { zIsoDate } from './common.js';

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

// GET /api/marketplace/workflows | /api/marketplace/agents 응답의 각 item
// 출처: marketplace.service.ts — Prisma Marketplace + computed fields
// ⚠️ Date fields: createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const MarketplaceCatalogItemSchema = z.object({
  id: z.string(),
  type: z.enum(['workflow', 'agent']),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string().nullable(),

  // Workflow 전용 (type="workflow"일 때만 사용)
  module: z.string().nullable(),
  nodesJson: z.any().optional(),
  edgesJson: z.any().optional(),

  // Agent 전용 (type="agent"일 때만 사용)
  role: z.string().nullable(),
  adapterType: z.string().nullable(),
  promptTemplate: z.string().nullable(),
  skills: z.array(z.string()),
  permissions: z.record(z.unknown()).nullable(),

  // 공통
  configurableParams: z.array(ConfigurableParamSchema),
  version: z.number(),
  installCount: z.number(),
  isPublished: z.boolean(),
  installed: z.boolean(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// 하위 호환 타입 별칭
export const WorkflowCatalogItemSchema = MarketplaceCatalogItemSchema;
export const AgentCatalogItemSchema = MarketplaceCatalogItemSchema;

// 타입 export
export type ConfigurableParam = z.infer<typeof ConfigurableParamSchema>;
export type MarketplaceCatalogItem = z.infer<typeof MarketplaceCatalogItemSchema>;
export type WorkflowCatalogItem = MarketplaceCatalogItem;
export type AgentCatalogItem = MarketplaceCatalogItem;
