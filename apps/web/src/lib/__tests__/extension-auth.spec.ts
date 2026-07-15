import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from '../extension-bridge';
import { syncExtensionAuth } from '../extension-auth';

vi.mock('../extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectSourcingExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('../api', () => ({
  getApiBase: () => 'http://localhost:4000',
}));

describe('syncExtensionAuth', () => {
  beforeEach(() => {
    vi.mocked(detectExtensionId).mockReset();
    vi.mocked(detectSourcingExtensionId).mockReset();
    vi.mocked(sendToExtension).mockReset();
    vi.mocked(detectExtensionId).mockResolvedValue(null);
    vi.mocked(detectSourcingExtensionId).mockResolvedValue(null);
  });

  it('stores the current Supabase token in every authenticated extension', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-ext');
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const result = await syncExtensionAuth({ access_token: 'supabase-token' });

    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'setAuthToken',
      token: 'supabase-token',
    });
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'setAuthToken',
      apiBase: 'http://localhost:4000/api/sourcing/extension',
      token: 'supabase-token',
    });
    expect(result).toEqual({
      coupang: { status: 'synced' },
      sourcing: { status: 'synced' },
    });
  });

  it('clears every installed extension token on sign-out', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-ext');
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const result = await syncExtensionAuth(null);

    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'clearAuthToken',
    });
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'clearAuthToken',
    });
    expect(result).toEqual({
      coupang: { status: 'cleared' },
      sourcing: { status: 'cleared' },
    });
  });

  it('does not fail login when optional extensions are not installed', async () => {
    await expect(
      syncExtensionAuth({ access_token: 'supabase-token' }),
    ).resolves.toEqual({
      coupang: { status: 'not_installed' },
      sourcing: { status: 'not_installed' },
    });
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('isolates one extension failure from the other extension', async () => {
    vi.mocked(detectExtensionId).mockRejectedValue(new Error('coupang unavailable'));
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const result = await syncExtensionAuth({ access_token: 'supabase-token' });

    expect(sendToExtension).toHaveBeenCalledTimes(1);
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'setAuthToken',
      apiBase: 'http://localhost:4000/api/sourcing/extension',
      token: 'supabase-token',
    });
    expect(result).toEqual({
      coupang: { status: 'failed' },
      sourcing: { status: 'synced' },
    });
  });
});
