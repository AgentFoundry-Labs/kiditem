import { describe, expect, it } from 'vitest';
import { findLatestEligibleSuggestion } from '../suggestion-eligibility';

const suggestion = JSON.stringify({
  kind: 'suggested_replies',
  messageId: 'assistant-source-1',
  replies: [{ id: 'reply-1', label: '후속', content: '후속 질문' }],
  textFallback: '후속 질문이 있습니다.',
});

describe('suggestion chronology', () => {
  it('reconstructs a latest suggestion from public message order after reload', () => {
    expect(findLatestEligibleSuggestion([
      { id: 'assistant-source-1', role: 'assistant', content: '분석했습니다.' },
      { id: 'tool-message-1', role: 'tool', toolCallId: 'tool-1', content: suggestion },
    ])).toEqual({ toolMessageId: 'tool-message-1', sourceMessageId: 'assistant-source-1' });
  });

  it.each(['user', 'assistant'] as const)('hides replayed suggestions after a later visible %s turn', (role) => {
    expect(findLatestEligibleSuggestion([
      { id: 'assistant-source-1', role: 'assistant', content: '분석했습니다.' },
      { id: 'tool-message-1', role: 'tool', toolCallId: 'tool-1', content: suggestion },
      { id: 'later-message', role, content: '이미 다음 대화입니다.' },
    ])).toBeNull();
  });

  it('rejects a suggestion whose server-owned source assistant identity is absent', () => {
    expect(findLatestEligibleSuggestion([
      { id: 'other-assistant', role: 'assistant', content: '다른 응답' },
      { id: 'tool-message-1', role: 'tool', toolCallId: 'tool-1', content: suggestion },
    ])).toBeNull();
  });
});
