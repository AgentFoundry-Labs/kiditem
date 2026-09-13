import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { collectWingCatalog } from './sourcing-wing-source-owner';
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));

describe('explicit Wing source and requested recommendation effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('extension');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true, attemptId: 'attempt', state: 'COMPLETE' });
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'ready', data: { runId: 'recommendations' } });
  });
  it.each(['catalog_search', 'tracked_metrics', 'market_analysis', 'recommendation_validation'] as const)(
    'preserves %s caller intent and performs its explicit owner effects only after source COMPLETE', async (purpose) => {
      await collectWingCatalog({ idempotencyKey: 'key', keywords: ['연필'], maxPages: 2, purpose });
      expect(sendToExtension).toHaveBeenCalledWith('extension', { action: 'collectSourcingWingCatalog',
        idempotencyKey: 'key', keywords: ['연필'], maxPages: 2, purpose }, null);
      const effects = purpose === 'recommendation_validation' ? 2 : purpose === 'market_analysis' ? 1 : 0;
      expect(apiClient.post).toHaveBeenCalledTimes(effects);
      if (effects) expect(apiClient.post).toHaveBeenNthCalledWith(1,
        '/api/sourcing/workspace/recommendations/refresh', { sourceAttemptId: 'attempt' });
      if (effects === 2) expect(apiClient.post).toHaveBeenNthCalledWith(2,
        '/api/sourcing/workspace/validation/refresh', { recommendationRunId: 'recommendations' });
    });
  it('surfaces source failure and never publishes derived effects from a partial attempt', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({ success: false, state: 'FAILED', attemptId: 'attempt', errorMessage: 'keyword failed' });
    await expect(collectWingCatalog({ idempotencyKey: 'key', keywords: ['연필'], maxPages: 1, purpose: 'market_analysis' }))
      .rejects.toThrow('keyword failed');
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
