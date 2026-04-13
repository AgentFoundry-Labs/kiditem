import { z } from 'zod';

export const InspectionItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(['pass', 'warn', 'fail', 'pending']),
  severity: z.enum(['fail', 'warn']),
  message: z.string(),
  detail: z.string().optional(),
});

export const InspectionResultSchema = z.object({
  productId: z.string(),
  overall: z.enum(['pass', 'warn', 'fail']),
  items: z.array(InspectionItemSchema),
  checkedAt: z.string(),
});

export type InspectionItem = z.infer<typeof InspectionItemSchema>;
export type InspectionResult = z.infer<typeof InspectionResultSchema>;
