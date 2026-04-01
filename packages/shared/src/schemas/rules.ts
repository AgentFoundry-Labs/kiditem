import { z } from 'zod';

// GET /api/rules 응답의 각 item
// 출처: rules.service.ts findAllRules() — Prisma HealthRule 직접 반환
// ⚠️ Date fields: createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const RuleItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  category: z.string(),
  ruleName: z.string(),
  description: z.string().nullable(),
  threshold: z.unknown(),
  severity: z.string(),
  active: z.boolean(),
  autoExecute: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RuleItem = z.infer<typeof RuleItemSchema>;
