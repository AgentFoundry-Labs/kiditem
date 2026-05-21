import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSourcingExtensionAuth } from '../sourcing-extension-auth';
import { detectSourcingExtensionId, sendToExtension } from '../extension-bridge';
import { apiClient } from '../api-client';

vi.mock('../extension-bridge', () => ({
  detectSourcingExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('../api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('../api', () => ({
  getApiBase: () => 'http://localhost:4000',
}));

describe('syncSourcingExtensionAuth', () => {
  beforeEach(() => {
    vi.mocked(detectSourcingExtensionId).mockReset();
    vi.mocked(sendToExtension).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it('exchanges the current web session for a sourcing-only extension token', async () => {
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('ext-1');
    vi.mocked(apiClient.post).mockResolvedValue({
      token: 'sourcing-extension-token',
      expiresAt: '2026-05-21T12:30:00.000Z',
      maxExpiresAt: '2026-05-22T12:00:00.000Z',
    });
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    await syncSourcingExtensionAuth({ access_token: 'access-token' });

    expect(apiClient.post).toHaveBeenCalledWith('/api/sourcing/extension/session', {});
    expect(sendToExtension).toHaveBeenCalledWith('ext-1', {
      action: 'setAuthToken',
      apiBase: 'http://localhost:4000/api/sourcing/extension',
      token: 'sourcing-extension-token',
      expiresAt: '2026-05-21T12:30:00.000Z',
      maxExpiresAt: '2026-05-22T12:00:00.000Z',
    });
  });

  it('clears the sourcing extension token when the user is signed out', async () => {
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('ext-1');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    await syncSourcingExtensionAuth(null);

    expect(sendToExtension).toHaveBeenCalledWith('ext-1', {
      action: 'clearAuthToken',
    });
  });
});
