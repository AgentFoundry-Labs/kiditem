import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

export const AGENT_SESSION_TASK_OPERATION_KEY =
  'agent-os.execute-session-task' as const;

export const AgentSessionTaskOperationInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    taskId: z.string().uuid(),
    executionId: z.string().uuid(),
  })
  .strict();

export const AGENT_OS_OPERATIONS = [
  {
    key: AGENT_SESSION_TASK_OPERATION_KEY,
    version: 1,
    title: 'AgentOS session task execution',
    ownerDomain: 'agent-os',
    engineType: 'agent_os',
    allowedTriggers: ['agent', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 5,
    inputSchema: AgentSessionTaskOperationInputSchema,
  },
] as const satisfies readonly OperationDefinition[];
