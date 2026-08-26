import type { AgentConversationKey } from './conversation-api';

export const conversationContexts = [
  { key: null, label: '일반 AI 챗', placeholder: '무엇을 도와드릴까요?' },
  { key: 'sourcing', label: '소싱 Agent', placeholder: '소싱 Agent에게 무엇을 요청할까요?' },
  { key: 'merchandising', label: '상품 Agent', placeholder: '상품 Agent에게 무엇을 요청할까요?' },
  { key: 'supply', label: '공급 Agent', placeholder: '공급 Agent에게 무엇을 요청할까요?' },
  { key: 'channel_operations', label: '채널 운영 Agent', placeholder: '채널 운영 Agent에게 무엇을 요청할까요?' },
  { key: 'advertising', label: '광고 Agent', placeholder: '광고 Agent에게 무엇을 요청할까요?' },
] as const satisfies ReadonlyArray<{
  key: AgentConversationKey | null;
  label: string;
  placeholder: string;
}>;

export function conversationContextFor(agentKey: AgentConversationKey | null) {
  return conversationContexts.find((context) => context.key === agentKey) ?? conversationContexts[0];
}
