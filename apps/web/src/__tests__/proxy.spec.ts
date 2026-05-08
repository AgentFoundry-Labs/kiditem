import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../proxy';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORIGINAL_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function makeRequest(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

function setSupabaseEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
}

function clearSupabaseEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function mockSupabaseClaims(claims: unknown) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims }, error: null }),
    },
  } as unknown as ReturnType<typeof createServerClient>);
}

function expectRedirectPath(response: Response, pathname: string, next: string) {
  expect(response.status).toBe(307);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const url = new URL(location ?? '');
  expect(url.pathname).toBe(pathname);
  expect(url.searchParams.get('next')).toBe(next);
}

describe('proxy auth redirect', () => {
  beforeEach(() => {
    vi.mocked(createServerClient).mockReset();
    clearSupabaseEnv();
  });

  afterAll(() => {
    if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;

    if (ORIGINAL_SUPABASE_PUBLISHABLE_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIGINAL_SUPABASE_PUBLISHABLE_KEY;
    }

    if (ORIGINAL_SUPABASE_ANON_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_SUPABASE_ANON_KEY;
  });

  it('redirects protected routes to login when Supabase publishable env is missing', async () => {
    const response = await proxy(makeRequest('/dashboard'));

    expectRedirectPath(response, '/login', '/dashboard');
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('does not accept the legacy anon env as a replacement for the publishable key', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'legacy-anon-key';

    const response = await proxy(makeRequest('/dashboard'));

    expectRedirectPath(response, '/login', '/dashboard');
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('allows public auth routes when Supabase publishable env is missing', async () => {
    const response = await proxy(makeRequest('/login'));

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('uses the publishable key and redirects protected routes when Supabase has no claims', async () => {
    setSupabaseEnv();
    mockSupabaseClaims(null);

    const response = await proxy(makeRequest('/dashboard'));

    expect(createServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'sb_publishable_test',
      expect.any(Object),
    );
    expectRedirectPath(response, '/login', '/dashboard');
  });

  it('redirects an authenticated login page request to the launcher', async () => {
    setSupabaseEnv();
    mockSupabaseClaims({ sub: 'user-1' });

    const response = await proxy(makeRequest('/login'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/');
  });

  // The CopilotKit browser runtime hits /api/chat/copilot[...] which Next
  // rewrites to Nest. The caller is `fetch`/SSE, not a navigation, so a 307
  // to /login would corrupt the stream. Nest itself returns JSON 401
  // auth_required when the Supabase SSR cookie is missing.
  describe('chat runtime transport bypass', () => {
    it('passes /api/chat/copilot through without checking Supabase claims', async () => {
      const response = await proxy(makeRequest('/api/chat/copilot'));

      expect(response.status).toBe(200);
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it('passes /api/chat/copilot/info through even when Supabase env is missing', async () => {
      const response = await proxy(makeRequest('/api/chat/copilot/info'));

      expect(response.status).toBe(200);
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it('passes /api/chat/copilot/info through when Supabase claims are absent', async () => {
      setSupabaseEnv();
      mockSupabaseClaims(null);

      const response = await proxy(makeRequest('/api/chat/copilot/info'));

      expect(response.status).toBe(200);
      // Bypass runs before Supabase resolution → claims check skipped entirely.
      expect(createServerClient).not.toHaveBeenCalled();
    });
  });
});
