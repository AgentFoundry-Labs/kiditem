import { z } from 'zod';
import {
  AgentKeySchema,
  ModelSchema,
  ProviderRuntimeSchema,
  ReasoningEffortSchema,
} from '@kiditem/shared/agent-runtime';
import { OrganizationIdSchema } from '@kiditem/shared/identifiers';

/**
 * The sole durable Gateway-local conversation state. Provider history, MCP
 * results, invocation data, transport secrets, credentials, and subagents do not fit
 * this strict shape and therefore cannot enter the descriptor JSON.
 */
export const ConversationDescriptorSchema = z.object({
  id: z.string().trim().min(1).max(200),
  /** Server-derived organization authority; never returned to browser DTOs. */
  organizationId: OrganizationIdSchema,
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
export type ConversationDescriptor = z.output<typeof ConversationDescriptorSchema>;
