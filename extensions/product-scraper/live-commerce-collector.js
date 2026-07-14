(function (global) {
  "use strict";

  const NAVIGATION_TIMEOUT_MS = 35_000;
  const EXTRACTION_TIMEOUT_MS = 25_000;

  function create(options) {
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;

    async function collect(urlValue) {
      const validated = validateLiveUrl(urlValue);
      if (!validated.ok) return { success: false, error: validated.error };
      const backendConfig = await getBackendRequestConfig();
      if (!backendConfig.ok) return { success: false, error: backendConfig.error };

      let tabId = null;
      try {
        const tab = await createTab(chromeApi, validated.url);
        tabId = tab.id;
        const navigated = await waitForNavigation(chromeApi, tabId, validated.url);
        if (navigated.verificationRequired) {
          return {
            success: false,
            status: "verification_required",
            error: "열린 방송 탭에서 로그인 또는 보안문자를 완료한 뒤 다시 수집하세요.",
            verificationUrl: navigated.url,
          };
        }

        let extracted = await triggerExtraction(chromeApi, tabId);
        if (extracted?.error === "content_script_missing") {
          const injected = await ensureContentScripts(tabId);
          if (!injected) throw new Error("라이브 수집 스크립트를 주입하지 못했습니다.");
          extracted = await triggerExtraction(chromeApi, tabId);
        }
        if (!extracted?.ok) {
          if (extracted?.status === "verification_required") {
            return {
              success: false,
              status: "verification_required",
              error: "열린 방송 탭에서 로그인 또는 보안문자를 완료한 뒤 다시 수집하세요.",
              verificationUrl: extracted.verificationUrl || navigated.url,
            };
          }
          throw new Error(extracted?.error || "방송 정보를 찾지 못했습니다.");
        }

        const response = await fetch(`${backendConfig.base}/trend/live-commerce-results`, {
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
        await removeTab(chromeApi, tabId);
        tabId = null;
        return {
          success: true,
          source: body.source || extracted.source,
          broadcastCount: normalizeCount(body.broadcastCount),
          productCount: normalizeCount(body.productCount),
          businessDate: body.businessDate || null,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    return { collect, validateLiveUrl };
  }

  function validateLiveUrl(urlValue) {
    if (typeof urlValue !== "string" || !urlValue.trim() || urlValue.length > 2048) {
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
      return { ok: true, url: url.toString(), source };
    } catch (e) {
      return { ok: false, error: "방송 URL 형식이 올바르지 않습니다." };
    }
  }

  function createTab(chromeApi, url) {
    return new Promise((resolve, reject) => {
      chromeApi.tabs.create({ url, active: true }, (tab) => {
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

  async function readResponse(response) {
    try { return await response.json(); } catch (e) { return null; }
  }

  function normalizeCount(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  global.ProductScraperLiveCommerce = { create, validateLiveUrl };
})(globalThis);
