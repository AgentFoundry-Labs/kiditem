import { z } from 'zod';

// GET /api/agent-tasks 응답의 각 item
export const AgentTaskItemSchema = z.object({
  id: z.string(),
  agentType: z.string(),
  status: z.string(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
  companyId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type AgentTaskItem = z.infer<typeof AgentTaskItemSchema>;
