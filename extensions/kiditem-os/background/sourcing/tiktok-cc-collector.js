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
// The Sourcing owner issues the attempt identity and frozen target plan. This
// collector only transports browser evidence through that fenced attempt.
//
// See [[reference_market_trend_research_tools]] for the sourcing trend context.
(function (global) {
  "use strict";

  const PRODUCER = "sourcing.tiktok_cc_trend";
  const REQUEST_KEY = "kiditem_tiktok_cc_request_v1";
  const SOURCE_PATH = "/sourcing/tiktok-creative/attempts";
  const SOURCE_KEY = "tiktok.creative";
  const NAVIGATION_TIMEOUT_MS = 35_000;
  const EXTRACTION_TIMEOUT_MS = 25_000;
  const MAX_ITEMS_DEFAULT = 100;
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
    const activeRuns = new Map();
    const wire = global.KidItemSourcingAttemptWire.create({
      chrome: chromeApi, sourcePath: SOURCE_PATH,
      requestFailureMessage: "TikTok source owner request failed",
    });
    const requestJson = wire.requestJson;
    const storageGet = wire.getCorrelation;
    const failureFrom = wire.failure;

    function ownerError(code, message, status = null) {
      const error = new Error(message);
      error.code = code;
      if (status !== null) error.status = status;
      return error;
    }

    function requiredText(value, code, max = 300) {
      if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
        throw ownerError(code, code);
      }
      return value.trim();
    }


    function requestStorageKey(environmentId) {
      return `${REQUEST_KEY}:${environmentId}`;
    }

    async function persistRequestIdentity(environmentId, attemptId, input) {
      const correlation = {
        attemptId,
        idempotencyKey: input.idempotencyKey,
      };
      if (input.maxItems !== undefined) correlation.maxItems = input.maxItems;
      if (input.region !== undefined) correlation.region = input.region;
      await wire.setCorrelation(requestStorageKey(environmentId), correlation);
    }

    async function clearRequestIdentity(environmentId, attemptId) {
      const key = requestStorageKey(environmentId);
      const current = await storageGet(key);
      if (current?.attemptId !== attemptId) return;
      await wire.clearCorrelation(key);
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

    function isRecord(value) {
      return value && typeof value === "object" && !Array.isArray(value);
    }

    function isTerminalState(value) {
      return value === "COMPLETE" || value === "FAILED";
    }

    function sourcePlanFrom(value) {
      if (!isRecord(value)) {
        throw ownerError("INVALID_TIKTOK_SOURCE_PLAN", "Sourcing owner returned an invalid TikTok plan.");
      }
      const state = requiredText(value.state, "INVALID_TIKTOK_SOURCE_PLAN", 20);
      const attemptId = requiredText(value.attemptId, "INVALID_TIKTOK_SOURCE_PLAN");
      const expiresAt = requiredText(value.expiresAt, "INVALID_TIKTOK_SOURCE_PLAN");
      const rawPlan = value.plan;
      if (
        !["RUNNING", "COMPLETE", "FAILED"].includes(state)
        || !Number.isFinite(Date.parse(expiresAt))
        || !isRecord(rawPlan)
        || rawPlan.source !== SOURCE_KEY
        || !Array.isArray(rawPlan.targetSeeds)
        || rawPlan.targetSeeds.length > MAX_TARGETS
        || !Number.isInteger(rawPlan.maxItems)
        || rawPlan.maxItems < 1
        || rawPlan.maxItems > MAX_ITEMS_DEFAULT
        || (
          rawPlan.regionOverride !== null
          && (
            typeof rawPlan.regionOverride !== "string"
            || !/^[A-Z]{2,8}$/.test(rawPlan.regionOverride)
          )
        )
      ) {
        throw ownerError("INVALID_TIKTOK_SOURCE_PLAN", "Sourcing owner returned an invalid TikTok plan.");
      }
      const targetSeeds = rawPlan.targetSeeds.map((entry) => {
        if (
          !isRecord(entry)
          || typeof entry.label !== "string"
          || !entry.label
          || entry.label.length > 200
          || typeof entry.keyword !== "string"
          || !entry.keyword
          || entry.keyword.length > 100
        ) {
          throw ownerError("INVALID_TIKTOK_SOURCE_PLAN", "Sourcing owner returned an invalid TikTok plan.");
        }
        return { label: entry.label, keyword: entry.keyword };
      });
      const attemptToken = typeof value.attemptToken === "string" && value.attemptToken.trim()
        ? value.attemptToken.trim()
        : null;
      if (state === "RUNNING" && !attemptToken) {
        throw ownerError("INVALID_TIKTOK_SOURCE_PLAN", "Sourcing owner returned an invalid TikTok plan.");
      }
      return {
        attemptId,
        attemptToken,
        state,
        expiresAt,
        plan: {
          source: SOURCE_KEY,
          targetSeeds,
          maxItems: rawPlan.maxItems,
          regionOverride: rawPlan.regionOverride,
        },
        acceptedCount: Number.isFinite(value.acceptedCount) ? value.acceptedCount : null,
        errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
        errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
      };
    }

    function terminalResult(plan, fallbackCollected = null) {
      if (plan.state === "COMPLETE") {
        return {
          success: true,
          attemptId: plan.attemptId,
          terminalState: "COMPLETE",
          ...(Number.isFinite(plan.acceptedCount) || Number.isFinite(fallbackCollected)
            ? { collected: Number.isFinite(plan.acceptedCount) ? plan.acceptedCount : fallbackCollected }
            : {}),
        };
      }
      return {
        success: false,
        attemptId: plan.attemptId,
        terminalState: "FAILED",
        retryRequired: true,
        errorCode: plan.errorCode || "SOURCE_RETRY_REQUIRED",
        error: plan.errorMessage || "The previous TikTok collection failed. Start a new retry from KidItem.",
      };
    }


    async function begin(config, environmentId, input) {
      const body = {};
      if (input.maxItems !== undefined) body.maxItems = input.maxItems;
      if (input.region !== undefined) body.region = input.region;
      const plan = sourcePlanFrom(await requestJson(config, SOURCE_PATH, {
        method: "POST",
        headers: {
          ...config.headers,
          "Idempotency-Key": requiredText(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY"),
        },
        body: JSON.stringify(body),
      }));
      if (plan.state === "RUNNING") {
        await sessions.start({
          attemptId: plan.attemptId,
          environmentId,
          producer: PRODUCER,
        });
        await persistRequestIdentity(environmentId, plan.attemptId, input);
      }
      return plan;
    }

    function terminalSubmit(config, plan, body) {
      return wire.terminal(config, plan, { method: "PUT", suffix: "", body }, sourcePlanFrom);
    }

    async function terminalFail(config, plan, error) {
      const failure = failureFrom(error, "SOURCE_COLLECTION_FAILED", "TikTok collection failed.");
      const terminal = await wire.terminal(config, plan, {
        method: "POST",
        suffix: "/fail",
        body: failure,
      }, sourcePlanFrom);
      return { failure, terminal };
    }

    async function clearTerminalAttempt(environmentId, attemptId, tabId) {
      try {
        await removeTab(tabId);
      } finally {
        await sessions.remove(attemptId);
        await clearRequestIdentity(environmentId, attemptId);
      }
    }

    async function execute(run) {
      const items = [];
      const errors = [];
      const visitedTargetIds = [];
      const seen = new Set();
      let region = run.plan.plan.regionOverride || null;
      try {
        let tab = await createTab();
        run.tabId = tab.id;
        if (Number.isInteger(tab.windowId)) {
          await sessions.attachTab(run.plan.attemptId, {
            tabId: tab.id,
            windowId: tab.windowId,
            closeOnCancel: true,
          });
        }

        for (let index = 0; index < run.targets.length; index++) {
          if (run.cancelRequested) return run.terminalResult;
          const target = run.targets[index];
          visitedTargetIds.push(target.id);
          await sessions.progress(run.plan.attemptId, {
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

            const extracted = await extractFromTab(run.tabId, target, region || run.plan.plan.regionOverride);
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

        if (run.cancelRequested) return run.terminalResult;
        const finalRegion = region || "US";
        const cappedItems = items.slice(0, run.maxItems);
        await sessions.progress(run.plan.attemptId, {
          current: run.targets.length,
          total: run.targets.length,
          completed: run.targets.length - errors.length,
          failed: errors.length,
          label: "TikTok 수집 결과 저장 중",
        });

        const body = { region: finalRegion, items: cappedItems, visitedTargetIds };
        if (errors.length) body.errors = errors;
        const terminal = await terminalSubmit(run.config, run.plan, body);
        if (!isTerminalState(terminal.state)) {
          throw ownerError("INVALID_TIKTOK_TERMINAL", "TikTok owner did not terminalize the collection.");
        }
        const terminalTabId = run.tabId;
        run.tabId = null;
        await clearTerminalAttempt(run.environmentId, run.plan.attemptId, terminalTabId);
        return terminalResult(terminal, cappedItems.length);
      } catch (error) {
        if (run.cancelRequested && run.terminalResult) return run.terminalResult;
        const failure = failureFrom(error, "SOURCE_COLLECTION_FAILED", "TikTok collection failed.");
        try {
          const terminal = await terminalFail(run.config, run.plan, error);
          const terminalTabId = run.tabId;
          run.tabId = null;
          await clearTerminalAttempt(run.environmentId, run.plan.attemptId, terminalTabId);
          return terminalResult(terminal.terminal);
        } catch {
          return {
            success: false,
            attemptId: run.plan.attemptId,
            terminalState: "RUNNING",
            errorCode: failure.code,
            error: failure.message,
          };
        }
      } finally {
        await removeTab(run.tabId);
      }
    }

    async function resumeOrBegin(config, environmentId, input) {
      const sessionsForEnvironment = (await sessions.list(environmentId))
        .filter((session) => session?.producer === PRODUCER);
      if (sessionsForEnvironment.length > 1) {
        throw ownerError("SOURCE_ATTEMPT_CORRELATION_CONFLICT", "More than one TikTok collection attempt is stored for this environment.");
      }
      const existing = sessionsForEnvironment[0];
      if (!existing) return begin(config, environmentId, input);

      const correlation = await storageGet(requestStorageKey(environmentId));
      if (
        !correlation
        || correlation.attemptId !== existing.attemptId
        || typeof correlation.idempotencyKey !== "string"
        || !correlation.idempotencyKey.trim()
      ) {
        return null;
      }
      return begin(config, environmentId, correlation);
    }

    function launch(environmentId, work) {
      const active = { execution: null, run: null };
      active.execution = Promise.resolve()
        .then(() => work(active))
        .finally(() => {
          if (activeRuns.get(environmentId) === active) activeRuns.delete(environmentId);
        });
      activeRuns.set(environmentId, active);
      return active.execution;
    }

    async function run(input) {
      const environmentId = requiredText(input?.environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const active = activeRuns.get(environmentId);
      if (active) return active.execution;
      return launch(environmentId, async (running) => {
        const config = await getBackendRequestConfig(environmentId);
        if (!config?.ok) {
          return {
            success: false,
            terminalState: "RUNNING",
            error: config?.error || "KidItem 웹 앱에서 로그인 후 다시 시도해주세요.",
          };
        }
        const idempotencyKey = requiredText(input?.idempotencyKey, "INVALID_IDEMPOTENCY_KEY");
        const plan = await resumeOrBegin(config, environmentId, {
          idempotencyKey,
          maxItems: input?.maxItems,
          region: input?.region,
        });
        if (!plan) {
          return {
            success: false,
            terminalState: "RUNNING",
            errorCode: "SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING",
            error: "TikTok collection is still running and can only be retried after its fixed expiry.",
          };
        }
        if (plan.state !== "RUNNING") {
          await clearTerminalAttempt(environmentId, plan.attemptId, null);
          return terminalResult(plan);
        }
        const collectorRun = {
          config,
          environmentId,
          plan,
          targets: buildCollectionTargets(plan.plan.targetSeeds),
          maxItems: plan.plan.maxItems,
          tabId: null,
          cancelRequested: false,
          terminalResult: null,
        };
        running.run = collectorRun;
        return execute(collectorRun);
      });
    }

    async function cancel(attemptId, environmentId) {
      const normalizedAttemptId = requiredText(attemptId, "INVALID_TIKTOK_SOURCE_ATTEMPT");
      const normalizedEnvironmentId = requiredText(environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const session = await sessions.getOwned(normalizedAttemptId, normalizedEnvironmentId);
      if (!session || session.producer !== PRODUCER) {
        return { success: true, cancelled: false, attemptId: normalizedAttemptId };
      }
      const running = activeRuns.get(normalizedEnvironmentId);
      const collectorRun = running?.run || null;
      let plan = collectorRun?.plan || null;
      let config = collectorRun?.config || null;
      if (!plan || !config) {
        config = await getBackendRequestConfig(normalizedEnvironmentId);
        if (!config?.ok) {
          throw ownerError("SOURCE_OWNER_REQUEST_FAILED", config?.error || "TikTok owner is unavailable.");
        }
        const correlation = await storageGet(requestStorageKey(normalizedEnvironmentId));
        if (correlation?.attemptId !== normalizedAttemptId || typeof correlation.idempotencyKey !== "string") {
          throw ownerError("SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING", "TikTok attempt cannot be cancelled without its request identity.");
        }
        plan = await begin(config, normalizedEnvironmentId, correlation);
      }
      if (plan.state !== "RUNNING") {
        const terminalTabId = collectorRun?.tabId ?? null;
        if (collectorRun) collectorRun.tabId = null;
        await clearTerminalAttempt(normalizedEnvironmentId, normalizedAttemptId, terminalTabId);
        return { success: true, cancelled: false, attemptId: normalizedAttemptId };
      }
      if (collectorRun) collectorRun.cancelRequested = true;
      const terminal = await terminalFail(
        config,
        plan,
        ownerError("COLLECTION_CANCELLED", "TikTok collection was cancelled by the user."),
      );
      const result = terminalResult(terminal.terminal);
      if (collectorRun) collectorRun.terminalResult = result;
      const terminalTabId = collectorRun?.tabId ?? null;
      if (collectorRun) collectorRun.tabId = null;
      await clearTerminalAttempt(normalizedEnvironmentId, normalizedAttemptId, terminalTabId);
      return { success: true, cancelled: true, attemptId: normalizedAttemptId };
    }

    async function recover(environmentId) {
      const normalizedEnvironmentId = requiredText(environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const active = activeRuns.get(normalizedEnvironmentId);
      if (active) return active.execution;
      const activeSession = (await sessions.list(normalizedEnvironmentId))
        .find((session) => session?.producer === PRODUCER);
      if (!activeSession) return null;
      const correlation = await storageGet(requestStorageKey(normalizedEnvironmentId));
      if (!correlation?.idempotencyKey) return null;
      return run({ environmentId: normalizedEnvironmentId, ...correlation });
    }

    return Object.freeze({ cancel, recover, run, isBlockedUrl });
  }

  global.ProductScraperTiktokCcTrend = { create, BASE_URLS };
})(globalThis);
