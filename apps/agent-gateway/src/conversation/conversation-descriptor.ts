import { z } from 'zod';
import {
  AgentKeySchema,
  ModelSchema,
  ProviderRuntimeSchema,
  ReasoningEffortSchema,
} from '@kiditem/shared/agent-runtime';

/**
 * The sole durable Gateway-local conversation state. Provider history, MCP
 * results, invocation data, transport secrets, credentials, and subagents do not fit
 * this strict shape and therefore cannot enter the descriptor JSON.
 */
export const ConversationDescriptorSchema = z.object({
  id: z.string().trim().min(1).max(200),
  runtime: ProviderRuntimeSchema,
  providerConversationRef: z.string().trim().min(1).max(500),
  agentKey: AgentKeySchema.nullable(),
  /** Immutable canonical input used only for durable create idempotency. */
  createTitle: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastModel: ModelSchema.optional(),
  lastReasoningEffort: ReasoningEffortSchema.optional(),
}).strict();
export type ConversationDescriptor = z.infer<typeof ConversationDescriptorSchema>;
