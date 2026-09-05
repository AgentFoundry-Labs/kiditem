import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectTaobaoLive, fetchLiveCommerceStatus } from './live-commerce-api';

const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

describe('Taobao direct owner API', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preserves the caller request key across transport retries', async () => {
    api.post.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ state: 'COMPLETE' });
    const input = { liveIds: ['room-1'] };
    await expect(collectTaobaoLive(input, 'same-request')).rejects.toThrow('response lost');
    await expect(collectTaobaoLive(input, 'same-request')).resolves.toEqual({ state: 'COMPLETE' });
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/sourcing/live-commerce/taobao/attempts', input, { headers: { 'Idempotency-Key': 'same-request' } });
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
  });
  it('reads freshness against the current selected rooms without starting collection', async () => {
    await fetchLiveCommerceStatus({ liveIds: ['room-1'] });
    const url = new URL(api.get.mock.calls[0][0], 'https://kiditem.test');
    expect(url.pathname).toBe('/api/sourcing/live-commerce/status');
    expect(JSON.parse(url.searchParams.get('liveIds')!)).toEqual(['room-1']);
    expect(api.post).not.toHaveBeenCalled();
  });
});
