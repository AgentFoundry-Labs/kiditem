import { z } from 'zod';
import { ProviderRuntimeSchema } from './runtime-train';

export { ProviderRuntimeSchema } from './runtime-train';
export type { ProviderRuntime } from './runtime-train';

export const AgentKeySchema = z.enum([
  'sourcing',
  'merchandising',
  'supply',
  'channel_operations',
  'advertising',
]);
export type AgentKey = z.infer<typeof AgentKeySchema>;

export const ConversationIdSchema = z.string().trim().min(1).max(200);
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const TurnIdSchema = z.string().trim().min(1).max(200);
export type TurnId = z.infer<typeof TurnIdSchema>;

export const ModelSchema = z.string().trim().min(1).max(200);
export type Model = z.infer<typeof ModelSchema>;

export const ReasoningEffortSchema = z.string().trim().min(1).max(100);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ConversationTitleSchema = z.string().trim().min(1).max(200);
export type ConversationTitle = z.infer<typeof ConversationTitleSchema>;

export const ConversationPreferenceContextSchema = z.union([
  z.literal('general'),
  AgentKeySchema,
]);
export type ConversationPreferenceContext = z.infer<typeof ConversationPreferenceContextSchema>;

export const ConversationPreferenceSchema = z.object({
  model: ModelSchema,
  reasoningEffort: ReasoningEffortSchema,
}).strict();
export type ConversationPreference = z.infer<typeof ConversationPreferenceSchema>;

const ProviderPreferenceMapSchema = z.object({
  codex_cli: ConversationPreferenceSchema.optional(),
  claude_cli: ConversationPreferenceSchema.optional(),
}).strict();

export const ConversationPreferencesSchema = z.object({
  schemaVersion: z.literal(1),
  contexts: z.object({
    general: ProviderPreferenceMapSchema.optional(),
    sourcing: ProviderPreferenceMapSchema.optional(),
    merchandising: ProviderPreferenceMapSchema.optional(),
    supply: ProviderPreferenceMapSchema.optional(),
    channel_operations: ProviderPreferenceMapSchema.optional(),
    advertising: ProviderPreferenceMapSchema.optional(),
  }).strict(),
}).strict();
export type ConversationPreferences = z.infer<typeof ConversationPreferencesSchema>;

export const SetConversationPreferenceCommandSchema = z.object({
  context: ConversationPreferenceContextSchema,
  runtime: ProviderRuntimeSchema,
  model: ModelSchema,
  reasoningEffort: ReasoningEffortSchema,
}).strict();
export type SetConversationPreferenceCommand = z.infer<typeof SetConversationPreferenceCommandSchema>;

export const ProviderMessageRoleSchema = z.enum(['user', 'assistant', 'tool', 'status']);
export type ProviderMessageRole = z.infer<typeof ProviderMessageRoleSchema>;

/** Bounded, provider-read history exposed only to the conversation UI. */
export const ProviderMessageSchema = z.object({
  id: z.string().trim().min(1).max(200),
  role: ProviderMessageRoleSchema,
  content: z.string().max(16_000),
  createdAt: z.string().datetime(),
}).strict();
export type ProviderMessage = z.infer<typeof ProviderMessageSchema>;

/** A public descriptor deliberately omits the provider-local thread/session reference. */
export const ConversationSummarySchema = z.object({
  id: ConversationIdSchema,
  runtime: ProviderRuntimeSchema,
  agentKey: AgentKeySchema.nullable(),
  title: ConversationTitleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastModel: ModelSchema.optional(),
  lastReasoningEffort: ReasoningEffortSchema.optional(),
}).strict();
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

/** Runtime and Agent binding exist only at creation; neither can be patched later. */
export const CreateConversationCommandSchema = z.object({
  conversationId: ConversationIdSchema,
  runtime: ProviderRuntimeSchema,
  agentKey: AgentKeySchema.nullable(),
  title: ConversationTitleSchema,
}).strict();
export type CreateConversationCommand = z.infer<typeof CreateConversationCommandSchema>;

export const ProviderEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('assistant.delta'),
    delta: z.string().min(1).max(16_000),
  }).strict(),
  z.object({
    kind: z.literal('tool.status'),
    name: z.string().trim().min(1).max(200),
    status: z.enum(['started', 'completed', 'failed']),
    detail: z.string().max(1_000).optional(),
  }).strict(),
  z.object({
    kind: z.literal('status'),
    status: z.enum(['started', 'completed', 'failed', 'interrupted', 'disconnected']),
    detail: z.string().max(1_000).optional(),
  }).strict(),
]);
export type ProviderEvent = z.infer<typeof ProviderEventSchema>;

export const ProviderReadinessSchema = z.object({
  runtime: ProviderRuntimeSchema,
  version: z.string().trim().min(1).max(100),
  models: z.array(ModelSchema).min(1).max(100),
  reasoningEfforts: z.array(ReasoningEffortSchema).min(1).max(20),
  modelReasoningEfforts: z.array(z.object({
    model: ModelSchema,
    reasoningEfforts: z.array(ReasoningEffortSchema).min(1).max(20),
  }).strict()).min(1).max(100),
  loginVerified: z.literal(true),
  mcpProtocolRevision: z.literal('2026-07-28'),
}).strict().superRefine((value, context) => {
  const catalogModels = new Set<string>();
  const catalogEfforts = new Set<string>();
  for (const entry of value.modelReasoningEfforts) {
    if (catalogModels.has(entry.model)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'provider_readiness_model_duplicate' });
    }
    catalogModels.add(entry.model);
    for (const effort of entry.reasoningEfforts) catalogEfforts.add(effort);
  }
  if (new Set(value.models).size !== value.models.length || value.models.some((model) => !catalogModels.has(model)) || catalogModels.size !== value.models.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'provider_readiness_models_invalid' });
  }
  if (new Set(value.reasoningEfforts).size !== value.reasoningEfforts.length || value.reasoningEfforts.some((effort) => !catalogEfforts.has(effort)) || catalogEfforts.size !== value.reasoningEfforts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'provider_readiness_efforts_invalid' });
  }
});
export type ProviderReadiness = z.infer<typeof ProviderReadinessSchema>;
