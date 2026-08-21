import { z } from 'zod';
import { AgentSessionNameSchema } from '@kiditem/shared/identifiers';
import type { OperationDefinition } from '../../../common/operation-definition';

export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session' as const;
export const AGENT_SESSION_DELETE_MAX_ATTEMPTS = 5;

export const AgentSessionDeleteOperationInputSchema = z.object({
  session: AgentSessionNameSchema,
  retryGeneration: z.number().int().positive(),
}).strict();

export const AGENT_SESSION_DELETE_OPERATION: OperationDefinition = {
  key: AGENT_SESSION_DELETE_OPERATION_KEY,
  version: 1,
  title: 'Delete AgentOS session',
  ownerDomain: 'agent-os',
  engineType: 'agent_os',
  allowedTriggers: ['system'],
  scheduleSupported: false,
  maxAttempts: AGENT_SESSION_DELETE_MAX_ATTEMPTS,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  successPersistence: 'ephemeral_on_success',
  inputSchema: AgentSessionDeleteOperationInputSchema,
};
