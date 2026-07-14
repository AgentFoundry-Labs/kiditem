import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api-error';

const mockPatch = vi.hoisted(() => vi.fn());

vi.mock('../api-client', () => ({
  apiClient: { patch: mockPatch },
}));

import { updateOperationAlert } from '../operation-alerts';

describe('updateOperationAlert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null only for a verified HTTP 404', async () => {
    mockPatch.mockRejectedValueOnce(
      new ApiError(404, 'Not Found', 'operation alert not found'),
    );

    await expect(
      updateOperationAlert('browser-collection:missing', {
        status: 'succeeded',
      }),
    ).resolves.toBeNull();
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
