import { describe, expect, it, vi } from 'vitest';
import { recoverStalePanelOperations } from '../panel-recovery';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
  },
}));

describe('recoverStalePanelOperations', () => {
  it('reconciles stale browser-owned thumbnail batch alerts before backfilling the panel', async () => {
    await recoverStalePanelOperations(42);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/operation-alerts/reconcile-browser-stale',
      expect.objectContaining({
        staleMinutes: 30,
        limit: 100,
      }),
    );
    expect(apiClient.get).toHaveBeenCalledWith('/api/panel/backfill?afterSeq=42');
  });
});
