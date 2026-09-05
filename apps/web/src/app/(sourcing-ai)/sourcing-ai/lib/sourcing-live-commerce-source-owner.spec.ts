import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  collectSourcingLiveCommerceFromExtension,
  fetchSourcingLiveCommerceSourceStatus,
} from './sourcing-live-commerce-source-owner';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe('Live Commerce source-owner web seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('kiditem-os');
  });

  it('calls only the extension with the stable caller key and never exposes an owner token', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000000777',
      terminalState: 'COMPLETE',
      attemptToken: 'server-owned-secret',
    });

    await expect(collectSourcingLiveCommerceFromExtension({
      idempotencyKey: 'live-source-request-key',
      url: 'https://live.douyin.com/123?token=keep#private',
    })).resolves.toEqual({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000000777',
      terminalState: 'COMPLETE',
    });

    expect(sendToExtension).toHaveBeenCalledWith(
      'kiditem-os',
      {
        action: 'collectSourcingLiveCommerce',
        idempotencyKey: 'live-source-request-key',
        url: 'https://live.douyin.com/123?token=keep#private',
      },
      null,
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('reads the current source status by the requested browser URL', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ status: 'STALE' } as never);

    await expect(fetchSourcingLiveCommerceSourceStatus('https://live.douyin.com/123?token=keep#private'))
      .resolves.toEqual({ status: 'STALE' });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/sourcing/live-commerce/browser/current?url=https%3A%2F%2Flive.douyin.com%2F123%3Ftoken%3Dkeep%23private',
    );
  });
});
