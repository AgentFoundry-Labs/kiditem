import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  collectSourcingTiktokCcTrendsFromExtension,
  fetchSourcingTiktokCcSourceStatus,
} from './sourcing-tiktok-source-owner';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe('TikTok Creative source-owner web seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('kiditem-os');
  });

  it('asks only the extension to collect, forwards the requested options, and never exposes an owner token', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000000777',
      terminalState: 'COMPLETE',
      attemptToken: 'server-owned-secret',
    });

    await expect(collectSourcingTiktokCcTrendsFromExtension({
      idempotencyKey: 'stable-tiktok-request-key',
      maxItems: 12,
      region: 'KR',
    })).resolves.toEqual({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000000777',
      terminalState: 'COMPLETE',
    });

    expect(sendToExtension).toHaveBeenCalledWith(
      'kiditem-os',
      {
        action: 'collectSourcingTiktokCcTrends',
        idempotencyKey: 'stable-tiktok-request-key',
        maxItems: 12,
        region: 'KR',
      },
      null,
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('reads current TikTok evidence status from the source owner', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ status: 'STALE' } as never);

    await expect(fetchSourcingTiktokCcSourceStatus()).resolves.toEqual({ status: 'STALE' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/sourcing/tiktok-creative/current');
  });
});
