import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { candidatesApi } from './sourcing-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('sourcing candidate API', () => {
  beforeEach(() => {
    vi.mocked(apiClient.delete).mockReset();
  });

  it('deletes sourcing inbox cards through the sourcing candidate route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ ok: true });

    await expect(candidatesApi.delete('cand-1')).resolves.toEqual({ ok: true });

    expect(apiClient.delete).toHaveBeenCalledWith('/api/sourcing/candidates/cand-1');
  });
});
