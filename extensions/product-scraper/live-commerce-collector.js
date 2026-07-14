(function (global) {
  "use strict";

  const NAVIGATION_TIMEOUT_MS = 35_000;
  const EXTRACTION_TIMEOUT_MS = 25_000;

  function create(options) {
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;
    const sessions = options.sessions;
    const createRunId = options.createRunId || (() => {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return global.crypto.randomUUID();
      }
      return `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    });
    const activeRuns = new Map();

    async function collect(urlValue, requestedRunId) {
      const validated = validateLiveUrl(urlValue);
      if (!validated.ok) return { success: false, error: validated.error };
      const backendConfig = await getBackendRequestConfig();
      if (!backendConfig.ok) return { success: false, error: backendConfig.error };

      const runId = await prepareRun(requestedRunId, validated);
      const run = { runId, tabId: null, keepTabOpen: false, cancelRequested: false };
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
        const response = await request(`${backendConfig.base}/trend/live-commerce-results`, {
          method: "POST",
          headers: backendConfig.headers,
          body: JSON.stringify({
            source: extracted.source,
            pageUrl: extracted.pageUrl,
            broadcast: extracted.broadcast,
            products: extracted.products,
          }),
        });
        const body = await readResponse(response);
        if (!response.ok) throw new Error(body?.message || `KidItem API HTTP ${response.status}`);
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
        };
      } finally {
        if (!run.keepTabOpen && tabId && run.tabId === tabId) {
          await removeTab(chromeApi, tabId);
        }
        if (!run.keepTabOpen) activeRuns.delete(runId);
      }
    }

    async function prepareRun(requestedRunId, validated) {
      if (typeof requestedRunId !== "string" || !requestedRunId) {
        const runId = createRunId();
        await sessions.start({
          runId,
          producer: "sourcing.live_commerce",
          classification: "background_preferred",
          restartStrategy: "web",
          inputIdentity: {
            source: validated.source,
            pageUrl: toSafePageUrl(validated.url),
          },
        });
        return runId;
      }

      const session = await sessions.get(requestedRunId);
      if (
        !session ||
        session.producer !== "sourcing.live_commerce" ||
        session.restartStrategy !== "web"
      ) {
        throw new Error("Collection session not found");
      }
      if (
        session.inputIdentity?.source !== validated.source ||
        session.inputIdentity?.pageUrl !== toSafePageUrl(validated.url)
      ) {
        throw new Error("Live-commerce page owner does not match this run");
      }
      if (session.status === "pending" || session.status === "running") {
        throw new Error("Live-commerce collection session is already active");
      }
      const previousRun = activeRuns.get(requestedRunId);
      if (previousRun) {
        previousRun.cancelRequested = true;
        previousRun.keepTabOpen = false;
        activeRuns.delete(requestedRunId);
      }
      await sessions.restart(requestedRunId, { closeManagedTab: true });
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
      const source = host === "1688.com" || host.endsWith(".1688.com")
        ? "1688"
        : host === "douyin.com" || host.endsWith(".douyin.com")
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
