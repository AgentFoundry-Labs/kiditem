(function (global) {
  "use strict";

  const NAVIGATION_TIMEOUT_MS = 35_000;
  const EXTRACTION_TIMEOUT_MS = 25_000;

  function create(options) {
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;
    const sessions = options.sessions;
    const activeRuns = new Map();

    async function collect(urlValue, requestedRunId, environmentId, operationContext) {
      const validated = validateLiveUrl(urlValue);
      if (!validated.ok) return { success: false, error: validated.error };
      const operationAttemptToken = operationContext?.attemptToken;
      if (typeof operationAttemptToken !== "string" || !operationAttemptToken) {
        return { success: false, error: "operation_attempt_token_required" };
      }
      if (typeof requestedRunId !== "string" || !requestedRunId) {
        return { success: false, error: "operation_run_id_required" };
      }
      const backendConfig = await getBackendRequestConfig(environmentId);
      if (!backendConfig.ok) return { success: false, error: backendConfig.error };

      const runId = await prepareRun(requestedRunId, validated, environmentId);
      const run = {
        environmentId,
        runId,
        operationAttemptToken,
        backendConfig,
        tabId: null,
        keepTabOpen: false,
        cancelRequested: false,
      };
      activeRuns.set(runId, run);
      let tabId = null;
      try {
        const tab = await createTab(chromeApi, validated.url);
        tabId = tab.id;
        if (run.cancelRequested) {
          await removeTab(chromeApi, tabId);
          tabId = null;
          throw new Error("Collection cancelled");
        }
        run.tabId = tabId;
        if (Number.isInteger(tab.windowId)) {
          await sessions.attachTab(runId, {
            tabId,
            windowId: tab.windowId,
          });
        }
        if (run.cancelRequested) throw new Error("Collection cancelled");
        await sessions.progress(runId, {
          current: 0,
          total: 1,
          completed: 0,
          failed: 0,
          label: "라이브 방송 페이지 확인 중",
        });
        const navigated = await waitForNavigation(chromeApi, tabId, validated.url);
        if (run.cancelRequested) throw new Error("Collection cancelled");
        if (navigated.verificationRequired) {
          run.keepTabOpen = true;
          const attention = await requireAttention(sessions, runId, navigated.url);
          if (attention.cancelled) {
            run.keepTabOpen = false;
            run.tabId = null;
            tabId = null;
          }
          return attention;
        }

        let extracted = await triggerExtraction(chromeApi, tabId);
        if (run.cancelRequested) throw new Error("Collection cancelled");
        if (extracted?.error === "content_script_missing") {
          const injected = await ensureContentScripts(tabId);
          if (run.cancelRequested) throw new Error("Collection cancelled");
          if (!injected) throw new Error("라이브 수집 스크립트를 주입하지 못했습니다.");
          extracted = await triggerExtraction(chromeApi, tabId);
          if (run.cancelRequested) throw new Error("Collection cancelled");
        }
        if (!extracted?.ok) {
          if (extracted?.status === "verification_required") {
            run.keepTabOpen = true;
            const attention = await requireAttention(
              sessions,
              runId,
              extracted.verificationUrl || navigated.url,
            );
            if (attention.cancelled) {
              run.keepTabOpen = false;
              run.tabId = null;
              tabId = null;
            }
            return attention;
          }
          throw new Error(extracted?.error || "방송 정보를 찾지 못했습니다.");
        }
        if (run.cancelRequested) throw new Error("Collection cancelled");

        const request = backendConfig.request || fetch;
        const response = await request(
          `${backendConfig.apiBase}/sourcing/operations/live-commerce/${encodeURIComponent(runId)}/results`,
          {
            method: "POST",
            headers: {
              ...backendConfig.headers,
              "x-operation-attempt-token": run.operationAttemptToken,
            },
            body: JSON.stringify({
              source: extracted.source,
              pageUrl: extracted.pageUrl,
              broadcast: extracted.broadcast,
              products: extracted.products,
            }),
          },
        );
        const body = await readResponse(response);
        if (!response.ok) {
          const error = new Error(body?.message || `KidItem API HTTP ${response.status}`);
          if (response.status === 409) {
            error.code = "operation_runtime_fence_lost";
            error.status = 409;
          }
          throw error;
        }
        if (run.cancelRequested) throw new Error("Collection cancelled");
        await sessions.progress(runId, {
          current: 1,
          total: 1,
          completed: 1,
          failed: 0,
          label: "라이브 방송 수집 완료",
        });
        if (run.cancelRequested) throw new Error("Collection cancelled");
        await sessions.succeed(runId);
        if (run.cancelRequested) throw new Error("Collection cancelled");
        await removeTab(chromeApi, tabId);
        tabId = null;
        run.tabId = null;
        if (run.cancelRequested) throw new Error("Collection cancelled");
        return {
          success: true,
          runId,
          source: body.source || extracted.source,
          broadcastCount: normalizeCount(body.broadcastCount),
          productCount: normalizeCount(body.productCount),
          businessDate: body.businessDate || null,
        };
      } catch (error) {
        if (!run.cancelRequested) await sessions.fail(runId);
        if (run.cancelRequested) {
          return {
            success: false,
            cancelled: true,
            status: "cancelled",
            runId,
            error: "Collection cancelled",
          };
        }
        return {
          success: false,
          runId,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error?.code || null,
        };
      } finally {
        if (!run.keepTabOpen && tabId && run.tabId === tabId) {
          await removeTab(chromeApi, tabId);
        }
        if (!run.keepTabOpen) activeRuns.delete(runId);
      }
    }

    async function prepareRun(requestedRunId, validated, environmentId) {
      if (typeof requestedRunId !== "string" || !requestedRunId) {
        throw new Error("operation_run_id_required");
      }
      const session = await sessions.get(requestedRunId);
      if (session) {
        throw new Error("operation_collection_session_already_exists");
      }
      await sessions.start({
        environmentId,
        runId: requestedRunId,
        producer: "sourcing.live_commerce",
        classification: "background_preferred",
        restartStrategy: "extension",
        inputIdentity: {
          source: validated.source,
          pageUrl: toSafePageUrl(validated.url),
        },
      });
      return requestedRunId;
    }

    async function cancel(runId) {
      const run = activeRuns.get(runId);
      if (run) {
        run.cancelRequested = true;
        run.keepTabOpen = false;
        run.tabId = null;
        activeRuns.delete(runId);
      }
      await sessions.cancel(runId, { closeManagedTab: true });
      return sessions.get(runId);
    }

    return { collect, cancel, validateLiveUrl };
  }

  async function requireAttention(sessions, runId, verificationUrl) {
    const reason = isCaptchaUrl(verificationUrl) ? "captcha" : "marketplace_login";
    const message = reason === "captcha"
      ? "방송 수집을 계속하려면 보안문자를 완료해주세요. 알림에서 확인 탭을 열 수 있습니다."
      : "방송 수집을 계속하려면 로그인해주세요. 알림에서 확인 탭을 열 수 있습니다.";
    const session = await sessions.requireAttention(runId, { reason, message });
    if (session?.status === "cancelled") {
      return {
        success: false,
        cancelled: true,
        runId,
        status: "cancelled",
      };
    }
    return {
      success: false,
      runId,
      status: "attention_required",
      error: message,
      verificationUrl,
    };
  }

  function validateLiveUrl(urlValue) {
    if (typeof urlValue !== "string" || !urlValue.trim() || urlValue.length > 500) {
      return { ok: false, error: "1688 또는 도우인 방송 URL을 입력해주세요." };
    }
    try {
      const url = new URL(urlValue.trim());
      if (url.protocol !== "https:") return { ok: false, error: "HTTPS 방송 URL만 수집할 수 있습니다." };
      const host = url.hostname.toLowerCase();
      const source = host === "zb.1688.com" || host.endsWith(".zb.1688.com")
        ? "1688"
        : host === "live.douyin.com" || host.endsWith(".live.douyin.com")
          ? "douyin"
          : null;
      if (!source) return { ok: false, error: "1688 또는 도우인 방송 URL만 수집할 수 있습니다." };
      const normalized = url.toString();
      if (normalized.length > 500) {
        return { ok: false, error: "방송 URL이 너무 깁니다." };
      }
      return { ok: true, url: normalized, source };
    } catch (e) {
      return { ok: false, error: "방송 URL 형식이 올바르지 않습니다." };
    }
  }

  function createTab(chromeApi, url) {
    return new Promise((resolve, reject) => {
      chromeApi.tabs.create({ url, active: false }, (tab) => {
        const error = chromeApi.runtime.lastError;
        if (error || !tab?.id) {
          reject(new Error(error?.message || "방송 탭을 열 수 없습니다."));
          return;
        }
        resolve(tab);
      });
    });
  }

  function waitForNavigation(chromeApi, tabId, requestedUrl) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (result, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chromeApi.tabs.onUpdated.removeListener(listener);
        if (error) reject(error);
        else resolve(result);
      };
      const listener = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        const url = tab?.url || requestedUrl;
        finish({ url, verificationRequired: isVerificationUrl(url) });
      };
      const timer = setTimeout(() => finish(null, new Error("방송 페이지 로딩 시간이 초과되었습니다.")), NAVIGATION_TIMEOUT_MS);
      chromeApi.tabs.onUpdated.addListener(listener);
      chromeApi.tabs.get(tabId, (tab) => {
        if (tab?.status === "complete") {
          const url = tab.url || requestedUrl;
          finish({ url, verificationRequired: isVerificationUrl(url) });
        }
      });
    });
  }

  function triggerExtraction(chromeApi, tabId) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ ok: false, error: "방송 상품 추출 시간이 초과되었습니다." });
        }
      }, EXTRACTION_TIMEOUT_MS);
      chromeApi.tabs.sendMessage(tabId, { type: "TRIGGER_LIVE_COMMERCE_EXTRACT" }, (response) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (chromeApi.runtime.lastError) {
          resolve({ ok: false, error: "content_script_missing" });
          return;
        }
        resolve(response || { ok: false, error: "방송 페이지가 응답하지 않았습니다." });
      });
    });
  }

  function removeTab(chromeApi, tabId) {
    if (!tabId) return Promise.resolve();
    return new Promise((resolve) => {
      chromeApi.tabs.remove(tabId, () => {
        void chromeApi.runtime.lastError;
        resolve();
      });
    });
  }

  function isVerificationUrl(urlValue) {
    try {
      const url = new URL(urlValue);
      return url.pathname.includes("/punish")
        || url.searchParams.get("action") === "captcha"
        || /(?:verify|captcha|login)/i.test(url.pathname);
    } catch (e) {
      return false;
    }
  }

  function isCaptchaUrl(urlValue) {
    try {
      const url = new URL(urlValue);
      return url.pathname.includes("/punish")
        || url.searchParams.get("action") === "captcha"
        || /(?:verify|captcha)/i.test(url.pathname);
    } catch (e) {
      return false;
    }
  }

  function toSafePageUrl(urlValue) {
    const url = new URL(urlValue);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  async function readResponse(response) {
    try { return await response.json(); } catch (e) { return null; }
  }

  function normalizeCount(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  global.ProductScraperLiveCommerce = { create, validateLiveUrl };
})(globalThis);
