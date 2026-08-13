import { describe, expect, it, vi } from 'vitest';
import type { VersionedConversationSummary } from '../../port/out/runtime/agent-durable-runtime.port';
import { AgentConversationModelViewService } from '../agent-conversation-model-view.service';

describe('AgentConversationModelViewService', () => {
  it('uses canonical semantic events and excludes presentation and navigation', async () => {
    const repository = {
      listCanonicalEvents: vi.fn().mockResolvedValue([
        { sequence: 1n, eventType: 'user_message', schemaVersion: 1, payload: { phase: 'complete', messageId: 'user-1', content: 'hello' } },
        { sequence: 2n, eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'start', messageId: 'assistant-1' } },
        { sequence: 3n, eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'delta', messageId: 'assistant-1', content: 'one ' } },
        { sequence: 4n, eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'delta', messageId: 'assistant-1', content: 'two' } },
        { sequence: 5n, eventType: 'assistant_message', schemaVersion: 1, payload: { phase: 'end', messageId: 'assistant-1' } },
        { sequence: 6n, eventType: 'system_notice', schemaVersion: 1, payload: { code: 'ui.navigation', content: '/private' } },
      ]),
      findConversationSummary: vi.fn().mockResolvedValue(null),
      createConversationSummary: vi.fn(),
    };
    const service = new AgentConversationModelViewService(repository as never);

    const view = await service.build({
      organizationId: 'org-1',
      sessionId: 'session-1',
      executionId: 'execution-1',
      maxTurns: 40,
      maxContextTokens: 10_000,
      summaryTargetTokens: 512,
      summarizerModelIdentity: 'summary-model',
      summaryPromptHash: 'a'.repeat(64),
    });

    expect(view.turns).toEqual([
      { role: 'user', content: 'hello', throughSequence: '1' },
      { role: 'assistant', content: 'one two', throughSequence: '5' },
    ]);
    expect(JSON.stringify(view)).not.toContain('/private');
  });

  it('creates and then reuses an exact versioned summary without deleting raw events', async () => {
    const events = Array.from({ length: 20 }, (_, index) => ({
      sequence: BigInt(index + 1),
      eventType: index % 2 === 0 ? 'user_message' : 'assistant_message',
      schemaVersion: 1,
      payload: {
        phase: 'complete',
        messageId: `message-${index}`,
        content: `long canonical content ${index} `.repeat(20),
      },
    }));
    let stored: VersionedConversationSummary | null = null;
    const repository = {
      listCanonicalEvents: vi.fn().mockResolvedValue(events),
      findConversationSummary: vi.fn(async () => stored),
      createConversationSummary: vi.fn(async ({ summary }) => {
        stored = summary;
        return summary;
      }),
    };
    const summarize = vi.fn().mockResolvedValue('bounded summary');
    const service = new AgentConversationModelViewService(
      repository as never,
      { summarize } as never,
    );
    const input = {
      organizationId: 'org-1',
      sessionId: 'session-1',
      executionId: 'execution-1',
      maxTurns: 40,
      maxContextTokens: 1_024,
      summaryTargetTokens: 256,
      summarizerModelIdentity: 'summary-model',
      summaryPromptHash: 'a'.repeat(64),
    };

    const first = await service.build(input);
    const second = await service.build(input);

    expect(first.summary).toEqual(second.summary);
    expect(repository.createConversationSummary).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(repository.listCanonicalEvents).toHaveBeenCalledTimes(2);
    expect(first.turns.at(-1)?.throughSequence).toBe('20');
  });

  it('rejects an invalid canonical event schema', async () => {
    const repository = {
      listCanonicalEvents: vi.fn().mockResolvedValue([
        { sequence: 1n, eventType: 'user_message', schemaVersion: 1, payload: { content: '' } },
      ]),
      findConversationSummary: vi.fn(),
      createConversationSummary: vi.fn(),
    };
    const service = new AgentConversationModelViewService(repository as never);
    await expect(service.build({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1',
      maxTurns: 40, maxContextTokens: 10_000, summaryTargetTokens: 512,
      summarizerModelIdentity: 'summary-model', summaryPromptHash: 'a'.repeat(64),
    })).rejects.toThrow();
  });

  it('summarizes enough of the prefix to keep later turns inside the context budget', async () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      sequence: BigInt(index + 1),
      eventType: index % 2 === 0 ? 'user_message' : 'assistant_message',
      schemaVersion: 1,
      payload: {
        phase: 'complete',
        messageId: `bounded-${index}`,
        content: `large-${index}-`.repeat(1_000),
      },
    }));
    const repository = {
      listCanonicalEvents: vi.fn().mockResolvedValue(events),
      findConversationSummary: vi.fn().mockResolvedValue(null),
      createConversationSummary: vi.fn(async ({ summary }) => summary),
    };
    const service = new AgentConversationModelViewService(
      repository as never,
      { summarize: vi.fn().mockResolvedValue('bounded') } as never,
    );

    const view = await service.build({
      organizationId: 'org-1', sessionId: 'session-1', executionId: 'execution-1',
      maxTurns: 40, maxContextTokens: 1_024, summaryTargetTokens: 256,
      summarizerModelIdentity: 'summary-model', summaryPromptHash: 'a'.repeat(64),
    });

    expect(view.turns.reduce(
      (tokens, turn) => tokens + Math.ceil(turn.content.length / 4) + 8,
      0,
    )).toBeLessThanOrEqual(768);
  });
});
