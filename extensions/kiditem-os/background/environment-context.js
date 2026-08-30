(function installKidItemEnvironmentContext(root) {
  'use strict';

  const AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';
  const DEFAULT_PROFILE_STORAGE_KEY = 'kiditem_environment_profiles_v1';
  const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
  const DEFAULT_AUTH_RESYNC_TIMEOUT_MS = 10_000;
  const ENVIRONMENT_IDS = Object.freeze(['local', 'office']);
  const ENVIRONMENTS = Object.freeze({
    local: Object.freeze({
      environmentId: 'local',
      webOrigin: 'http://localhost:3000',
      apiOrigin: 'http://localhost:4000',
      webUrlPattern: 'http://localhost:3000/*',
    }),
    office: Object.freeze({
      environmentId: 'office',
      webOrigin: 'http://kiditem-office',
      apiOrigin: 'http://kiditem-office',
      webUrlPattern: 'http://kiditem-office/*',
    }),
  });

  function createError(code, message, environmentId) {
    const error = new Error(message);
    error.code = code;
    if (environmentId) error.environmentId = environmentId;
    return error;
  }

  function composeRequestSignal(callerSignal, timeoutMs) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(callerSignal.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let cleaned = false;
    return {
      signal: controller.signal,
      cleanup() {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', forwardAbort);
      },
    };
  }

  function waitWithCallerSignal(promise, callerSignal) {
    if (!callerSignal) return promise;
    callerSignal.throwIfAborted();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (operation) => {
        if (settled) return;
        settled = true;
        callerSignal.removeEventListener('abort', handleAbort);
        operation();
      };
      const handleAbort = () => finish(() => reject(callerSignal.reason));
      callerSignal.addEventListener('abort', handleAbort, { once: true });
      Promise.resolve(promise).then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  function create(options) {
    if (!options?.chrome?.storage?.local) {
      throw new Error('Chrome local storage is required');
    }
    const chromeApi = options.chrome;
    const fetchFn = options.fetchFn;
    const requiresAuth = options.requiresAuth !== false;
    const profileStorageKey =
      options.profileStorageKey || DEFAULT_PROFILE_STORAGE_KEY;
    const legacyStorageKeys = [...new Set(options.legacyStorageKeys || [])]
      .filter((key) => typeof key === 'string' && key && key !== profileStorageKey);
    const now = options.now || Date.now;
    const requestTimeoutMs =
      options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    const authResyncTimeoutMs =
      options.authResyncTimeoutMs || DEFAULT_AUTH_RESYNC_TIMEOUT_MS;
    const resyncs = new Map();
    let profileMutationQueue = Promise.resolve();

    function requireEnvironment(environmentId) {
      const environment = ENVIRONMENTS[environmentId];
      if (!environment) {
        throw createError(
          'invalid_environment',
          'Unsupported KidItem environment',
          environmentId,
        );
      }
      return environment;
    }

    function resolveSender(sender) {
      try {
        const origin = new URL(sender?.url || '').origin;
        return (
          ENVIRONMENT_IDS.map((id) => ENVIRONMENTS[id]).find(
            (environment) => environment.webOrigin === origin,
          ) || null
        );
      } catch {
        return null;
      }
    }

    async function readProfiles() {
      const stored = await chromeApi.storage.local.get(profileStorageKey);
      const value = stored?.[profileStorageKey];
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    }

    function mutateProfiles(operation) {
      const result = profileMutationQueue.catch(() => undefined).then(async () => {
        const profiles = await readProfiles();
        const next = await operation({ ...profiles });
        await chromeApi.storage.local.set({ [profileStorageKey]: next });
        return next;
      });
      profileMutationQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }

    async function connect(environmentId) {
      requireEnvironment(environmentId);
      if (requiresAuth) return;
      // 하나의 확장이 requiresAuth 를 켠 컨텍스트(쿠팡/소싱)와 끈 컨텍스트
      // (주문수집)를 동시에 들고 같은 프로필 저장소를 쓴다. 프로필을 통째로
      // 갈아끼우면 주문수집 메시지 한 번에 다른 도메인의 accessToken 이 지워지므로
      // 기존 프로필 위에 병합한다.
      await mutateProfiles((profiles) => ({
        ...profiles,
        [environmentId]: { ...profiles[environmentId], updatedAt: now() },
      }));
    }

    async function connectedEnvironmentIds() {
      const profiles = await readProfiles();
      return ENVIRONMENT_IDS.filter((environmentId) => {
        const profile = profiles[environmentId];
        if (!profile || typeof profile !== 'object') return false;
        if (!requiresAuth) return Number.isFinite(profile.updatedAt);
        return (
          typeof profile.accessToken === 'string' &&
          profile.accessToken.trim().length > 0
        );
      });
    }

    async function setAccessToken(environmentId, token) {
      requireEnvironment(environmentId);
      if (!requiresAuth) {
        throw new Error('Access tokens are disabled for this extension');
      }
      if (typeof token !== 'string' || !token.trim()) {
        throw createError(
          'environment_auth_required',
          'KidItem access token is required',
          environmentId,
        );
      }
      await mutateProfiles((profiles) => ({
        ...profiles,
        [environmentId]: {
          accessToken: token,
          updatedAt: now(),
        },
      }));
    }

    async function clearAccessToken(environmentId) {
      requireEnvironment(environmentId);
      await mutateProfiles((profiles) => {
        delete profiles[environmentId];
        return profiles;
      });
    }

    async function getAccessToken(environmentId) {
      requireEnvironment(environmentId);
      if (!requiresAuth) return null;
      const profiles = await readProfiles();
      const token = profiles[environmentId]?.accessToken;
      return typeof token === 'string' && token.trim() ? token : null;
    }

    async function queryWebTabs(environmentId) {
      const environment = requireEnvironment(environmentId);
      return chromeApi.tabs.query({ url: environment.webUrlPattern });
    }

    async function publish(environmentId, eventName, detail) {
      if (typeof eventName !== 'string' || !eventName) {
        throw new Error('Event name is required');
      }
      let tabs;
      try {
        tabs = await queryWebTabs(environmentId);
      } catch {
        return;
      }
      await Promise.allSettled(
        tabs
          .filter((tab) => Number.isInteger(tab?.id))
          .map((tab) =>
            chromeApi.scripting.executeScript({
              target: { tabId: tab.id },
              func: function publishKidItemExtensionEvent(name, eventDetail) {
                window.dispatchEvent(new CustomEvent(name, { detail: eventDetail }));
              },
              args: [eventName, detail],
            }),
          ),
      );
    }

    function waitForAccessTokenChange(environmentId, previousToken) {
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (token) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          chromeApi.storage.onChanged.removeListener(handleStorageChange);
          resolve(token);
        };
        const handleStorageChange = (changes, areaName) => {
          if (areaName !== 'local' || !changes[profileStorageKey]) return;
          const profile = changes[profileStorageKey].newValue?.[environmentId];
          const token = profile?.accessToken;
          if (
            typeof token === 'string' &&
            token.trim() &&
            token !== previousToken
          ) {
            finish(token);
          }
        };
        timer = setTimeout(() => finish(null), authResyncTimeoutMs);
        chromeApi.storage.onChanged.addListener(handleStorageChange);
        getAccessToken(environmentId).then((token) => {
          if (token && token !== previousToken) finish(token);
        });
      });
    }

    async function notifyAuthRequired(environmentId) {
      const tabs = await queryWebTabs(environmentId);
      await Promise.allSettled(
        tabs
          .filter((tab) => Number.isInteger(tab?.id))
          .map((tab) =>
            chromeApi.scripting.executeScript({
              target: { tabId: tab.id },
              func: function requestKidItemExtensionAuth(eventName) {
                window.dispatchEvent(new CustomEvent(eventName));
              },
              args: [AUTH_REQUIRED_EVENT],
            }),
          ),
      );
    }

    function requestResyncedAccessToken(environmentId, previousToken) {
      const active = resyncs.get(environmentId);
      if (active) return active;
      const resync = (async () => {
        const changedToken = waitForAccessTokenChange(
          environmentId,
          previousToken,
        );
        await notifyAuthRequired(environmentId).catch(() => undefined);
        return changedToken;
      })().finally(() => {
        if (resyncs.get(environmentId) === resync) {
          resyncs.delete(environmentId);
        }
      });
      resyncs.set(environmentId, resync);
      return resync;
    }

    async function fetchOnce(environment, path, init, token) {
      const url = new URL(path, `${environment.apiOrigin}/`).toString();
      if (new URL(url).origin !== environment.apiOrigin) {
        throw createError(
          'invalid_environment',
          'KidItem API path escaped the environment origin',
          environment.environmentId,
        );
      }
      const headers = new Headers(init.headers || {});
      if (typeof token === 'string' && token.trim()) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const {
        timeoutMs = requestTimeoutMs,
        signal: callerSignal,
        ...requestInit
      } = init;
      const requestSignal = composeRequestSignal(callerSignal, timeoutMs);
      try {
        requestSignal.signal.throwIfAborted();
        return await fetchFn(url, {
          ...requestInit,
          headers,
          signal: requestSignal.signal,
        });
      } finally {
        requestSignal.cleanup();
      }
    }

    async function authedFetch(environmentId, path, init = {}) {
      const environment = requireEnvironment(environmentId);
      if (typeof fetchFn !== 'function' || !requiresAuth) {
        throw new Error('Authenticated fetch is unavailable');
      }
      let token = await getAccessToken(environmentId);
      if (!token) {
        token = await waitWithCallerSignal(
          requestResyncedAccessToken(environmentId, null),
          init.signal,
        );
        if (!token) {
          throw createError(
            'environment_auth_required',
            'KidItem login is required for this environment',
            environmentId,
          );
        }
      }
      const response = await fetchOnce(environment, path, init, token);
      if (response.status !== 401) return response;
      const nextToken = await waitWithCallerSignal(
        requestResyncedAccessToken(environmentId, token),
        init.signal,
      );
      if (!nextToken || nextToken === token) return response;
      return fetchOnce(environment, path, init, nextToken);
    }

    function storageKey(base, environmentId) {
      requireEnvironment(environmentId);
      if (typeof base !== 'string' || !base) throw new Error('Storage key is required');
      return `${base}:${environmentId}`;
    }

    function alarmName(base, environmentId) {
      return storageKey(base, environmentId);
    }

    function parseAlarmName(base, name) {
      if (typeof base !== 'string' || !base || typeof name !== 'string') return null;
      for (const environmentId of ENVIRONMENT_IDS) {
        if (name === `${base}:${environmentId}`) return environmentId;
      }
      return null;
    }

    async function migrateLegacyStorage() {
      if (legacyStorageKeys.length > 0) {
        await chromeApi.storage.local.remove(legacyStorageKeys);
      }
    }

    return Object.freeze({
      alarmName,
      authedFetch,
      clearAccessToken,
      connect,
      connectedEnvironmentIds,
      getAccessToken,
      migrateLegacyStorage,
      parseAlarmName,
      publish,
      queryWebTabs,
      requireEnvironment,
      resolveSender,
      setAccessToken,
      storageKey,
      environmentIds: ENVIRONMENT_IDS,
    });
  }

  root.KidItemEnvironmentContext = Object.freeze({ create });
})(globalThis);
