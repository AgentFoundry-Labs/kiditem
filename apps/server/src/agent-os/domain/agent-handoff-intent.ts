import type { AgentHandoffIntent } from '@kiditem/shared/agent-os';

export const ORDER_DRAFT_FROM_SOURCING_RECOMMENDATION_HANDOFF = {
  targetAgentType: 'order',
  playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
  planStepKey: 'order_draft',
  trigger: 'user_selection',
  requiresUserSelection: true,
  actionLabel: '발주 초안 생성',
  rationale: '사용자가 소싱 추천을 선택하면 Order Agent가 발주 초안을 만든다.',
} satisfies AgentHandoffIntent;

export function withOrderDraftHandoff(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...summary,
    handoffIntent: ORDER_DRAFT_FROM_SOURCING_RECOMMENDATION_HANDOFF,
  };
}
