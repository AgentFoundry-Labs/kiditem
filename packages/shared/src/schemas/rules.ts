import { z } from 'zod';

// GET /api/rules 응답의 각 item
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
