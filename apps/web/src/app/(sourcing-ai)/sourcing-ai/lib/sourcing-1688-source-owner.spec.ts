import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  collectSourcing1688TrendsFromExtension,
  fetchSourcing1688TrendSourceStatus,
} from './sourcing-1688-source-owner';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

describe('1688 source-owner web seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectExtensionId).mockResolvedValue('kiditem-os');
  });

  it('starts only the exact extension action and leaves begin ownership to the extension', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000001688',
      terminalState: 'COMPLETE',
    });

    await expect(collectSourcing1688TrendsFromExtension({
      idempotencyKey: 'stable-1688-request-key',
    })).resolves.toMatchObject({ terminalState: 'COMPLETE' });

    expect(sendToExtension).toHaveBeenCalledWith(
      'kiditem-os',
      { action: 'collectSourcing1688Trends', idempotencyKey: 'stable-1688-request-key' },
      null,
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('reads the source owner status from its current evidence endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ ready: true } as never);

    await expect(fetchSourcing1688TrendSourceStatus()).resolves.toEqual({ ready: true });
    expect(apiClient.get).toHaveBeenCalledWith('/api/sourcing/1688-trends/current');
  });
});
