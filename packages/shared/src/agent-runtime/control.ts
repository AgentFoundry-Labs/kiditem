import { z } from 'zod';
import {
  AgentKeySchema,
  ConversationIdSchema,
  ConversationPreferenceContextSchema,
  ConversationPreferencesSchema,
  ConversationSummarySchema,
  ConversationTitleSchema,
  ModelSchema,
  ProviderEventSchema,
  ProviderMessageSchema,
  ProviderReadinessSchema,
  ProviderRuntimeSchema,
  ReasoningEffortSchema,
  TurnIdSchema,
} from './conversation';
import { GatewayPlatformSchema, GatewayRuntimeTrainSchema } from './runtime-train';

const CommandIdSchema = z.string().trim().min(1).max(200);
const GatewayInstanceIdSchema = z.string().trim().min(1).max(200);
const MessageSchema = z.string().trim().min(1).max(16_000);
const ExecutionBindingSchema = z.string().trim().min(1).max(500);

/** One bounded server poll; the native client deadline always outlives it. */
export const GATEWAY_CONTROL_POLL_WAIT_MS = 25_000;
export const GATEWAY_CONTROL_CLIENT_POLL_TIMEOUT_MS = 30_000;
export const GATEWAY_CONTROL_EVENT_TIMEOUT_MS = 10_000;

export const GatewayProviderReadinessSchema = z.discriminatedUnion('ready', [
  z.object({
    runtime: ProviderRuntimeSchema,
    ready: z.literal(true),
    readiness: ProviderReadinessSchema,
  }).strict(),
  z.object({
    runtime: ProviderRuntimeSchema,
    ready: z.literal(false),
    code: z.string().trim().min(1).max(128),
  }).strict(),
]).superRefine((value, context) => {
  if (value.ready && value.readiness.runtime !== value.runtime) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'gateway_readiness_runtime_mismatch' });
  }
});
export type GatewayProviderReadiness = z.infer<typeof GatewayProviderReadinessSchema>;

export const GatewayReadinessSchema = z.array(GatewayProviderReadinessSchema).length(2).superRefine((entries, context) => {
  const runtimes = new Set(entries.map((entry) => entry.runtime));
  if (runtimes.size !== 2 || !runtimes.has('codex_cli') || !runtimes.has('claude_cli')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'gateway_readiness_runtimes_invalid' });
  }
});

export const GatewayCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('conversation.list'), commandId: CommandIdSchema, runtime: ProviderRuntimeSchema.optional() }).strict(),
  z.object({ kind: z.literal('conversation.create'), commandId: CommandIdSchema, conversationId: ConversationIdSchema, runtime: ProviderRuntimeSchema, agentKey: AgentKeySchema.nullable(), title: ConversationTitleSchema }).strict(),
  z.object({ kind: z.literal('conversation.history'), commandId: CommandIdSchema, conversationId: ConversationIdSchema }).strict(),
  z.object({ kind: z.literal('conversation.rename'), commandId: CommandIdSchema, conversationId: ConversationIdSchema, title: ConversationTitleSchema }).strict(),
  z.object({ kind: z.literal('conversation.delete'), commandId: CommandIdSchema, conversationId: ConversationIdSchema }).strict(),
  z.object({ kind: z.literal('conversation.preferences.get'), commandId: CommandIdSchema }).strict(),
  z.object({ kind: z.literal('conversation.preferences.set'), commandId: CommandIdSchema, context: ConversationPreferenceContextSchema, runtime: ProviderRuntimeSchema, model: ModelSchema, reasoningEffort: ReasoningEffortSchema }).strict(),
  z.object({ kind: z.literal('turn.start'), commandId: CommandIdSchema, conversationId: ConversationIdSchema, turnId: TurnIdSchema, message: MessageSchema, model: ModelSchema, reasoningEffort: ReasoningEffortSchema, executionBinding: ExecutionBindingSchema }).strict(),
  z.object({ kind: z.literal('turn.input'), commandId: CommandIdSchema, conversationId: ConversationIdSchema, turnId: TurnIdSchema, message: MessageSchema }).strict(),
  z.object({ kind: z.literal('turn.interrupt'), commandId: CommandIdSchema, conversationId: ConversationIdSchema, turnId: TurnIdSchema }).strict(),
]);
export type GatewayCommand = z.infer<typeof GatewayCommandSchema>;

export const GatewayCommandBatchSchema = z.object({
  commands: z.array(GatewayCommandSchema).max(64),
}).strict();
export type GatewayCommandBatch = z.infer<typeof GatewayCommandBatchSchema>;

/** Every poll proves the currently installed, packaged runtime train. */
export const GatewayPollSchema = z.object({
  kind: z.literal('poll'),
  gatewayInstanceId: GatewayInstanceIdSchema,
  platform: GatewayPlatformSchema,
  runtimeTrain: GatewayRuntimeTrainSchema,
}).strict();
export type GatewayPoll = z.infer<typeof GatewayPollSchema>;

export const GatewayEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('command.ack'), commandId: CommandIdSchema }).strict(),
  z.object({ kind: z.literal('command.rejected'), commandId: CommandIdSchema, code: z.enum(['capacity', 'invalid_state', 'unsupported', 'provider_error']) }).strict(),
  z.object({ kind: z.literal('conversation.listed'), commandId: CommandIdSchema, conversations: z.array(ConversationSummarySchema).max(1_000) }).strict(),
  z.object({ kind: z.literal('conversation.created'), commandId: CommandIdSchema, conversation: ConversationSummarySchema }).strict(),
  z.object({ kind: z.literal('conversation.history'), commandId: CommandIdSchema, conversationId: ConversationIdSchema, messages: z.array(ProviderMessageSchema).max(1_000) }).strict(),
  z.object({ kind: z.literal('conversation.renamed'), commandId: CommandIdSchema, conversation: ConversationSummarySchema }).strict(),
  z.object({ kind: z.literal('conversation.deleted'), commandId: CommandIdSchema, conversationId: ConversationIdSchema }).strict(),
  z.object({ kind: z.literal('conversation.preferences.loaded'), commandId: CommandIdSchema, preferences: ConversationPreferencesSchema }).strict(),
  z.object({ kind: z.literal('conversation.preferences.updated'), commandId: CommandIdSchema, preferences: ConversationPreferencesSchema }).strict(),
  z.object({ kind: z.literal('turn.event'), conversationId: ConversationIdSchema, turnId: TurnIdSchema, event: ProviderEventSchema }).strict(),
  z.object({ kind: z.literal('turn.terminal'), conversationId: ConversationIdSchema, turnId: TurnIdSchema, status: z.enum(['completed', 'failed', 'interrupted', 'disconnected']), code: z.string().trim().min(1).max(128).optional(), message: z.string().trim().min(1).max(1_000).optional() }).strict(),
  z.object({ kind: z.literal('gateway.readiness'), readiness: GatewayReadinessSchema }).strict(),
]);
export type GatewayEvent = z.infer<typeof GatewayEventSchema>;

export const GatewayEventBatchSchema = z.object({
  gatewayInstanceId: GatewayInstanceIdSchema,
  eventSeq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  events: z.array(GatewayEventSchema).min(1).max(64),
}).strict();
export type GatewayEventBatch = z.infer<typeof GatewayEventBatchSchema>;

export const GatewayEventAcknowledgementSchema = z.object({
  eventSeq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  accepted: z.literal(true),
}).strict();
export type GatewayEventAcknowledgement = z.infer<typeof GatewayEventAcknowledgementSchema>;
