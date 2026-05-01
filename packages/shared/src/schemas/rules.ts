import { z } from 'zod';

// GET /api/rules 응답의 각 item
// 출처: rules.service.ts findAllRules() — Prisma BusinessRule 모델 기반
export const RuleItemSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  severity: z.string(),
  field: z.string(),
  operator: z.string(),
  threshold: z.record(z.unknown()),
  messageTemplate: z.string(),
  actionType: z.string().nullable(),
  conditions: z.record(z.unknown()).nullable(),
  autoExecute: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RuleItem = z.infer<typeof RuleItemSchema>;
