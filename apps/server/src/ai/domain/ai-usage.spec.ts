import { describe, expect, it, vi } from 'vitest';
import { agentForApiPath, estimateCostMicroUsd, geminiTokens, isPricedModel } from './ai-usage';
import { aiUsageMeter, type AiUsageEntry } from '../application/usage/ai-usage-meter';

describe('AI usage attribution and pricing', () => {
  it.each([
    ['/api/sourcing/keyword-analysis', 'sourcing'],
    ['/api/ai/detail-page/123', 'product'],
    ['/api/thumbnail-analysis?x=1', 'product'],
    ['/api/ads/ai-strategy', 'marketing'],
    ['/api/reviews/summary', 'cs'],
    ['/api/unknown-thing', null],
    ['/health', null],
  ])('attributes %s to %s', (path, agent) => {
    expect(agentForApiPath(path)).toBe(agent);
  });

  it('bills thinking tokens as output and ignores an empty usage block', () => {
    expect(geminiTokens({ promptTokenCount: 1_000, candidatesTokenCount: 200, thoughtsTokenCount: 300 }))
      .toEqual({ inputTokens: 1_000, outputTokens: 500 });
    expect(geminiTokens({})).toBeNull();
    expect(geminiTokens(undefined)).toBeNull();
  });

  it('prices a known model and leaves an unknown one unpriced rather than guessed', () => {
    // gemini-2.5-flash: $0.30 in / $2.50 out per million tokens.
    expect(estimateCostMicroUsd('models/gemini-2.5-flash', { inputTokens: 1_000_000, outputTokens: 1_000_000 }))
      .toBe(2_800_000n);
    expect(estimateCostMicroUsd('gemini-3.1-flash-image-preview', { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(isPricedModel('gemini-3.1-flash-image-preview')).toBe(false);
  });
});

describe('aiUsageMeter', () => {
  it('records a call only inside a usage context, attributed to it', async () => {
    const written: AiUsageEntry[] = [];
    aiUsageMeter.bind(async (entry) => { written.push(entry); });
    try {
      aiUsageMeter.recordGemini({ model: 'gemini-2.5-flash', operation: 'text_completion', usage: { promptTokenCount: 5 } });
      await aiUsageMeter.run({ organizationId: 'org-1', agentKey: 'product' }, async () => {
        await Promise.resolve();
        aiUsageMeter.recordGemini({ model: 'gemini-2.5-flash', operation: 'thumbnail_vision', usage: { promptTokenCount: 5, candidatesTokenCount: 2 } });
      });
      expect(written).toEqual([expect.objectContaining({
        organizationId: 'org-1',
        agentKey: 'product',
        operation: 'thumbnail_vision',
        inputTokens: 5,
        outputTokens: 2,
      })]);
    } finally {
      aiUsageMeter.bind(null);
    }
  });

  it('never throws into the model call when recording fails', async () => {
    aiUsageMeter.bind(vi.fn().mockRejectedValue(new Error('db down')));
    try {
      expect(() => aiUsageMeter.run({ organizationId: 'org-1', agentKey: null }, () =>
        aiUsageMeter.recordGemini({ model: 'x', operation: 'y', usage: { promptTokenCount: 1 } }))).not.toThrow();
      await Promise.resolve();
    } finally {
      aiUsageMeter.bind(null);
    }
  });
});
