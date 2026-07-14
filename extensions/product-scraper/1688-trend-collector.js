(function (global) {
  "use strict";

  const STATUS_KEY = "kiditem_1688_trend_collection_status";
  const SEARCH_ORIGIN = "https://s.1688.com";
  const NAVIGATION_TIMEOUT_MS = 30000;
  const EXTRACTION_TIMEOUT_MS = 20000;

  function create(options) {
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;
    const now = options.now || (() => new Date());
    const createRunId = options.createRunId || (() => {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return global.crypto.randomUUID();
      }
      return `1688-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    });

    let activeRun = null;

    function storageGet(key) {
      return new Promise((resolve) => {
        chromeApi.storage.local.get(key, (result) => resolve(result?.[key] || null));
      });
    }

    function storageSet(value) {
      return new Promise((resolve) => {
        chromeApi.storage.local.set({ [STATUS_KEY]: value }, resolve);
      });
    }

    function getTab(tabId) {
      return new Promise((resolve) => {
        chromeApi.tabs.get(tabId, (tab) => {
          if (chromeApi.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(tab || null);
        });
      });
    }

    function createTab() {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.create({ url: "about:blank", active: false }, (tab) => {
          const error = chromeApi.runtime.lastError;
          if (error || !tab?.id) {
            reject(new Error(error?.message || "1688 수집 탭을 열 수 없습니다."));
            return;
          }
          resolve(tab);
        });
      });
    }

    function updateTab(tabId, updateProperties) {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.update(tabId, updateProperties, (tab) => {
          const error = chromeApi.runtime.lastError;
          if (error || !tab) {
            reject(new Error(error?.message || "1688 수집 탭을 이동할 수 없습니다."));
            return;
          }
          resolve(tab);
        });
      });
    }

    function removeTab(tabId) {
      if (!tabId) return Promise.resolve();
      return new Promise((resolve) => {
        chromeApi.tabs.remove(tabId, () => {
          void chromeApi.runtime.lastError;
          resolve();
        });
      });
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isVerificationUrl(value) {
      try {
        const url = new URL(value || "");
        return url.pathname.indexOf("/punish") !== -1 ||
          url.searchParams.get("action") === "captcha";
      } catch (e) {
        return false;
      }
    }

    async function waitForNavigation(tabId) {
      const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
      let lastTab = null;
      while (Date.now() < deadline) {
        const tab = await getTab(tabId);
        if (!tab) throw new Error("1688 수집 탭이 닫혔습니다.");
        lastTab = tab;
        if (isVerificationUrl(tab.url)) return tab;
        if (tab.status === "complete") return tab;
        await delay(250);
      }
      return lastTab;
    }

    function sendTabMessage(tabId, message) {
      return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ ok: false, error: "1688 검색 결과 추출 시간 초과" });
        }, EXTRACTION_TIMEOUT_MS);

        chromeApi.tabs.sendMessage(tabId, message, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const error = chromeApi.runtime.lastError;
          if (error) {
            resolve({ ok: false, error: error.message || "content_script_unavailable" });
            return;
          }
          resolve(response || { ok: false, error: "empty_extraction_response" });
        });
      });
    }

    async function extractFromTab(tabId, maxResults) {
      const message = { type: "TRIGGER_1688_TREND_EXTRACT", maxResults };
      let response = await sendTabMessage(tabId, message);
      if (response.ok || response.status === "verification_required") return response;

      const missingContentScript = /(?:content_script_unavailable|empty_extraction_response|receiving end|could not establish|message port)/i
        .test(response.error || "");
      if (!missingContentScript) return response;

      const injected = await ensureContentScripts(tabId);
      if (!injected) return response;
      response = await sendTabMessage(tabId, message);
      return response;
    }

    async function setStatus(run, patch) {
      if (run.cancelRequested && patch.status !== "cancelled") return run.status;
      run.status = {
        ...run.status,
        ...patch,
        runId: run.runId,
        updatedAt: now().toISOString(),
      };
      await storageSet(run.status);
      return run.status;
    }

    async function markVerificationRequired(run, tab, keyword) {
      run.keepTabOpen = true;
      const verificationUrl = tab?.url || `${SEARCH_ORIGIN}/punish?action=captcha`;
      try {
        await updateTab(run.tabId, { active: true });
      } catch (e) {
        // The status is still useful if Chrome cannot focus the tab.
      }
      await setStatus(run, {
        status: "verification_required",
        currentKeyword: keyword,
        verificationUrl,
        error: "1688 검색 결과가 슬라이더 검증을 요구합니다.",
        tabId: run.tabId,
      });
    }

    async function postBatch(run, keywords, errors) {
      const config = run.backendConfig;
      const response = await fetch(`${config.base}/trend/1688-results`, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify({ runId: run.runId, keywords, errors }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      return response.json().catch(() => ({}));
    }

    async function executeRun(run) {
      const keywordResults = [];
      const errors = [];
      try {
        let tab = run.reusableTabId ? await getTab(run.reusableTabId) : null;
        if (!tab) tab = await createTab();
        run.tabId = tab.id;
        await setStatus(run, { tabId: run.tabId });

        for (let index = 0; index < run.keywords.length; index++) {
          if (run.cancelRequested) return;
          const keyword = run.keywords[index];
          await setStatus(run, {
            status: "running",
            currentKeyword: keyword,
            currentKeywordIndex: index,
            totalKeywords: run.keywords.length,
            collected: keywordResults.reduce((sum, entry) => sum + entry.items.length, 0),
            error: null,
            verificationUrl: null,
          });

          try {
            const searchUrl = `${SEARCH_ORIGIN}/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&charset=utf8`;
            await updateTab(run.tabId, { url: searchUrl, active: false });
            tab = await waitForNavigation(run.tabId);
            if (isVerificationUrl(tab?.url)) {
              await markVerificationRequired(run, tab, keyword);
              return;
            }

            const extracted = await extractFromTab(run.tabId, run.maxResultsPerKeyword);
            if (extracted.status === "verification_required") {
              tab = await getTab(run.tabId);
              await markVerificationRequired(
                run,
                { url: extracted.verificationUrl || tab?.url },
                keyword
              );
              return;
            }
            if (!extracted.ok) {
              errors.push({ keyword, message: extracted.error || "1688 검색 결과 추출 실패" });
              keywordResults.push({ keyword, items: [] });
              continue;
            }

            keywordResults.push({
              keyword,
              items: Array.isArray(extracted.items)
                ? extracted.items.slice(0, run.maxResultsPerKeyword)
                : [],
            });
          } catch (error) {
            errors.push({ keyword, message: error?.message || String(error) });
            keywordResults.push({ keyword, items: [] });
          }
        }

        if (run.cancelRequested) return;
        const localCollected = keywordResults.reduce(
          (sum, entry) => sum + entry.items.length,
          0
        );
        await setStatus(run, {
          status: "running",
          currentKeyword: null,
          currentKeywordIndex: run.keywords.length,
          collected: localCollected,
        });
        const result = await postBatch(run, keywordResults, errors);
        if (run.cancelRequested) return;
        const backendCollected = Number(result?.collected);
        await setStatus(run, {
          status: "completed",
          collected: Number.isFinite(backendCollected) ? backendCollected : localCollected,
          businessDate: typeof result?.businessDate === "string" ? result.businessDate : null,
          errors,
          completedAt: now().toISOString(),
          currentKeyword: null,
          error: null,
          tabId: null,
        });
      } catch (error) {
        if (!run.cancelRequested) {
          await setStatus(run, {
            status: "failed",
            error: error?.message || String(error),
            errors,
            completedAt: now().toISOString(),
            tabId: null,
          });
        }
      } finally {
        if (!run.keepTabOpen) await removeTab(run.tabId);
        if (activeRun === run) activeRun = null;
      }
    }

    async function start(keywords, maxResultsPerKeyword) {
      if (activeRun && activeRun.status.status === "running") {
        return {
          success: false,
          error: "collection_in_progress",
          runId: activeRun.runId,
        };
      }

      const backendConfig = await getBackendRequestConfig();
      if (!backendConfig.ok) {
        return {
          success: false,
          error: backendConfig.error || "KidItem 웹 앱에서 로그인 후 다시 시도해주세요.",
        };
      }

      const previous = await storageGet(STATUS_KEY);
      const runId = createRunId();
      const startedAt = now().toISOString();
      const run = {
        runId,
        keywords,
        maxResultsPerKeyword,
        backendConfig,
        reusableTabId: previous?.status === "verification_required" ? previous.tabId : null,
        tabId: null,
        cancelRequested: false,
        keepTabOpen: false,
        status: {
          runId,
          status: "running",
          collected: 0,
          businessDate: null,
          error: null,
          verificationUrl: null,
          currentKeyword: null,
          currentKeywordIndex: 0,
          totalKeywords: keywords.length,
          errors: [],
          startedAt,
          updatedAt: startedAt,
          completedAt: null,
          tabId: null,
        },
      };
      activeRun = run;
      await storageSet(run.status);
      Promise.resolve().then(() => executeRun(run));
      return { success: true, runId, status: "running" };
    }

    async function getStatus(runId) {
      const status = activeRun?.status || await storageGet(STATUS_KEY);
      if (!status) return { success: false, error: "collection_not_found" };
      if (runId && status.runId !== runId) {
        return { success: false, error: "run_not_found", runId };
      }
      const { tabId, ...publicStatus } = status;
      return { success: true, ...publicStatus };
    }

    async function cancel(runId) {
      const stored = activeRun?.status || await storageGet(STATUS_KEY);
      if (!stored) return { success: false, error: "collection_not_found" };
      if (runId && stored.runId !== runId) {
        return { success: false, error: "run_not_found", runId };
      }

      if (activeRun) {
        activeRun.cancelRequested = true;
        activeRun.keepTabOpen = false;
        await setStatus(activeRun, {
          status: "cancelled",
          error: null,
          completedAt: now().toISOString(),
          tabId: null,
        });
        await removeTab(activeRun.tabId);
        return { success: true, runId: activeRun.runId, status: "cancelled" };
      }

      const cancelled = {
        ...stored,
        status: "cancelled",
        error: null,
        completedAt: now().toISOString(),
        updatedAt: now().toISOString(),
        tabId: null,
      };
      await storageSet(cancelled);
      await removeTab(stored.tabId);
      return { success: true, runId: stored.runId, status: "cancelled" };
    }

    return { start, getStatus, cancel, isVerificationUrl };
  }

  global.ProductScraper1688Trend = { create };
})(globalThis);
