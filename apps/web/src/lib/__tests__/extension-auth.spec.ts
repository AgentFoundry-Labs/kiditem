import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from '../extension-bridge';
import {
  clearExtensionAuth,
  syncExtensionAuth,
  transferExtensionAuthTo,
} from '../extension-auth';

const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock('../extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectSourcingExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('../api-client', () => ({
  apiClient: { post: (...args: unknown[]) => apiPostMock(...args) },
}));

describe('syncExtensionAuth', () => {
  beforeEach(() => {
    vi.mocked(detectExtensionId).mockReset();
    vi.mocked(detectSourcingExtensionId).mockReset();
    vi.mocked(sendToExtension).mockReset();
    apiPostMock.mockReset();
    apiPostMock.mockResolvedValue({ token: 'a'.repeat(43) });
    vi.mocked(detectExtensionId).mockResolvedValue(null);
    vi.mocked(detectSourcingExtensionId).mockResolvedValue(null);
  });

  it('stores the current KidItem session token in every authenticated extension', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-ext');
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const token = 'a'.repeat(43);
    const result = await syncExtensionAuth();

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/extension-handoff');
    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'setAuthToken',
      token,
    });
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'setAuthToken',
      token,
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

    const result = await clearExtensionAuth();

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
      syncExtensionAuth(),
    ).resolves.toEqual({
      coupang: { status: 'not_installed' },
      sourcing: { status: 'not_installed' },
    });
    expect(sendToExtension).not.toHaveBeenCalled();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('isolates one extension failure from the other extension', async () => {
    vi.mocked(detectExtensionId).mockRejectedValue(new Error('coupang unavailable'));
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const token = 'a'.repeat(43);
    const result = await syncExtensionAuth();

    expect(sendToExtension).toHaveBeenCalledTimes(1);
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'setAuthToken',
      token,
    });
    expect(result).toEqual({
      coupang: { status: 'failed' },
      sourcing: { status: 'synced' },
    });
  });

  it('hands auth to one already selected extension immediately before work', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    await expect(transferExtensionAuthTo('coupang-ext')).resolves.toBeUndefined();

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/extension-handoff');
    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'setAuthToken',
      token: 'a'.repeat(43),
    });
  });
});
