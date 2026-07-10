import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from '../proxy';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORIGINAL_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function makeRequest(path: string, init?: { accept?: string }) {
  const headers: Record<string, string> = {};
  if (init?.accept) headers.accept = init.accept;
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
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

function matchesProxyMatcher(path: string): boolean {
  const [matcher] = config.matcher;
  const source = matcher.startsWith('/') ? matcher.slice(1) : matcher;
  return new RegExp(`^/${source}$`).test(path);
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

  it('excludes all Next internal routes from the auth proxy matcher', () => {
    expect(matchesProxyMatcher('/_next/static/chunks/main-app.js')).toBe(false);
    expect(matchesProxyMatcher('/_next/image')).toBe(false);
    expect(matchesProxyMatcher('/_next/webpack-hmr')).toBe(false);
    expect(matchesProxyMatcher('/dashboard')).toBe(true);
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
  describe('fetch caller JSON 401 branch', () => {
    it('P1: /api/* path returns JSON 401 envelope when claims are absent', async () => {
      setSupabaseEnv();
      mockSupabaseClaims(null);

      const response = await proxy(makeRequest('/api/dashboard/stats'));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'auth_required',
        timestamp: expect.any(String),
        path: '/api/dashboard/stats',
      });
      // envelope timestamp is ISO 8601
      expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('P2: navigation with Accept: text/html still gets 307', async () => {
      setSupabaseEnv();
      mockSupabaseClaims(null);

      const response = await proxy(makeRequest('/dashboard', { accept: 'text/html' }));

      expectRedirectPath(response, '/login', '/dashboard');
    });

    it('P3: non-/api path with Accept: application/json (RSC-like fetch) returns JSON 401', async () => {
      setSupabaseEnv();
      mockSupabaseClaims(null);

      const response = await proxy(
        makeRequest('/dashboard', { accept: 'application/json' }),
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.message).toBe('auth_required');
    });

    it('P4: /api/* path with claims falls through (next response)', async () => {
      setSupabaseEnv();
      mockSupabaseClaims({ sub: 'user-1' });

      const response = await proxy(makeRequest('/api/dashboard/stats'));

      expect(response.status).toBe(200);
    });

    it('P5: returns JSON 401 even when Supabase env is missing for /api/* caller', async () => {
      const response = await proxy(makeRequest('/api/dashboard/stats'));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.message).toBe('auth_required');
      expect(body.error).toBe('Unauthorized');
      expect(createServerClient).not.toHaveBeenCalled();
    });
  });

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
