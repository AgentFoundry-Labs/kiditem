import { z } from 'zod';
import {
  AgentExecutionNameSchema,
  AgentSessionNameSchema,
  AgentSessionTaskNameSchema,
  parseAgentExecutionName,
  parseAgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import type { OperationDefinition } from '../../../common/operation-definition';

export const AGENT_SESSION_TASK_OPERATION_KEY =
  'agent-os.execute-session-task' as const;

export const AgentSessionTaskOperationInputSchema = z
  .object({
    session: AgentSessionNameSchema,
    task: AgentSessionTaskNameSchema,
    execution: AgentExecutionNameSchema,
  })
  .strict()
  .superRefine((input, context) => {
    for (const [field, parse] of [
      ['task', () => parseAgentSessionTaskName(input.task, input.session)],
      ['execution', () => parseAgentExecutionName(input.execution, input.session)],
    ] as const) {
      try {
        parse();
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must belong to the operation session`,
        });
      }
    }
  });

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
