import { z } from 'zod';

export const ActionTaskRelatedProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  metric: z.string(),
  value: z.string(),
});

export const ActionTaskSourceAlertSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.string(),
  message: z.string().nullable(),
});

export const ActionTaskSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  taskKey: z.string(),
  type: z.string(),
  label: z.string(),
  detail: z.string().nullable(),
  where: z.string().nullable(),
  href: z.string().nullable(),
  priority: z.string(),
  status: z.string(),
  role: z.string().nullable(),
  apiCall: z.any().nullable(),
  result: z.any().nullable(),
  notes: z.array(z.object({ text: z.string(), createdAt: z.string() })),
  activityLog: z.array(z.object({
    action: z.string(),
    timestamp: z.string(),
    detail: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    success: z.boolean().optional(),
  })),
  date: z.string(),
  relatedProducts: z.array(ActionTaskRelatedProductSchema).optional(),
  assigneeUserId: z.string().nullable().optional(),
  assigneeUser: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  sourceAlert: ActionTaskSourceAlertSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ActionTask = z.infer<typeof ActionTaskSchema>;
export type ActionTaskRelatedProduct = z.infer<typeof ActionTaskRelatedProductSchema>;
export type ActionTaskSourceAlert = z.infer<typeof ActionTaskSourceAlertSchema>;

// =============================================================================
// W6a — root action-task boundary response schemas
// =============================================================================

export const ActionTaskListSchema = z.array(ActionTaskSchema);
export type ActionTaskList = z.infer<typeof ActionTaskListSchema>;

export const ActionTaskExecuteResponseSchema = ActionTaskSchema;
export type ActionTaskExecuteResponse = z.infer<typeof ActionTaskExecuteResponseSchema>;
