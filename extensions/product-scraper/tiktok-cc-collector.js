// TikTok Creative Center trend collector (service-worker side).
//
// ⚠️ UNVERIFIED against the live, bot/region-gated TikTok Creative Center. The
// navigation URLs, keyword-page query params, and login/region-block detection
// are best-effort and were NOT confirmed against real Creative Center behavior.
// The `creative_radar_api` response shapes are normalized in
// tiktok-cc-extractor.js (see its header). An operator MUST load the extension,
// run a collection, and confirm/repair both the navigation targets here and the
// field mapping in the extractor against real captured responses before relying
// on the output.
//
// Mirrors ProductScraper1688Trend.create(...) lifecycle exactly (start / restart
// / getStatus / cancel) so background.js can wire it identically. Unlike the
// 1688 collector, keyword targets are fetched from the backend
// (GET /trend/tiktok-cc-targets) and results POST to /trend/tiktok-cc-results.
//
// See [[reference_market_trend_research_tools]] for the sourcing trend context.
(function (global) {
  "use strict";

  const STATUS_KEY = "kiditem_tiktok_cc_collection_status";
  const NAVIGATION_TIMEOUT_MS = 35_000;
  const EXTRACTION_TIMEOUT_MS = 25_000;
  const MAX_ITEMS_DEFAULT = 500;
  const MAX_TARGETS = 50;

  // Creative Center Trends pages (english locale). Region is selected in-page and
  // read back from the captured API country_info, not from these URLs.
  const BASE_URLS = {
    hashtag: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
    product: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en",
    keyword: "https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en",
  };

  function create(options) {
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;
    const sessions = options.sessions;
    const now = options.now || (() => new Date());
    const createRunId = options.createRunId || (() => {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return global.crypto.randomUUID();
      }
      return `tiktok-cc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    });

    let activeRun = null;
    const runsById = new Map();

    function storageGet(key) {
      return new Promise((resolve) => {
        chromeApi.storage.local.get(key, (result) => resolve(result && result[key] ? result[key] : null));
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
          if (error || !tab || !tab.id) {
            reject(new Error((error && error.message) || "TikTok 수집 탭을 열 수 없습니다."));
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
            reject(new Error((error && error.message) || "TikTok 수집 탭을 이동할 수 없습니다."));
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

    function isBlockedUrl(value) {
      try {
        const url = new URL(value || "");
        return /(?:\/login|\/passport|\/signup)/i.test(url.pathname);
      } catch (e) {
        return false;
      }
    }

    async function waitForNavigation(tabId) {
      const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
      let lastTab = null;
      while (Date.now() < deadline) {
        const tab = await getTab(tabId);
        if (!tab) throw new Error("TikTok 수집 탭이 닫혔습니다.");
        lastTab = tab;
        if (isBlockedUrl(tab.url)) return tab;
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
          resolve({ ok: false, error: "TikTok 트렌드 추출 시간 초과" });
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

    async function extractFromTab(tabId, target, defaultRegion) {
      const message = {
        type: "TRIGGER_TIKTOK_CC_EXTRACT",
        trendType: target.trendType,
        sourceKeyword: target.sourceKeyword || null,
        defaultRegion: defaultRegion || null,
      };
      let response = await sendTabMessage(tabId, message);
      if (response.ok) return response;

      const missingContentScript = /(?:content_script_unavailable|tiktok_cc_extractor_unavailable|empty_extraction_response|receiving end|could not establish|message port)/i
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

    async function fetchTargets(config) {
      const request = config.request || fetch;
      const response = await request(`${config.base}/trend/tiktok-cc-targets`, {
        method: "GET",
        headers: config.headers,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = await response.json().catch(() => ({}));
      const raw = Array.isArray(data && data.targets) ? data.targets : [];
      const targets = [];
      for (const entry of raw) {
        const keyword = entry && typeof entry.keyword === "string" ? entry.keyword.trim() : "";
        if (!keyword) continue;
        const label = entry && typeof entry.label === "string" && entry.label.trim()
          ? entry.label.trim()
          : keyword;
        targets.push({ label: label.slice(0, 200), keyword: keyword.slice(0, 100) });
        if (targets.length >= MAX_TARGETS) break;
      }
      return targets;
    }

    function keywordUrl(keyword) {
      return `${BASE_URLS.keyword}?keyword=${encodeURIComponent(keyword)}`;
    }

    function buildCollectionTargets(targets) {
      const list = [
        { id: "hashtag", trendType: "hashtag", url: BASE_URLS.hashtag, sourceKeyword: null },
        { id: "product", trendType: "product", url: BASE_URLS.product, sourceKeyword: null },
      ];
      for (const target of targets) {
        list.push({
          id: `keyword:${target.keyword}`,
          trendType: "keyword",
          url: keywordUrl(target.keyword),
          sourceKeyword: target.keyword,
        });
      }
      return list;
    }

    function sanitizeRegion(value) {
      if (typeof value !== "string") return null;
      const cleaned = value.replace(/[^A-Za-z]/g, "").toUpperCase();
      return cleaned.length >= 2 && cleaned.length <= 8 ? cleaned : null;
    }

    async function postBatch(run, region, items, errors) {
      const config = run.backendConfig;
      const request = config.request || fetch;
      const body = { runId: run.runId, region, items };
      if (errors && errors.length) body.errors = errors;
      const response = await request(`${config.base}/trend/tiktok-cc-results`, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      return response.json().catch(() => ({}));
    }

    async function executeRun(run) {
      const items = [];
      const errors = [];
      const seen = new Set();
      let region = run.regionOverride || null;
      try {
        let tab = run.reusableTabId ? await getTab(run.reusableTabId) : null;
        if (!tab) tab = await createTab();
        run.tabId = tab.id;
        await setStatus(run, { tabId: run.tabId });
        if (Number.isInteger(tab.windowId)) {
          await sessions.attachTab(run.runId, {
            tabId: tab.id,
            windowId: tab.windowId,
          });
        }

        for (let index = 0; index < run.targets.length; index++) {
          if (run.cancelRequested) return;
          const target = run.targets[index];
          await setStatus(run, {
            status: "running",
            currentTarget: target.id,
            currentTargetIndex: index,
            totalTargets: run.targets.length,
            collected: items.length,
            region,
            error: null,
          });
          await sessions.progress(run.runId, {
            current: index,
            total: run.targets.length,
            completed: index - errors.length,
            failed: errors.length,
            label: `${index + 1}/${run.targets.length} 타깃 수집 중`,
          });

          try {
            await updateTab(run.tabId, { url: target.url, active: false });
            tab = await waitForNavigation(run.tabId);
            if (isBlockedUrl(tab && tab.url)) {
              errors.push({ target: target.id, message: "TikTok 로그인 또는 지역 차단으로 수집할 수 없습니다." });
              continue;
            }

            const extracted = await extractFromTab(run.tabId, target, region || run.regionOverride);
            if (!extracted.ok) {
              errors.push({ target: target.id, message: extracted.error || "TikTok 트렌드 추출 실패" });
              continue;
            }
            if (!region && extracted.region) region = sanitizeRegion(extracted.region);

            const extractedItems = Array.isArray(extracted.items) ? extracted.items : [];
            for (const item of extractedItems) {
              if (!item || !item.trendType || !item.entityKey) continue;
              const key = `${item.trendType}::${item.entityKey}`;
              if (seen.has(key)) continue;
              seen.add(key);
              items.push(item);
              if (items.length >= run.maxItems) break;
            }
          } catch (error) {
            errors.push({ target: target.id, message: (error && error.message) || String(error) });
          }
          if (items.length >= run.maxItems) break;
        }

        if (run.cancelRequested) return;
        const finalRegion = region || "US";
        const cappedItems = items.slice(0, run.maxItems);
        await setStatus(run, {
          status: "running",
          currentTarget: null,
          currentTargetIndex: run.targets.length,
          collected: cappedItems.length,
          region: finalRegion,
        });
        await sessions.progress(run.runId, {
          current: run.targets.length,
          total: run.targets.length,
          completed: run.targets.length - errors.length,
          failed: errors.length,
          label: "TikTok 수집 결과 저장 중",
        });

        const result = await postBatch(run, finalRegion, cappedItems, errors);
        if (run.cancelRequested) return;
        const backendCollected = Number(result && result.collected);
        await setStatus(run, {
          status: "completed",
          collected: Number.isFinite(backendCollected) ? backendCollected : cappedItems.length,
          region: finalRegion,
          businessDate: result && typeof result.businessDate === "string" ? result.businessDate : null,
          errors,
          completedAt: now().toISOString(),
          currentTarget: null,
          error: null,
          tabId: null,
        });
        await sessions.succeed(run.runId);
      } catch (error) {
        if (!run.cancelRequested) {
          await setStatus(run, {
            status: "failed",
            error: (error && error.message) || String(error),
            errors,
            completedAt: now().toISOString(),
            tabId: null,
          });
          await sessions.fail(run.runId);
        }
      } finally {
        if (!run.keepTabOpen) await removeTab(run.tabId);
        if (!run.keepTabOpen) runsById.delete(run.runId);
        if (activeRun === run) activeRun = null;
      }
    }

    function clampMaxItems(value) {
      if (!Number.isInteger(value)) return MAX_ITEMS_DEFAULT;
      return Math.max(1, Math.min(MAX_ITEMS_DEFAULT, value));
    }

    async function start(startOptions) {
      const opts = startOptions || {};
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

      let targets;
      try {
        targets = await fetchTargets(backendConfig);
      } catch (error) {
        return {
          success: false,
          error: (error && error.message) || "TikTok 타깃을 불러오지 못했습니다.",
        };
      }

      const maxItems = clampMaxItems(opts.maxItems);
      const regionOverride = sanitizeRegion(opts.region);
      const collectionTargets = buildCollectionTargets(targets);

      const runId = createRunId();
      const startedAt = now().toISOString();
      const run = {
        runId,
        targets: collectionTargets,
        maxItems,
        regionOverride,
        backendConfig,
        reusableTabId: null,
        tabId: null,
        cancelRequested: false,
        keepTabOpen: false,
        status: {
          runId,
          status: "running",
          collected: 0,
          region: regionOverride || null,
          businessDate: null,
          error: null,
          currentTarget: null,
          currentTargetIndex: 0,
          totalTargets: collectionTargets.length,
          errors: [],
          startedAt,
          updatedAt: startedAt,
          completedAt: null,
          tabId: null,
        },
      };
      activeRun = run;
      runsById.set(runId, run);
      await sessions.start({
        runId,
        producer: "sourcing.tiktok_cc_trend",
        classification: "background_preferred",
        restartStrategy: "extension",
        inputIdentity: {
          targetCount: targets.length,
          maxItems,
        },
      });
      await storageSet(run.status);
      Promise.resolve().then(() => executeRun(run));
      return { success: true, runId, status: "running" };
    }

    async function getStatus(runId) {
      const status = (activeRun && activeRun.status) || await storageGet(STATUS_KEY);
      if (!status) return { success: false, error: "collection_not_found" };
      if (runId && status.runId !== runId) {
        return { success: false, error: "run_not_found", runId };
      }
      const { tabId, ...publicStatus } = status;
      return { success: true, ...publicStatus };
    }

    async function cancel(runId) {
      const stored = (activeRun && activeRun.status) || await storageGet(STATUS_KEY);
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
        await sessions.cancel(activeRun.runId);
        await removeTab(activeRun.tabId);
        runsById.delete(activeRun.runId);
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
      await sessions.cancel(stored.runId);
      await removeTab(stored.tabId);
      return { success: true, runId: stored.runId, status: "cancelled" };
    }

    async function restart(runId) {
      if (activeRun && activeRun.status.status === "running") {
        return {
          success: false,
          error: "collection_in_progress",
          runId: activeRun.runId,
        };
      }
      const run = runsById.get(runId);
      const session = await sessions.get(runId);
      if (!run || !session) throw new Error("Collection session not found");
      if (session.restartStrategy !== "extension") {
        throw new Error("Collection session requires a web restart");
      }

      await sessions.restart(runId);
      run.cancelRequested = false;
      run.keepTabOpen = false;
      run.reusableTabId = run.tabId;
      const restartedAt = now().toISOString();
      run.status = {
        ...run.status,
        status: "running",
        collected: 0,
        region: run.regionOverride || null,
        businessDate: null,
        error: null,
        currentTarget: null,
        currentTargetIndex: 0,
        totalTargets: run.targets.length,
        errors: [],
        startedAt: restartedAt,
        updatedAt: restartedAt,
        completedAt: null,
      };
      activeRun = run;
      await storageSet(run.status);
      Promise.resolve().then(() => executeRun(run));
      return { success: true, runId, status: "running" };
    }

    return { start, restart, getStatus, cancel, isBlockedUrl };
  }

  global.ProductScraperTiktokCcTrend = { create, BASE_URLS };
})(globalThis);
