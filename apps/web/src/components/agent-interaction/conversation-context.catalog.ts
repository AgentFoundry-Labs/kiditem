import type { AgentConversationKey } from './conversation-api';

export const conversationContexts = [
  {
    key: null,
    label: '일반 AI 챗',
    placeholder: '무엇을 도와드릴까요?',
    description: '업무 맥락을 정리하고 다음 행동을 함께 정해 보세요.',
    suggestions: ['이번 주 우선순위를 정리해 주세요', '상품 후보를 비교해 주세요', '운영 이슈를 확인해 주세요'],
    mark: { toneClassName: 'bg-slate-100 text-slate-600', icon: 'sparkles' },
  },
  {
    key: 'sourcing',
    label: '소싱 Agent',
    placeholder: '소싱 Agent에게 무엇을 요청할까요?',
    description: '공급처와 상품 후보를 빠르게 검토할 수 있어요.',
    suggestions: ['상품 후보를 비교해 주세요', '공급처 정보를 정리해 주세요', '소싱 위험을 확인해 주세요'],
    mark: { toneClassName: 'bg-primary-soft text-primary', icon: 'search' },
  },
  {
    key: 'merchandising',
    label: '상품 Agent',
    placeholder: '상품 Agent에게 무엇을 요청할까요?',
    description: '상품 정보와 판매 제안을 검토할 수 있어요.',
    suggestions: ['상품 설명을 검토해 주세요', '판매 포인트를 정리해 주세요', '등록 전 확인 항목을 알려 주세요'],
    mark: { toneClassName: 'bg-emerald-100 text-emerald-700', icon: 'package-search' },
  },
  {
    key: 'supply',
    label: '공급 Agent',
    placeholder: '공급 Agent에게 무엇을 요청할까요?',
    description: '재고와 공급 흐름을 함께 점검할 수 있어요.',
    suggestions: ['재고 위험을 확인해 주세요', '입고 우선순위를 정리해 주세요', '공급 이슈를 요약해 주세요'],
    mark: { toneClassName: 'bg-amber-100 text-amber-700', icon: 'warehouse' },
  },
  {
    key: 'channel_operations',
    label: '채널 운영 Agent',
    placeholder: '채널 운영 Agent에게 무엇을 요청할까요?',
    description: '판매 채널의 운영 상태를 점검할 수 있어요.',
    suggestions: ['채널 이슈를 확인해 주세요', '운영 우선순위를 정리해 주세요', '등록 상태를 검토해 주세요'],
    mark: { toneClassName: 'bg-cyan-100 text-cyan-700', icon: 'store' },
  },
  {
    key: 'advertising',
    label: '광고 Agent',
    placeholder: '광고 Agent에게 무엇을 요청할까요?',
    description: '광고 성과와 다음 실험을 함께 검토할 수 있어요.',
    suggestions: ['광고 성과를 요약해 주세요', '다음 실험을 제안해 주세요', '예산 위험을 확인해 주세요'],
    mark: { toneClassName: 'bg-rose-100 text-rose-700', icon: 'megaphone' },
  },
] as const satisfies ReadonlyArray<{
  key: AgentConversationKey | null;
  label: string;
  placeholder: string;
  description: string;
  suggestions: readonly string[];
  mark: {
    toneClassName: string;
    icon: 'sparkles' | 'search' | 'package-search' | 'warehouse' | 'store' | 'megaphone';
  };
}>;

export function conversationContextFor(agentKey: AgentConversationKey | null) {
  return conversationContexts.find((context) => context.key === agentKey) ?? conversationContexts[0];
}

export function conversationContextForLabel(label: string) {
  return conversationContexts.find((context) => context.label === label) ?? conversationContexts[0];
}
