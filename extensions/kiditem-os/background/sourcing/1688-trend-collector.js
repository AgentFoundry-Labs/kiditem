(function (global) {
  "use strict";

  const PRODUCER = "sourcing.1688_trend";
  const REQUEST_KEY = "kiditem_1688_trend_request_v1";
  const SOURCE_PATH = "/sourcing/1688-trends/attempts";
  const SOURCE_KEY = "1688.hot_product";
  const MAX_KEYWORDS = 20;
  const MAX_RESULTS_PER_KEYWORD = 20;
  const SEARCH_ORIGIN = "https://s.1688.com";
  const NAVIGATION_TIMEOUT_MS = 30000;
  const EXTRACTION_TIMEOUT_MS = 20000;

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


  function isTerminalState(value) {
    return value === "COMPLETE" || value === "FAILED";
  }

  function planFrom(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw ownerError("INVALID_1688_SOURCE_PLAN", "Sourcing owner returned an invalid 1688 plan.");
    }
    const state = requiredText(value.state, "INVALID_1688_SOURCE_PLAN", 20);
    const attemptToken = typeof value.attemptToken === "string" && value.attemptToken.trim()
      ? value.attemptToken.trim()
      : null;
    const plan = {
      attemptId: requiredText(value.attemptId, "INVALID_1688_SOURCE_PLAN"),
      attemptToken,
      state,
      expiresAt: requiredText(value.expiresAt, "INVALID_1688_SOURCE_PLAN"),
      plan: value.plan,
      errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
      errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
    };
    if (
      !["RUNNING", "COMPLETE", "FAILED"].includes(plan.state)
      || (plan.state === "RUNNING" && !plan.attemptToken)
      || !Number.isFinite(Date.parse(plan.expiresAt))
      || !plan.plan
      || typeof plan.plan !== "object"
      || Array.isArray(plan.plan)
      || plan.plan.source !== SOURCE_KEY
      || !Array.isArray(plan.plan.keywords)
      || plan.plan.keywords.length > MAX_KEYWORDS
    ) {
      throw ownerError("INVALID_1688_SOURCE_PLAN", "Sourcing owner returned an invalid 1688 plan.");
    }

    const identities = new Set();
    plan.keywords = plan.plan.keywords.map((value) => {
      const keyword = requiredText(value, "INVALID_1688_SOURCE_PLAN", 120);
      const identity = keyword.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
      if (identities.has(identity)) {
        throw ownerError("INVALID_1688_SOURCE_PLAN", "Sourcing owner returned duplicate 1688 keywords.");
      }
      identities.add(identity);
      return keyword;
    });
    return plan;
  }

  function terminalResult(plan) {
    if (plan.state === "COMPLETE") {
      return {
        success: true,
        attemptId: plan.attemptId,
        terminalState: "COMPLETE",
      };
    }
    return {
      success: false,
      attemptId: plan.attemptId,
      terminalState: "FAILED",
      retryRequired: true,
      errorCode: plan.errorCode || "SOURCE_RETRY_REQUIRED",
      error: plan.errorMessage || "The previous 1688 collection failed. Start a new retry from KidItem.",
    };
  }


  function create(options) {
    if (
      typeof options?.getBackendRequestConfig !== "function"
      || typeof options?.sessions?.start !== "function"
      || typeof options?.sessions?.remove !== "function"
    ) {
      throw new Error("1688 source-owner collector dependencies are required.");
    }
    const chromeApi = options.chrome;
    const getBackendRequestConfig = options.getBackendRequestConfig;
    const ensureContentScripts = options.ensureContentScripts;
    const sessions = options.sessions;
    const now = options.now || (() => new Date());
    const activeRuns = new Map();
    const wire = global.KidItemSourcingAttemptWire.create({
      chrome: chromeApi, sourcePath: SOURCE_PATH,
      requestFailureMessage: "1688 source owner request failed",
    });
    const requestJson = wire.requestJson;
    const storageGet = wire.getCorrelation;
    const failureFrom = wire.failure;

    function cancellationError() {
      return ownerError("COLLECTION_CANCELLED", "1688 collection was cancelled by the user.");
    }

    async function isAttemptActive(attemptId, environmentId) {
      if (typeof sessions.isActive !== "function") {
        throw ownerError(
          "COLLECTION_SESSION_API_UNAVAILABLE",
          "The collection session activity API is required.",
        );
      }
      try {
        return Boolean(await sessions.isActive(attemptId, environmentId, PRODUCER));
      } catch {
        return false;
      }
    }

    async function isRunActive(run) {
      if (!run || run.cancelRequested) return false;
      return isAttemptActive(run.plan.attemptId, run.environmentId);
    }

    async function requireRunActive(run) {
      if (!(await isRunActive(run))) throw cancellationError();
    }

    function cancellationPendingResult(run) {
      return {
        success: false,
        attemptId: run.plan.attemptId,
        terminalState: "RUNNING",
        errorCode: "COLLECTION_CANCELLED",
        error: "1688 collection cancellation is still being reconciled with the owner.",
      };
    }

    function requestStorageKey(environmentId) {
      return `${REQUEST_KEY}:${environmentId}`;
    }

    async function persistRequestIdentity(environmentId, attemptId, idempotencyKey) {
      await wire.setCorrelation(requestStorageKey(environmentId), { attemptId, idempotencyKey });
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
        return url.pathname.indexOf("/punish") !== -1 || url.searchParams.get("action") === "captcha";
      } catch {
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
        if (isVerificationUrl(tab.url) || tab.status === "complete") return tab;
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

    async function extractFromTab(tabId) {
      const message = { type: "TRIGGER_1688_TREND_EXTRACT", maxResults: MAX_RESULTS_PER_KEYWORD };
      let response = await sendTabMessage(tabId, message);
      if (response.ok || response.status === "verification_required") return response;
      const missingContentScript = /(?:content_script_unavailable|empty_extraction_response|receiving end|could not establish|message port)/i
        .test(response.error || "");
      if (!missingContentScript) return response;
      const injected = await ensureContentScripts(tabId);
      if (!injected) return response;
      return sendTabMessage(tabId, message);
    }

    // A begin replayed to resume a stored attempt continues only that attempt
    // while its lease holds. Any other running answer changes nothing local; the
    // attempt stays for its lease or an operator stop.
    function continuesAttempt(plan, expectedAttemptId) {
      return plan.attemptId === expectedAttemptId && Date.parse(plan.expiresAt) > now().getTime();
    }

    async function begin(config, environmentId, idempotencyKey, expectedAttemptId = null) {
      const plan = planFrom(await requestJson(config, SOURCE_PATH, {
        method: "POST",
        headers: {
          ...config.headers,
          "Idempotency-Key": requiredText(idempotencyKey, "INVALID_IDEMPOTENCY_KEY"),
        },
      }));
      if (expectedAttemptId && plan.state === "RUNNING" && !continuesAttempt(plan, expectedAttemptId)) {
        return { ...plan, continuable: false };
      }
      if (plan.state === "RUNNING") {
        await persistRequestIdentity(environmentId, plan.attemptId, idempotencyKey);
        try {
          await sessions.start({
            attemptId: plan.attemptId,
            environmentId,
            producer: PRODUCER,
          });
        } catch (error) {
          if (await isAttemptActive(plan.attemptId, environmentId)) throw error;
          try {
            return (await terminalFail(config, plan, cancellationError())).terminal;
          } catch {
            throw error;
          }
        }
      }
      return plan;
    }

    async function terminalSubmit(config, plan, body, run) {
      return planFrom(await wire.terminal(config, plan, {
        method: "PUT",
        suffix: "",
        body,
      }, planFrom, run ? {
        shouldContinue: () => isRunActive(run),
        cancelCode: "COLLECTION_CANCELLED",
        cancelMessage: "1688 collection was cancelled by the user.",
      } : undefined));
    }

    async function terminalFail(config, plan, error) {
      const failure = failureFrom(
        error,
        "SOURCE_COLLECTION_FAILED",
        "1688 collection failed.",
      );
      const terminal = planFrom(await wire.terminal(config, plan, {
        method: "POST",
        suffix: "/fail",
        body: failure,
      }));
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

    async function markVerificationRequired(run, tab, keyword) {
      await requireRunActive(run);
      run.keepTabOpen = true;
      await sessions.requireAttention(run.plan.attemptId, {
        reason: "captcha",
        message: "1688 검색 결과가 슬라이더 검증을 요구합니다. 알림에서 확인 탭을 열어 검증해주세요.",
      });
      return {
        success: false,
        attemptId: run.plan.attemptId,
        terminalState: "RUNNING",
        attentionRequired: true,
        errorCode: "CAPTCHA_REQUIRED",
        error: tab?.url || keyword,
      };
    }

    async function execute(run) {
      const keywordResults = [];
      const errors = [];
      try {
        await requireRunActive(run);
        if (run.plan.keywords.length === 0) {
          const terminal = await terminalSubmit(run.config, run.plan, {
            keywords: keywordResults,
            errors,
          }, run);
          await requireRunActive(run);
          await clearTerminalAttempt(run.environmentId, run.plan.attemptId, null);
          return terminalResult(terminal);
        }
        let tab = await createTab();
        try {
          await requireRunActive(run);
        } catch (error) {
          await removeTab(tab.id);
          throw error;
        }
        run.tabId = tab.id;
        const attached = await sessions.attachTab(run.plan.attemptId, {
          tabId: tab.id,
          windowId: tab.windowId,
          closeOnCancel: true,
        });
        if (attached === null || attached === false) throw cancellationError();
        await requireRunActive(run);

        for (let index = 0; index < run.plan.keywords.length; index += 1) {
          await requireRunActive(run);
          const keyword = run.plan.keywords[index];
          await sessions.progress(run.plan.attemptId, {
            current: index,
            total: run.plan.keywords.length,
            completed: keywordResults.length - errors.length,
            failed: errors.length,
            label: `${index + 1}/${run.plan.keywords.length} 키워드 수집 중`,
          });
          await requireRunActive(run);
          try {
            const searchUrl = `${SEARCH_ORIGIN}/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&charset=utf8`;
            await updateTab(run.tabId, { url: searchUrl, active: false });
            await requireRunActive(run);
            tab = await waitForNavigation(run.tabId);
            await requireRunActive(run);
            if (isVerificationUrl(tab?.url)) return markVerificationRequired(run, tab, keyword);

            const extracted = await extractFromTab(run.tabId);
            await requireRunActive(run);
            if (extracted.status === "verification_required") {
              return markVerificationRequired(run, { url: extracted.verificationUrl || tab?.url }, keyword);
            }
            if (!extracted.ok) {
              errors.push({ keyword, message: extracted.error || "1688 검색 결과 추출 실패" });
              keywordResults.push({ keyword, items: [] });
              continue;
            }
            keywordResults.push({
              keyword,
              items: Array.isArray(extracted.items)
                ? extracted.items.slice(0, MAX_RESULTS_PER_KEYWORD)
                : [],
            });
          } catch (error) {
            errors.push({ keyword, message: error?.message || String(error) });
            keywordResults.push({ keyword, items: [] });
          }
        }

        await requireRunActive(run);
        await sessions.progress(run.plan.attemptId, {
          current: run.plan.keywords.length,
          total: run.plan.keywords.length,
          completed: keywordResults.length - errors.length,
          failed: errors.length,
          label: "1688 수집 결과 저장 중",
        });
        await requireRunActive(run);
        const terminal = await terminalSubmit(run.config, run.plan, {
          keywords: keywordResults,
          errors,
        }, run);
        await requireRunActive(run);
        if (!isTerminalState(terminal.state)) {
          throw ownerError("INVALID_1688_TERMINAL", "1688 owner did not terminalize the collection.");
        }
        const terminalTabId = run.tabId;
        run.tabId = null;
        await clearTerminalAttempt(run.environmentId, run.plan.attemptId, terminalTabId);
        if (terminal.state === "FAILED") return terminalResult(terminal);
        return {
          success: true,
          attemptId: run.plan.attemptId,
          terminalState: "COMPLETE",
          collected: Number.isFinite(terminal.acceptedCount) ? terminal.acceptedCount : keywordResults.reduce(
            (sum, entry) => sum + entry.items.length,
            0,
          ),
        };
      } catch (error) {
        if (error?.code === "COLLECTION_CANCELLED" || !(await isRunActive(run))) {
          if (run.cancellation) {
            try {
              return await run.cancellation;
            } catch {
              return cancellationPendingResult(run);
            }
          }
          return cancellationPendingResult(run);
        }
        const failure = failureFrom(error, "SOURCE_COLLECTION_FAILED", "1688 collection failed.");
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
        if (!run.keepTabOpen) await removeTab(run.tabId);
      }
    }

    async function resumeOrBegin(config, environmentId, idempotencyKey) {
      const sessionsForEnvironment = (await sessions.list(environmentId))
        .filter((session) => session?.producer === PRODUCER);
      if (sessionsForEnvironment.length > 1) {
        throw ownerError("SOURCE_ATTEMPT_CORRELATION_CONFLICT", "More than one 1688 collection attempt is stored for this environment.");
      }
      const existing = sessionsForEnvironment[0];
      if (!existing) return begin(config, environmentId, idempotencyKey);
      if (!(await isAttemptActive(existing.attemptId, environmentId))) return null;

      const correlation = await storageGet(requestStorageKey(environmentId));
      if (
        !correlation
        || correlation.attemptId !== existing.attemptId
        || typeof correlation.idempotencyKey !== "string"
        || !correlation.idempotencyKey.trim()
      ) {
        return null;
      }
      return begin(config, environmentId, correlation.idempotencyKey, existing.attemptId);
    }

    function launch(environmentId, work) {
      const active = { execution: null, context: null };
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
      return launch(environmentId, async (active) => {
        const config = await getBackendRequestConfig(environmentId);
        if (!config?.ok) {
          return {
            success: false,
            terminalState: "RUNNING",
            error: config?.error || "KidItem 웹 앱에서 로그인 후 다시 시도해주세요.",
          };
        }
        const idempotencyKey = requiredText(input?.idempotencyKey, "INVALID_IDEMPOTENCY_KEY");
        const plan = await resumeOrBegin(config, environmentId, idempotencyKey);
        if (!plan) {
          return {
            success: false,
            terminalState: "RUNNING",
            errorCode: "SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING",
            error: "1688 collection is still running and can only be retried after its fixed expiry.",
          };
        }
        if (plan.state !== "RUNNING") {
          await clearTerminalAttempt(environmentId, plan.attemptId, null);
          return terminalResult(plan);
        }
        if (plan.continuable === false) {
          return {
            success: false,
            attemptId: plan.attemptId,
            terminalState: "RUNNING",
            errorCode: "SOURCE_ATTEMPT_NOT_CONTINUED",
            error: "1688 collection was not continued: the owner did not return the same attempt with a live lease.",
          };
        }
        active.context = {
          config,
          environmentId,
          plan,
          tabId: null,
          cancellation: null,
          cancelRequested: false,
          keepTabOpen: false,
        };
        return execute(active.context);
      });
    }

    async function cancel(attemptId, environmentId, options = {}) {
      const normalizedAttemptId = requiredText(attemptId, "INVALID_1688_SOURCE_ATTEMPT");
      const normalizedEnvironmentId = requiredText(environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      let cancellationRequested = options.cancellationRequested === true;
      if (!options.cancellationRequested && typeof sessions.requestCancellation === "function") {
        const alreadyStopped = !(await isAttemptActive(normalizedAttemptId, normalizedEnvironmentId));
        if (alreadyStopped) cancellationRequested = true;
        if (!alreadyStopped) {
          try {
            await sessions.requestCancellation(normalizedAttemptId, normalizedEnvironmentId);
            cancellationRequested = true;
          } catch (error) {
            console.warn("[bg] 1688 cancellation fence needs reconciliation:", error?.message || error);
          }
        }
      }
      const session = await sessions.getOwned(normalizedAttemptId, normalizedEnvironmentId);
      if (!session || session.producer !== PRODUCER) {
        return { success: true, cancelled: false, attemptId: normalizedAttemptId };
      }
      const run = activeRuns.get(normalizedEnvironmentId)?.context;
      let plan = run?.plan?.attemptId === normalizedAttemptId ? run.plan : null;
      let config = run?.config || null;
      if (!plan || !config) {
        config = await getBackendRequestConfig(normalizedEnvironmentId);
        if (!config?.ok) throw ownerError("SOURCE_OWNER_REQUEST_FAILED", config?.error || "1688 owner is unavailable.");
        const correlation = await storageGet(requestStorageKey(normalizedEnvironmentId));
        if (correlation?.attemptId !== normalizedAttemptId || typeof correlation.idempotencyKey !== "string") {
          throw ownerError("SOURCE_ATTEMPT_RECOVERY_IDENTITY_MISSING", "1688 attempt cannot be cancelled without its request identity.");
        }
        plan = await begin(config, normalizedEnvironmentId, correlation.idempotencyKey);
      }
      if (plan.state !== "RUNNING") {
        const terminalTabId = run?.tabId ?? null;
        if (run) run.tabId = null;
        if (!run && typeof sessions.requestCancellation !== "function" && typeof sessions.cancel === "function") {
          await sessions.cancel(normalizedAttemptId, { closeManagedTab: true });
          await clearRequestIdentity(normalizedEnvironmentId, normalizedAttemptId);
        } else {
          await clearTerminalAttempt(normalizedEnvironmentId, normalizedAttemptId, terminalTabId);
        }
        return {
          success: true,
          cancelled: cancellationRequested && plan.state === "FAILED",
          attemptId: normalizedAttemptId,
        };
      }
      if (run) run.cancelRequested = true;
      const cancellation = (async () => {
        const terminal = await terminalFail(
          config,
          plan,
          cancellationError(),
        );
        const terminalTabId = run?.tabId ?? null;
        if (run) run.tabId = null;
        if (!run && typeof sessions.requestCancellation !== "function" && typeof sessions.cancel === "function") {
          await sessions.cancel(normalizedAttemptId, { closeManagedTab: true });
          await clearRequestIdentity(normalizedEnvironmentId, normalizedAttemptId);
        } else {
          await clearTerminalAttempt(normalizedEnvironmentId, normalizedAttemptId, terminalTabId);
        }
        return terminalResult(terminal.terminal);
      })();
      if (run) run.cancellation = cancellation;
      await cancellation;
      return { success: true, cancelled: true, attemptId: normalizedAttemptId };
    }

    async function recover(environmentId) {
      const normalizedEnvironmentId = requiredText(environmentId, "INVALID_COLLECTION_ENVIRONMENT", 20);
      const active = activeRuns.get(normalizedEnvironmentId);
      if (active) return active.execution;
      const activeSession = (await sessions.list(normalizedEnvironmentId))
        .find((session) => session?.producer === PRODUCER);
      if (activeSession?.attention) return null;
      if (activeSession && !(await isAttemptActive(activeSession.attemptId, normalizedEnvironmentId))) return null;
      const correlation = await storageGet(requestStorageKey(normalizedEnvironmentId));
      if (!correlation?.idempotencyKey) return null;
      return run({ environmentId: normalizedEnvironmentId, idempotencyKey: correlation.idempotencyKey });
    }

    return Object.freeze({ cancel, recover, run, isVerificationUrl });
  }

  global.ProductScraper1688Trend = Object.freeze({ create });
})(globalThis);
