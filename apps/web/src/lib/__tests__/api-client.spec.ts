import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiClient } from '../api-client';
import { normalizeLoopbackApiBase } from '../api';

const DataSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().int(),
});

describe('apiClient.getParsed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed data on valid response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        amount: 42,
      }),
    });
    const result = await apiClient.getParsed('/api/test', DataSchema);
    expect(result).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      amount: 42,
    });
    expect(fetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
  });

  it('throws ZodError on invalid response shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'not-uuid', amount: 'not-number' }),
    });
    await expect(apiClient.getParsed('/api/test', DataSchema))
      .rejects.toThrowError(/ZodError|invalid/i);
  });

  it('parses array schema', async () => {
    const ArraySchema = z.array(DataSchema);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify([
        { id: '11111111-1111-1111-1111-111111111111', amount: 1 },
      ]),
    });
    const result = await apiClient.getParsed('/api/test', ArraySchema);
    expect(result).toHaveLength(1);
  });

  it('falls back to Supabase SSR cookie when attaching Authorization', async () => {
    const session = JSON.stringify({ access_token: 'cookie-token' });
    const encoded = `base64-${Buffer.from(session, 'utf8').toString('base64url')}`;
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      cookie: `sb-test-ref-auth-token=${encodeURIComponent(encoded)}`,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });

    await apiClient.post('/api/test');

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer cookie-token');
  });

  it('normalizes loopback API host to the browser host', () => {
    expect(normalizeLoopbackApiBase('http://localhost:4000', '127.0.0.1'))
      .toBe('http://127.0.0.1:4000');
    expect(normalizeLoopbackApiBase('http://127.0.0.1:4000', 'localhost'))
      .toBe('http://localhost:4000');
    expect(normalizeLoopbackApiBase('https://api.kiditem.local', 'localhost'))
      .toBe('https://api.kiditem.local');
  });
});
