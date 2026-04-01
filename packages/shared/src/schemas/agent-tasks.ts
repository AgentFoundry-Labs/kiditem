import { z } from 'zod';

// GET /api/agent-tasks 응답의 각 item
// 출처: agent-tasks.service.ts findAll() — Prisma AgentTask 직접 반환
// ⚠️ Date fields: createdAt, updatedAt, completedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
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
