import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { dismissAlert, fetchAlerts } from '../alerts-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('alerts API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the organization-scoped durable alert list', async () => {
    const alerts = [{ id: 'alert-1', title: 'Sellpia 실패' }];
    vi.mocked(apiClient.get).mockResolvedValue(alerts);

    await expect(fetchAlerts()).resolves.toEqual(alerts);
    expect(apiClient.get).toHaveBeenCalledWith('/api/alerts');
  });

  it('dismisses one alert through the focused alert endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ ok: true });

    await expect(dismissAlert('alert/1')).resolves.toEqual({ ok: true });
    expect(apiClient.post).toHaveBeenCalledWith('/api/alerts/alert%2F1/dismiss');
  });
});
