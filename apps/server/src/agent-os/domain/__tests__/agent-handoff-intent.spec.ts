import { describe, expect, it } from 'vitest';
import { AgentHandoffIntentSchema } from '@kiditem/shared/agent-os';
import {
  ORDER_DRAFT_FROM_SOURCING_RECOMMENDATION_HANDOFF,
  withOrderDraftHandoff,
} from '../agent-handoff-intent';

describe('agent handoff intent', () => {
  it('defines the sourcing recommendation to order draft handoff contract', () => {
    expect(
      AgentHandoffIntentSchema.parse(
        ORDER_DRAFT_FROM_SOURCING_RECOMMENDATION_HANDOFF,
      ),
    ).toEqual({
      targetAgentType: 'order',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      planStepKey: 'order_draft',
      trigger: 'user_selection',
      requiresUserSelection: true,
      actionLabel: '발주 초안 생성',
      rationale: '사용자가 소싱 추천을 선택하면 Order Agent가 발주 초안을 만든다.',
    });
  });

  it('adds the handoff intent without removing existing summary fields', () => {
    expect(
      withOrderDraftHandoff({
        productName: '실리콘 식판 흡착형 신제품',
        score: 84,
      }),
    ).toEqual({
      productName: '실리콘 식판 흡착형 신제품',
      score: 84,
      handoffIntent: ORDER_DRAFT_FROM_SOURCING_RECOMMENDATION_HANDOFF,
    });
  });
});
