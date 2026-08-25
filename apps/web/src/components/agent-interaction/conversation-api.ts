import { apiClient } from '@/lib/api-client';
import {
  AgentKeySchema,
  ConversationSummarySchema,
  GatewayReadinessSchema,
  ProviderMessageSchema,
  type AgentKey,
  type ConversationSummary as SharedConversationSummary,
  type GatewayProviderReadiness,
  type ProviderMessage,
  type ProviderRuntime,
} from '@kiditem/shared/agent-runtime';

export const agentConversationKeys = AgentKeySchema.options;

export type AgentConversationKey = AgentKey;
export type ConversationRuntime = ProviderRuntime;
export type ConversationSummary = SharedConversationSummary;
export type ConversationMessage = ProviderMessage;
export type GatewayReadiness = GatewayProviderReadiness;

export async function listConversations(): Promise<ConversationSummary[]> {
  return ConversationSummarySchema.array().parse(await apiClient.get<unknown>('/api/agent-os/conversations'));
}

export async function createConversation(input: {
  runtime: ConversationRuntime;
  agentKey: AgentConversationKey | null;
  title?: string;
}): Promise<ConversationSummary> {
  return ConversationSummarySchema.parse(await apiClient.post<unknown>('/api/agent-os/conversations', input));
}

export async function getConversationHistory(conversationId: string): Promise<ConversationMessage[]> {
  return ProviderMessageSchema.array().parse(await apiClient.get<unknown>(`/api/agent-os/conversations/${encodeURIComponent(conversationId)}/history`));
}

export async function renameConversation(conversationId: string, title: string): Promise<ConversationSummary> {
  return ConversationSummarySchema.parse(await apiClient.patch<unknown>(`/api/agent-os/conversations/${encodeURIComponent(conversationId)}`, { title }));
}

export function deleteConversation(conversationId: string): Promise<void> {
  return apiClient.delete<void>(`/api/agent-os/conversations/${encodeURIComponent(conversationId)}`);
}

export function startConversationTurn(
  conversationId: string,
  input: { message: string; model: string; reasoningEffort: string },
): Promise<{ turnId: string }> {
  return apiClient.post<{ turnId: string }>(
    `/api/agent-os/conversations/${encodeURIComponent(conversationId)}/turns`,
    input,
  );
}

export function sendConversationInput(
  conversationId: string,
  turnId: string,
  message: string,
): Promise<void> {
  return apiClient.post<void>(
    `/api/agent-os/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/input`,
    { message },
  );
}

export function interruptConversation(conversationId: string, turnId: string): Promise<void> {
  return apiClient.post<void>(
    `/api/agent-os/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/interrupt`,
  );
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
