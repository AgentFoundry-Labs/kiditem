import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../proxy';

function makeRequest(
  path: string,
  init?: { accept?: string; authenticated?: boolean },
) {
  const headers: Record<string, string> = {};
  if (init?.accept) headers.accept = init.accept;
  if (init?.authenticated) headers.cookie = `kiditem_session=${'a'.repeat(43)}`;
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

function expectRedirectPath(response: Response, pathname: string, next: string) {
  expect(response.status).toBe(307);
  const url = new URL(response.headers.get('location') ?? '');
  expect(url.pathname).toBe(pathname);
  expect(url.searchParams.get('next')).toBe(next);
}

describe('proxy local session gate', () => {
  it('redirects protected navigation when the KidItem cookie is absent', async () => {
    const response = await proxy(makeRequest('/dashboard'));
    expectRedirectPath(response, '/login', '/dashboard');
  });

  it('allows protected navigation when the cookie is present', async () => {
    const response = await proxy(makeRequest('/dashboard', { authenticated: true }));
    expect(response.status).toBe(200);
  });

  it('always leaves /login public so a stale cookie cannot create a redirect loop', async () => {
    const response = await proxy(makeRequest('/login', { authenticated: true }));
    expect(response.status).toBe(200);
  });

  it('returns the shared JSON 401 envelope for an unauthenticated API caller', async () => {
    const response = await proxy(makeRequest('/api/dashboard/stats'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'auth_required',
      timestamp: expect.any(String),
      path: '/api/dashboard/stats',
    });
  });

  it('returns JSON 401 for a non-API application/json request without a cookie', async () => {
    const response = await proxy(makeRequest('/dashboard', { accept: 'application/json' }));
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe('auth_required');
  });

  it('allows authenticated API callers through to NestJS validation', async () => {
    const response = await proxy(makeRequest('/api/dashboard/stats', { authenticated: true }));
    expect(response.status).toBe(200);
  });

  it.each(['/api/copilotkit', '/api/copilotkit/info'])(
    'passes chat transport %s through without an early cookie check',
    async (path) => {
      const response = await proxy(makeRequest(path));
      expect(response.status).toBe(200);
    },
  );
});
