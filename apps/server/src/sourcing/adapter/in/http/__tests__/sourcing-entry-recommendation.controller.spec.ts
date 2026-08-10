import { describe, expect, it, vi } from 'vitest';
import { SourcingEntryRecommendationController } from '../sourcing-entry-recommendation.controller';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';

describe('SourcingEntryRecommendationController', () => {
  it('passes authenticated user and mounted conversation state to the assistant', async () => {
    const assistant = { ask: vi.fn().mockResolvedValue({ text: '답변' }) };
    const controller = new SourcingEntryRecommendationController(
      { getRecommendations: vi.fn() } as never,
      assistant as never,
    );

    await controller.ask(
      {
        question: '상품 근거를 알려줘',
        visibleContext: '현재 표',
        conversationId: CONVERSATION_ID,
      },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    );

    expect(assistant.ask).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      question: '상품 근거를 알려줘',
      visibleContext: '현재 표',
      conversationId: CONVERSATION_ID,
    });
  });
});
