import { apiClient } from '@/lib/api-client';
import {
  AgentKeySchema,
  ConversationTitleSchema,
  CreateConversationCommandSchema,
  ConversationPreferencesSchema,
  ConversationSummarySchema,
  GatewayReadinessSchema,
  type AgentKey,
  type ConversationPreferences as SharedConversationPreferences,
  type ConversationSummary as SharedConversationSummary,
  type GatewayProviderReadiness,
  type ProviderRuntime,
  type SetConversationPreferenceCommand as SharedSetConversationPreferenceCommand,
  SetConversationPreferenceCommandSchema,
} from '@kiditem/shared/agent-runtime';

export const agentConversationKeys = AgentKeySchema.options;

export type AgentConversationKey = AgentKey;
export type ConversationRuntime = ProviderRuntime;
export type ConversationSummary = SharedConversationSummary;
export type GatewayReadiness = GatewayProviderReadiness;
export type ConversationPreferences = SharedConversationPreferences;
export type SetConversationPreferenceCommand = SharedSetConversationPreferenceCommand;

export async function listConversations(): Promise<ConversationSummary[]> {
  return ConversationSummarySchema.array().parse(await apiClient.get<unknown>('/api/agent-os/conversations'));
}

export async function createConversation(input: {
  conversationId: string;
  runtime: ConversationRuntime;
  agentKey: AgentConversationKey | null;
  title: string;
}): Promise<ConversationSummary> {
  const command = CreateConversationCommandSchema.parse(input);
  return ConversationSummarySchema.parse(await apiClient.post<unknown>('/api/agent-os/conversations', command));
}

export async function getConversationPreferences(): Promise<ConversationPreferences> {
  return ConversationPreferencesSchema.parse(
    await apiClient.get<unknown>('/api/agent-os/conversation-preferences'),
  );
}

export async function setConversationPreference(
  input: SetConversationPreferenceCommand,
): Promise<ConversationPreferences> {
  const command = SetConversationPreferenceCommandSchema.parse(input);
  return ConversationPreferencesSchema.parse(
    await apiClient.put<unknown>('/api/agent-os/conversation-preferences', command),
  );
}

export async function renameConversation(conversationId: string, title: string): Promise<ConversationSummary> {
  const normalizedTitle = ConversationTitleSchema.parse(title);
  return ConversationSummarySchema.parse(await apiClient.patch<unknown>(`/api/agent-os/conversations/${encodeURIComponent(conversationId)}`, { title: normalizedTitle }));
}

export function deleteConversation(conversationId: string): Promise<void> {
  return apiClient.delete<void>(`/api/agent-os/conversations/${encodeURIComponent(conversationId)}`);
}

/** The approved single-route public runtime-info envelope exposes readiness. */
export async function loadConversationReadiness(): Promise<GatewayReadiness[] | null> {
  const info = await apiClient.post<unknown>('/api/copilotkit', {
    method: 'info',
    params: {},
    body: {},
  });
  return extractGatewayReadiness(info);
}

function extractGatewayReadiness(value: unknown): GatewayReadiness[] | null {
  if (!isRecord(value)
    || !isRecord(value.agents)
    || !isRecord(value.agents.conversation)
    || !isRecord(value.agents.conversation.capabilities)
    || !isRecord(value.agents.conversation.capabilities.custom)
    || !Array.isArray(value.agents.conversation.capabilities.custom.gatewayReadiness)) {
    return null;
  }
  const parsed = GatewayReadinessSchema.safeParse(value.agents.conversation.capabilities.custom.gatewayReadiness);
  return parsed.success ? parsed.data : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
