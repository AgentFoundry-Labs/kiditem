import type { EnvironmentId } from './environment';
import { RuntimeError } from './errors';

/**
 * 환경별 KidItem 세션 토큰 저장소(KID-366). 옛 `environment-context.js`와 **같은 키·모양**
 * (`kiditem_environment_profiles_v1` = `{[환경]: {accessToken, updatedAt}}`)이라 과도기에 남은 옛 워커의
 * `authedFetch`가 이 저장소가 쓴 토큰을 그대로 읽는다. 토큰은 여기와 `chrome.storage.local`에만 있고
 * 응답·로그·오류 details로 나가지 않는다.
 */
export const PROFILE_STORAGE_KEY = 'kiditem_environment_profiles_v1';

export interface ProfileStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface AuthStore {
  setAccessToken(environmentId: EnvironmentId, token: string): Promise<void>;
  clearAccessToken(environmentId: EnvironmentId): Promise<void>;
  getAccessToken(environmentId: EnvironmentId): Promise<string | null>;
  /** `previous`와 다른 토큰이 저장될 때까지 기다린다(웹이 다시 보내 주는 토큰). 시간이 지나면 null. */
  waitForNewToken(environmentId: EnvironmentId, previous: string | null, timeoutMs: number): Promise<string | null>;
}

type Profiles = Record<string, { accessToken?: unknown; updatedAt?: unknown } | undefined>;

export function createAuthStore(deps: { storage: ProfileStorage; now(): number }): AuthStore {
  // 읽고-고쳐-쓰기를 한 줄로 세운다 — 두 환경의 쓰기가 겹치면 먼저 쓴 쪽이 지워진다.
  let tail: Promise<unknown> = Promise.resolve();
  const waiters = new Set<{ environmentId: EnvironmentId; previous: string | null; resolve(token: string): void }>();

  async function read(): Promise<Profiles> {
    const value = (await deps.storage.get(PROFILE_STORAGE_KEY))?.[PROFILE_STORAGE_KEY];
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Profiles) } : {};
  }

  function mutate(operation: (profiles: Profiles) => Profiles): Promise<void> {
    const result = tail.catch(() => undefined).then(async () => {
      await deps.storage.set({ [PROFILE_STORAGE_KEY]: operation(await read()) });
    });
    tail = result;
    return result;
  }

  function usable(token: unknown): string | null {
    return typeof token === 'string' && token.trim() ? token : null;
  }

  async function getAccessToken(environmentId: EnvironmentId): Promise<string | null> {
    await tail.catch(() => undefined);
    return usable((await read())[environmentId]?.accessToken);
  }

  return {
    getAccessToken,
    async setAccessToken(environmentId, token) {
      if (!usable(token)) throw new RuntimeError('AUTH_REQUIRED', '로그인이 필요합니다. 다시 로그인해 주세요.', { environmentId });
      await mutate((profiles) => ({ ...profiles, [environmentId]: { accessToken: token, updatedAt: deps.now() } }));
      for (const waiter of [...waiters]) {
        if (waiter.environmentId === environmentId && waiter.previous !== token) waiter.resolve(token);
      }
    },
    async clearAccessToken(environmentId) {
      await mutate((profiles) => {
        const next = { ...profiles };
        delete next[environmentId];
        return next;
      });
    },
    waitForNewToken(environmentId, previous, timeoutMs) {
      return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const waiter = {
          environmentId,
          previous,
          resolve(token: string) {
            if (!waiters.delete(waiter)) return;
            clearTimeout(timer);
            resolve(token);
          },
        };
        waiters.add(waiter);
        timer = setTimeout(() => {
          if (waiters.delete(waiter)) resolve(null);
        }, timeoutMs);
        // 기다리기 전에 이미 새 토큰이 있으면 그것을 쓴다.
        void getAccessToken(environmentId).then((token) => {
          if (token && token !== previous) waiter.resolve(token);
        }, () => undefined);
      });
    },
  };
}
