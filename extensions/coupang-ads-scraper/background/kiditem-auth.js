// Shared KidItem backend auth for the Coupang MV3 service worker.
// The logged-in KidItem web tab owns Supabase refresh and writes the current
// access token to chrome.storage.local. On 401 we ask that tab to refresh, wait
// for a changed token, and retry the request exactly once.

(() => {
  const AUTH_REQUIRED_EVENT = "kiditem:extension-auth-required";

  function create({
    chrome,
    fetchFn,
    apiUrl,
    tokenKey,
    webUrlPatterns,
    requestTimeoutMs = 25_000,
    authRefreshTimeoutMs = 10_000,
  }) {
    let authRefreshInFlight = null;

    function getAuthToken() {
      return new Promise((resolve) => {
        chrome.storage.local.get([tokenKey], (stored) => {
          const token = stored[tokenKey];
          resolve(
            typeof token === "string" && token.trim() ? token : null,
          );
        });
      });
    }

    function waitForAuthTokenChange(previousToken) {
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (token) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          chrome.storage.onChanged.removeListener(handleStorageChange);
          resolve(token);
        };
        const handleStorageChange = (changes, areaName) => {
          if (areaName !== "local") return;
          const nextToken = changes[tokenKey]?.newValue;
          if (
            typeof nextToken === "string" &&
            nextToken.trim() &&
            nextToken !== previousToken
          ) {
            finish(nextToken);
          }
        };

        timer = setTimeout(() => finish(null), authRefreshTimeoutMs);
        chrome.storage.onChanged.addListener(handleStorageChange);
        getAuthToken().then((currentToken) => {
          if (currentToken && currentToken !== previousToken) {
            finish(currentToken);
          }
        });
      });
    }

    async function notifyKidItemAuthRequired() {
      const tabs = await chrome.tabs.query({ url: webUrlPatterns });
      await Promise.all(
        tabs
          .filter((tab) => tab?.id)
          .map((tab) =>
            chrome.scripting
              .executeScript({
                target: { tabId: tab.id },
                func: (eventName) =>
                  window.dispatchEvent(new CustomEvent(eventName)),
                args: [AUTH_REQUIRED_EVENT],
              })
              .catch(() => null),
          ),
      );
    }

    function requestFreshAuthToken(previousToken) {
      if (authRefreshInFlight) return authRefreshInFlight;
      authRefreshInFlight = (async () => {
        const changedToken = waitForAuthTokenChange(previousToken);
        await notifyKidItemAuthRequired().catch(() => null);
        return changedToken;
      })().finally(() => {
        authRefreshInFlight = null;
      });
      return authRefreshInFlight;
    }

    async function fetchWithToken(path, init, token) {
      const headers = new Headers(init.headers || {});
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const { timeoutMs = requestTimeoutMs, ...rest } = init;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetchFn(`${apiUrl}${path}`, {
          ...rest,
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }

    async function authedFetch(path, init = {}) {
      const token = await getAuthToken();
      const response = await fetchWithToken(path, init, token);
      if (response.status !== 401) return response;

      const nextToken = await requestFreshAuthToken(token);
      if (!nextToken || nextToken === token) return response;
      return fetchWithToken(path, init, nextToken);
    }

    return Object.freeze({ authedFetch, getAuthToken });
  }

  globalThis.KidItemAuth = Object.freeze({ create });
})();
