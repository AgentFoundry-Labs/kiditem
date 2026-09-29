import { describe, expect, it } from 'vitest';
import { createAuthStore, PROFILE_STORAGE_KEY } from './auth-store';

function fakeStorage(initial: Record<string, unknown> = {}, delayMs = 0) {
  const data: Record<string, unknown> = { ...initial };
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  return {
    data,
    async get(key: string) {
      await wait();
      return { [key]: structuredClone(data[key]) };
    },
    async set(values: Record<string, unknown>) {
      await wait();
      Object.assign(data, structuredClone(values));
    },
  };
}

describe('토큰 저장소(환경별 프로필)', () => {
  it('옛 environment-context와 같은 키·모양 {환경: {accessToken, updatedAt}}에 쓴다', async () => {
    const storage = fakeStorage();
    const store = createAuthStore({ storage, now: () => 1_700 });
    await store.setAccessToken('local', 'token-local');
    expect(PROFILE_STORAGE_KEY).toBe('kiditem_environment_profiles_v1');
    expect(storage.data[PROFILE_STORAGE_KEY]).toEqual({ local: { accessToken: 'token-local', updatedAt: 1_700 } });
    expect(await store.getAccessToken('local')).toBe('token-local');
  });

  it('지우기는 그 환경 프로필만 지우고 다른 환경은 둔다', async () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: { local: { accessToken: 'a', updatedAt: 1 }, office: { accessToken: 'b', updatedAt: 2 } } });
    const store = createAuthStore({ storage, now: () => 3 });
    await store.clearAccessToken('local');
    expect(storage.data[PROFILE_STORAGE_KEY]).toEqual({ office: { accessToken: 'b', updatedAt: 2 } });
    expect(await store.getAccessToken('local')).toBeNull();
  });

  it('동시에 온 쓰기는 줄을 세워 서로 지우지 않는다', async () => {
    const storage = fakeStorage({}, 5);
    const store = createAuthStore({ storage, now: () => 9 });
    await Promise.all([store.setAccessToken('local', 'a'), store.setAccessToken('office', 'b')]);
    expect(storage.data[PROFILE_STORAGE_KEY]).toEqual({ local: { accessToken: 'a', updatedAt: 9 }, office: { accessToken: 'b', updatedAt: 9 } });
  });

  it('빈 토큰은 저장하지 않고, 공백 토큰은 없는 것으로 읽는다', async () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: { office: { accessToken: '  ', updatedAt: 1 } } });
    const store = createAuthStore({ storage, now: () => 1 });
    await expect(store.setAccessToken('local', ' ')).rejects.toThrow();
    expect(await store.getAccessToken('office')).toBeNull();
  });

  it('새 토큰을 기다리는 쪽은 다른 토큰이 저장되면 그 값을, 시간이 지나면 null을 받는다', async () => {
    const store = createAuthStore({ storage: fakeStorage(), now: () => 1 });
    const waiting = store.waitForNewToken('local', 'old', 1_000);
    await store.setAccessToken('office', 'other-environment');
    await store.setAccessToken('local', 'old');
    await store.setAccessToken('local', 'fresh');
    expect(await waiting).toBe('fresh');
    expect(await store.waitForNewToken('office', 'other-environment', 10)).toBeNull();
  });
});
