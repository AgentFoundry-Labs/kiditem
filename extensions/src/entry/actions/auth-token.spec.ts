import { AuthTokenResponseSchema } from '@kiditem/shared/extension-actions';
import { describe, expect, it } from 'vitest';
import { createAuthStore, PROFILE_STORAGE_KEY } from '../../core/auth-store';
import { clearAuthTokenAction } from './clear-auth-token';
import { setAuthTokenAction } from './set-auth-token';

function store() {
  const data: Record<string, unknown> = {};
  return {
    data,
    store: createAuthStore({
      storage: { get: async (key) => ({ [key]: structuredClone(data[key]) }), set: async (values) => void Object.assign(data, structuredClone(values)) },
      now: () => 5,
    }),
  };
}

const sender = { url: 'http://localhost:3000/' };

describe('setAuthToken·clearAuthToken — 보내는 창의 환경 프로필에만 쓰고 토큰은 되돌려 주지 않는다', () => {
  it('토큰을 그 환경에 저장하고 응답에는 환경만 싣는다', async () => {
    const { data, store: auth } = store();
    const action = setAuthTokenAction(auth);
    const parsed = action.schema.safeParse({ action: 'setAuthToken', token: 'secret-token' });
    expect(parsed.success).toBe(true);
    const response = await action.handle(parsed.success ? parsed.data : never(), { environmentId: 'office', sender });
    expect(AuthTokenResponseSchema.parse(response)).toEqual({ success: true, environmentId: 'office' });
    expect(JSON.stringify(response)).not.toContain('secret-token');
    expect(data[PROFILE_STORAGE_KEY]).toEqual({ office: { accessToken: 'secret-token', updatedAt: 5 } });
  });

  it('빈 토큰·모르는 칸은 스키마가 거절한다', () => {
    const action = setAuthTokenAction(store().store);
    expect(action.schema.safeParse({ action: 'setAuthToken', token: '' }).success).toBe(false);
    expect(action.schema.safeParse({ action: 'setAuthToken', token: 't', environmentId: 'office' }).success).toBe(false);
  });

  it('지우기는 그 환경만 지운다', async () => {
    const { data, store: auth } = store();
    await auth.setAccessToken('local', 'a');
    await auth.setAccessToken('office', 'b');
    const action = clearAuthTokenAction(auth);
    const parsed = action.schema.safeParse({ action: 'clearAuthToken' });
    const response = await action.handle(parsed.success ? parsed.data : never(), { environmentId: 'local', sender });
    expect(AuthTokenResponseSchema.parse(response)).toEqual({ success: true, environmentId: 'local' });
    expect(data[PROFILE_STORAGE_KEY]).toEqual({ office: { accessToken: 'b', updatedAt: 5 } });
  });
});

function never(): never {
  throw new Error('parse failed');
}
