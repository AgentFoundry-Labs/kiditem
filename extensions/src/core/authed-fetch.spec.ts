import { describe, expect, it } from 'vitest';
import { createAuthStore } from './auth-store';
import { createApiClient } from './authed-fetch';
import type { EnvironmentProfile } from './environment';
import { RuntimeError } from './errors';

function memoryStorage() {
  const data: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return { [key]: structuredClone(data[key]) };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, structuredClone(values));
    },
  };
}

function harness(options: { respond?: (url: string, init: RequestInit) => Response | Promise<Response>; resyncTimeoutMs?: number; requestTimeoutMs?: number } = {}) {
  const store = createAuthStore({ storage: memoryStorage(), now: () => 1 });
  const calls: Array<{ url: string; authorization: string | null; signal: AbortSignal | null | undefined }> = [];
  const authRequests: string[] = [];
  let onAuthRequest: (environment: EnvironmentProfile) => void = () => undefined;
  const api = createApiClient({
    store,
    async fetch(url, init = {}) {
      calls.push({ url, authorization: new Headers(init.headers).get('authorization'), signal: init.signal });
      return options.respond ? options.respond(url, init) : new Response('{}', { status: 200 });
    },
    requestAuth(environment) {
      authRequests.push(environment.environmentId);
      onAuthRequest(environment);
    },
    resyncTimeoutMs: options.resyncTimeoutMs ?? 50,
    requestTimeoutMs: options.requestTimeoutMs ?? 1_000,
  });
  return { store, api, calls, authRequests, onAuth(listener: (environment: EnvironmentProfile) => void) { onAuthRequest = listener; } };
}

describe('KidItem API 호출(Bearer·환경 주소·재로그인 힌트)', () => {
  it('그 환경의 API 주소로 Bearer 토큰을 붙여 부른다', async () => {
    const { store, api, calls } = harness();
    await store.setAccessToken('local', 'token-a');
    const response = await api.apiPort('local').fetch('/api/operations?limit=1', { headers: { Authorization: 'Bearer forged' } });
    expect(response.status).toBe(200);
    expect(calls).toEqual([expect.objectContaining({ url: 'http://localhost:4000/api/operations?limit=1', authorization: 'Bearer token-a' })]);
  });

  it('환경 주소를 벗어나는 경로는 부르지 않는다', async () => {
    const { store, api, calls } = harness();
    await store.setAccessToken('office', 'token-o');
    await expect(api.apiPort('office').fetch('http://evil.test/api')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(api.apiPort('office').fetch('//evil.test/api')).rejects.toBeInstanceOf(RuntimeError);
    expect(calls).toEqual([]);
  });

  it('토큰이 없으면 웹 탭에 재로그인 힌트를 보내고 새 토큰이 오면 그 토큰으로 부른다', async () => {
    const { store, api, calls, authRequests, onAuth } = harness({ resyncTimeoutMs: 1_000 });
    onAuth(() => void store.setAccessToken('local', 'synced'));
    await api.apiPort('local').fetch('/api/x');
    expect(authRequests).toEqual(['local']);
    expect(calls[0]?.authorization).toBe('Bearer synced');
  });

  it('힌트 뒤에도 토큰이 오지 않으면 AUTH_REQUIRED로 멈추고 부르지 않는다', async () => {
    const { api, calls } = harness();
    await expect(api.apiPort('local').fetch('/api/x')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(calls).toEqual([]);
  });

  it('401이면 힌트를 보내 새 토큰을 받아 한 번만 다시 부른다', async () => {
    let status = 401;
    const { store, api, calls, authRequests, onAuth } = harness({
      resyncTimeoutMs: 1_000,
      respond: () => {
        const response = new Response('{}', { status });
        status = 401;
        return response;
      },
    });
    await store.setAccessToken('office', 'expired');
    onAuth(() => void store.setAccessToken('office', 'renewed'));
    const response = await api.apiPort('office').fetch('/api/x');
    expect(authRequests).toEqual(['office']);
    expect(calls.map((call) => call.authorization)).toEqual(['Bearer expired', 'Bearer renewed']);
    expect(response.status).toBe(401);
  });

  it('401 뒤 새 토큰이 오지 않으면 401 응답을 그대로 돌려준다(다시 부르지 않는다)', async () => {
    const { store, api, calls } = harness({ respond: () => new Response('{}', { status: 401 }) });
    await store.setAccessToken('office', 'expired');
    expect((await api.apiPort('office').fetch('/api/x')).status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('동시에 막힌 호출은 힌트 하나를 함께 기다린다', async () => {
    const { store, api, authRequests, onAuth } = harness({ resyncTimeoutMs: 1_000 });
    onAuth(() => setTimeout(() => void store.setAccessToken('local', 'shared'), 5));
    await Promise.all([api.apiPort('local').fetch('/api/a'), api.apiPort('local').fetch('/api/b')]);
    expect(authRequests).toEqual(['local']);
  });

  it('응답이 제한 시간을 넘으면 요청을 끊는다', async () => {
    const { store, api } = harness({
      requestTimeoutMs: 20,
      respond: (_url, init) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });
    await store.setAccessToken('local', 't');
    await expect(api.apiPort('local').fetch('/api/slow')).rejects.toThrow('aborted');
  });
});
