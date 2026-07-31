(function (globalScope) {
  "use strict";

  const CONTRACT_VERSION = 2;
  const DEFAULT_MAX_ATTEMPTS = 40;
  const DEFAULT_TIMEOUT_MS = 20_000;
  const DEFAULT_INTERVAL_MS = 500;

  function create(options = {}) {
    const chromeApi = options.chrome || globalScope.chrome;
    const sendMessage = options.sendMessage || ((tabId, message) =>
      chromeApi.tabs.sendMessage(tabId, message));
    const sleep = options.sleep || ((milliseconds) =>
      new Promise((resolve) => globalScope.setTimeout(resolve, milliseconds)));
    const now = options.now || (() => Date.now());
    const maxAttempts = positiveInteger(
      options.maxAttempts,
      DEFAULT_MAX_ATTEMPTS,
    );
    const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const intervalMs = positiveInteger(options.intervalMs, DEFAULT_INTERVAL_MS);

    async function wait(tabId, expectedUrl) {
      const startedAt = now();
      for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
        try {
          const response = await sendMessage(tabId, {
            action: "wingFormReady",
            contractVersion: CONTRACT_VERSION,
          });
          if (response?.ready === true) {
            if (response.contractVersion !== CONTRACT_VERSION) {
              return {
                ok: false,
                code: "wing_form_contract_incompatible",
                retryable: false,
                tabId,
                attempts,
                detectedContractVersion: response.contractVersion ?? null,
              };
            }
            if (!sameDocumentUrl(response.url, expectedUrl)) {
              return {
                ok: false,
                code: "wing_form_wrong_page",
                retryable: false,
                tabId,
                attempts,
              };
            }
            return {
              ok: true,
              tabId,
              attempts,
              contractVersion: CONTRACT_VERSION,
            };
          }
        } catch (error) {
          if (/no tab with id|tab was closed/i.test(String(error?.message || error))) {
            return {
              ok: false,
              code: "wing_form_tab_closed",
              retryable: false,
              tabId,
              attempts,
            };
          }
        }

        if (
          attempts === maxAttempts
          || now() - startedAt + intervalMs > timeoutMs
        ) {
          return {
            ok: false,
            code: "wing_form_content_not_ready",
            retryable: true,
            tabId,
            attempts,
          };
        }
        await sleep(intervalMs);
      }

      return {
        ok: false,
        code: "wing_form_content_not_ready",
        retryable: true,
        tabId,
        attempts: maxAttempts,
      };
    }

    return Object.freeze({ wait });
  }

  function sameDocumentUrl(actual, expected) {
    return normalizeUrl(actual) === normalizeUrl(expected);
  }

  function normalizeUrl(value) {
    return String(value || "")
      .split(/[?#]/, 1)[0]
      .replace(/\/$/, "");
  }

  function positiveInteger(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  globalScope.KidItemWingFormReadiness = Object.freeze({
    contractVersion: CONTRACT_VERSION,
    create,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
