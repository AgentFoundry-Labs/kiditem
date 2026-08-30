import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api-error';
import {
  dismissExtensionMissingBrowserCollectionAlerts,
  updateOperationAlert,
} from '../operation-alerts';

const mockPatch = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock('../api-client', () => ({
  apiClient: { patch: mockPatch, post: mockPost },
}));

describe('updateOperationAlert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null only for a verified HTTP 404', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockPatch.mockRejectedValueOnce(
      new ApiError(404, 'Not Found', 'operation alert not found'),
    );

    await expect(
      updateOperationAlert('browser-collection:missing', {
        status: 'succeeded',
      }),
    ).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([409, 500])('rethrows HTTP %s instead of triggering missing-alert recovery', async (status) => {
    const error = new ApiError(status, 'request_failed', 'write failed');
    mockPatch.mockRejectedValueOnce(error);

    await expect(
      updateOperationAlert('browser-collection:existing', {
        status: 'succeeded',
      }),
    ).rejects.toBe(error);
  });

  it('rethrows non-HTTP failures', async () => {
    const error = new Error('network unavailable');
    mockPatch.mockRejectedValueOnce(error);

    await expect(
      updateOperationAlert('browser-collection:existing', {
        status: 'failed',
      }),
    ).rejects.toBe(error);
  });
});

describe('dismissExtensionMissingBrowserCollectionAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps startup network gaps best-effort without requesting an error overlay log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockPost.mockRejectedValueOnce(new ApiError(0, 'network_error', 'API unavailable'));

    await expect(
      dismissExtensionMissingBrowserCollectionAlerts(),
    ).resolves.toEqual({ dismissed: 0 });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/operation-alerts/reconcile-extension-missing',
      undefined,
      { suppressNetworkErrorLog: true },
    );
    warn.mockRestore();
  });
});
