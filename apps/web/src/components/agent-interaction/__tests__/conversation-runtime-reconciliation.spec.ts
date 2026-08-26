import { describe, expect, it } from 'vitest';
import {
  historyCoversLiveMessages,
  messageCoverageCounts,
  toLiveMessages,
  toolProjectionFromEvent,
} from '../conversation-runtime-reconciliation';

describe('conversation runtime reconciliation', () => {
  it('projects only supported live message content and provider tool events', () => {
    expect(toLiveMessages([
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Provider reply' }] },
      { id: 'ignored', role: 'system', content: 'Ignore' },
      { id: 'tool-1', role: 'tool', content: 'Tool result' },
    ])).toEqual([
      { id: 'assistant-1', role: 'assistant', content: 'Provider reply' },
      { id: 'tool-1', role: 'tool', content: 'Tool result' },
    ]);
    expect(toolProjectionFromEvent('kiditem.provider_tool_status', {
      name: 'source_search', status: 'running', detail: 'Searching',
    })).toEqual({
      id: 'tool-source_search-running', title: 'source_search', detail: 'running · Searching',
    });
    expect(toolProjectionFromEvent('other.event', {})).toBeNull();
  });

  it('only clears live state after terminal history covers the post-baseline messages', () => {
    const baseline = messageCoverageCounts([
      { role: 'assistant', content: 'Repeated response' },
    ]);
    const live = [{ id: 'live-1', role: 'assistant' as const, content: 'Repeated response' }];

    expect(historyCoversLiveMessages([
      { id: 'old', role: 'assistant', content: 'Repeated response', createdAt: '2026-08-26T00:00:00.000Z' },
    ], live, baseline)).toBe(false);
    expect(historyCoversLiveMessages([
      { id: 'old', role: 'assistant', content: 'Repeated response', createdAt: '2026-08-26T00:00:00.000Z' },
      { id: 'new', role: 'assistant', content: 'Repeated response', createdAt: '2026-08-26T00:01:00.000Z' },
    ], live, baseline)).toBe(true);
  });
});
