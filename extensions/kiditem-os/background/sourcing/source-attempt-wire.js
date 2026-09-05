(function (global) {
  "use strict";

  function failure(error, fallbackCode, fallbackMessage) {
    return {
      code: typeof error?.code === "string" && error.code.trim()
        ? error.code.trim().slice(0, 100) : fallbackCode,
      message: String(error?.message || fallbackMessage).trim().slice(0, 300) || fallbackMessage,
    };
  }

  // Transport only: collectors retain their plans, extraction, and terminal interpretation.
  function create({ chrome, sourcePath, requestFailureMessage }) {
    function getCorrelation(key) {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (value) => resolve(value?.[key] || null));
      });
    }

    function setCorrelation(key, value) {
      return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
    }

    async function requestJson(config, path, init) {
      const response = await (config.request || global.fetch)(`${config.apiBase}${path}`, init);
      const body = await (response?.json?.().catch(() => null) ?? Promise.resolve(null));
      if (!response?.ok) {
        const error = new Error(body?.message || `${requestFailureMessage} (${response?.status || 0}).`);
        error.code = "SOURCE_OWNER_REQUEST_FAILED";
        if (response?.status) error.status = response.status;
        throw error;
      }
      return body;
    }

    async function requestJsonWithRetry(config, path, init, parse = (value) => value) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return parse(await requestJson(config, path, init));
        } catch (error) {
          const retryable = !Number.isInteger(error?.status) || error.status >= 500;
          if (!retryable || attempt === 2) throw error;
        }
      }
    }

    async function terminal(config, plan, { method, suffix, body }, parse = (value) => value) {
      return requestJsonWithRetry(config, `${sourcePath}/${encodeURIComponent(plan.attemptId)}${suffix}`, {
        method,
        headers: { ...config.headers, "x-source-attempt-token": plan.attemptToken },
        body: JSON.stringify(body),
      }, parse);
    }

    return Object.freeze({
      requestJson, requestJsonWithRetry, terminal, failure, getCorrelation, setCorrelation,
      clearCorrelation: (key) => setCorrelation(key, null),
    });
  }

  global.KidItemSourcingAttemptWire = Object.freeze({ create });
})(globalThis);
